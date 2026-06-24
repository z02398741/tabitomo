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

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const userId = (session.user as any).id
  const supabase = getAdmin()

  const { data: member } = await supabase
    .from('trip_members')
    .select('role')
    .eq('trip_id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: original } = await supabase
    .from('trips')
    .select('*, days:trip_days(*, events(*))')
    .eq('id', id)
    .single()
  if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: newTrip, error: tripErr } = await supabase
    .from('trips')
    .insert({
      title:       `${original.title} コピー`,
      members:     original.members,
      budget:      original.budget,
      transport:   original.transport,
      destination: original.destination ?? null,
      created_by:  userId,
    })
    .select()
    .single()
  if (tripErr || !newTrip) return NextResponse.json({ error: tripErr?.message }, { status: 500 })

  await supabase.from('trip_members').insert({ trip_id: newTrip.id, user_id: userId, role: 'owner' })

  const days = [...(original.days ?? [])].sort((a: any, b: any) => a.position - b.position)
  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    const { data: newDay } = await supabase
      .from('trip_days')
      .insert({ trip_id: newTrip.id, label: day.label, date: day.date, position: i })
      .select()
      .single()
    if (newDay && day.events?.length) {
      await supabase.from('events').insert(
        day.events.map((ev: any) => ({
          day_id: newDay.id, time: ev.time, title: ev.title,
          type: ev.type, note: ev.note, location: ev.location ?? null,
          cost: ev.cost ?? null, alert_min: ev.alert_min,
        }))
      )
    }
  }

  return NextResponse.json(newTrip)
}
