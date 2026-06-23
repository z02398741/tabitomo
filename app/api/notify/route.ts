import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function pushLine(to: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text }],
    }),
  })
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdmin()
  const now = new Date()

  const { data: trips } = await supabase
    .from('trips')
    .select(`
      id, title, line_group_id,
      days:trip_days(
        id, date,
        events(id, time, title, type, note, alert_min, notified_at)
      )
    `)
    .not('line_group_id', 'is', null)

  if (!trips?.length) {
    return NextResponse.json({ ok: true, checked: 0 })
  }

  let notified = 0

  for (const trip of trips) {
    if (!trip.line_group_id) continue

    for (const day of trip.days || []) {
      if (!day.date) continue

      for (const ev of day.events || []) {
        if (!ev.alert_min || ev.notified_at) continue

        const [h, m] = ev.time.split(':').map(Number)
        const eventAt = new Date(`${day.date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`)
        const alertAt = new Date(eventAt.getTime() - ev.alert_min * 60 * 1000)

        const diff = Math.abs(now.getTime() - alertAt.getTime())
        if (diff > 60 * 1000) continue

        const icon: Record<string, string> = {
          transport:'🚢', gather:'📍', activity:'🤿',
          meal:'🍽', stay:'🏨', free:'🌊'
        }
        const text = [
          `⏰ ${ev.alert_min}分後に予定があります！`,
          `${icon[ev.type]||'•'} ${ev.time} ${ev.title}`,
          ev.note ? `📝 ${ev.note}` : '',
        ].filter(Boolean).join('\n')

        await pushLine(trip.line_group_id, text)

        await supabase
          .from('events')
          .update({ notified_at: now.toISOString() })
          .eq('id', ev.id)

        notified++
        console.log(`Notified: ${ev.title} (${trip.title})`)
      }
    }
  }

  return NextResponse.json({ ok: true, notified })
}
