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
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  })
}

const EVENT_ICON: Record<string, string> = {
  transport: '🚢', gather: '📍', activity: '🤿',
  meal: '🍽', stay: '🏨', free: '🌊',
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdmin()
  const now = new Date()

  // JST offset for date calculation
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const todayJST = jst.toISOString().split('T')[0]
  const tomorrowJST = new Date(jst.getTime() + 86_400_000).toISOString().split('T')[0]

  // Step 1: fetch only days that are today or tomorrow (JST), skipping all other trips
  const { data: days } = await supabase
    .from('trip_days')
    .select('id, date, trip_id')
    .in('date', [todayJST, tomorrowJST])

  if (!days?.length) return NextResponse.json({ ok: true, notified: 0 })

  const tripIds = [...new Set(days.map((d: { trip_id: string }) => d.trip_id))]

  // Step 2: fetch only LINE-linked trips among those
  const { data: trips } = await supabase
    .from('trips')
    .select('id, title, line_group_id')
    .in('id', tripIds)
    .not('line_group_id', 'is', null)

  if (!trips?.length) return NextResponse.json({ ok: true, notified: 0 })

  const tripMap = Object.fromEntries(
    (trips as { id: string; title: string; line_group_id: string }[]).map(t => [t.id, t])
  )
  const validTripIds = new Set(Object.keys(tripMap))
  const validDayIds = days
    .filter((d: { trip_id: string }) => validTripIds.has(d.trip_id))
    .map((d: { id: string }) => d.id)
  const dayMeta = Object.fromEntries(
    days.map((d: { id: string; date: string; trip_id: string }) => [d.id, d])
  )

  // Step 3: fetch only pending alert events for those days
  const { data: events } = await supabase
    .from('events')
    .select('id, time, title, type, note, alert_min, day_id')
    .in('day_id', validDayIds)
    .gt('alert_min', 0)
    .is('notified_at', null)

  if (!events?.length) return NextResponse.json({ ok: true, notified: 0 })

  // Step 4: filter by ±1 minute window in JS, collect notifications
  const notifiedIds: string[] = []
  const pushTasks: Promise<void>[] = []

  for (const ev of events as { id: string; time: string; title: string; type: string; note: string | null; alert_min: number; day_id: string }[]) {
    const { date, trip_id } = dayMeta[ev.day_id]
    const trip = tripMap[trip_id]
    if (!trip) continue

    const [h, m] = ev.time.split(':').map(Number)
    // Treat stored time as JST
    const eventAt = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`)
    const alertAt = new Date(eventAt.getTime() - ev.alert_min * 60_000)

    if (Math.abs(now.getTime() - alertAt.getTime()) > 60_000) continue

    const text = [
      `⏰ ${ev.alert_min}分後に予定があります！`,
      `${EVENT_ICON[ev.type] ?? '•'} ${ev.time} ${ev.title}`,
      ev.note ? `📝 ${ev.note}` : '',
    ].filter(Boolean).join('\n')

    pushTasks.push(pushLine(trip.line_group_id, text))
    notifiedIds.push(ev.id)
    console.log(`Notified: ${ev.title} (${trip.title})`)
  }

  // Step 5: push all LINE messages in parallel, then batch-update notified_at
  await Promise.all(pushTasks)

  if (notifiedIds.length > 0) {
    await supabase
      .from('events')
      .update({ notified_at: now.toISOString() })
      .in('id', notifiedIds)
  }

  return NextResponse.json({ ok: true, notified: notifiedIds.length })
}
