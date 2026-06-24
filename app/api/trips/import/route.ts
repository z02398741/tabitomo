import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any).id
  const body = await req.json()
  const supabase = getAdmin()

  // 旅行作成
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .insert({
      title:       body.title,
      members:     body.members,
      budget:      body.budget,
      transport:   body.transport,
      destination: body.destination ?? null,
      created_by:  userId,
    })
    .select()
    .single()

  if (tripError) return NextResponse.json({ error: tripError.message }, { status: 500 })

  // オーナー追加
  await supabase.from('trip_members').insert({
    trip_id: trip.id,
    user_id: userId,
    role: 'owner',
  })

  // 日程・イベント追加
  for (let i = 0; i < body.days.length; i++) {
    const day = body.days[i]
    const { data: dayData } = await supabase
      .from('trip_days')
      .insert({
        trip_id:  trip.id,
        label:    day.label,
        date:     day.date || null,
        position: i,
      })
      .select()
      .single()

    if (dayData && day.events?.length > 0) {
      await supabase.from('events').insert(
        day.events.map((ev: any) => ({
          day_id:    dayData.id,
          time:      ev.time,
          title:     ev.title,
          type:      ev.type,
          note:      ev.note || '',
          location:  ev.location ?? null,
          cost:      ev.cost != null ? Number(ev.cost) : null,
          alert_min: ev.alert_min || 0,
        }))
      )
    }
  }

  return NextResponse.json(trip)
}
