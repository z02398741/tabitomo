import { createClient } from '@supabase/supabase-js'
import type { Trip, TripDay, Event } from '@/types'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getTrips(userId: string): Promise<Trip[]> {
  const supabase = getAdmin()
  const { data, error } = await supabase
    .from('trip_members')
    .select(`
      trip_id,
      role,
      trips (
        id, title, members, budget, transport,
        line_group_id, created_by, created_at,
        days:trip_days(id, date, label, position)
      )
    `)
    .eq('user_id', userId)

  if (error) {
    console.error('getTrips error:', error)
    throw error
  }
  return data?.map((d: any) => d.trips).filter(Boolean) || []
}

export async function getTrip(tripId: string): Promise<Trip | null> {
  const supabase = getAdmin()
  const { data, error } = await supabase
    .from('trips')
    .select(`
      *,
      days:trip_days (
        *,
        events (
          *,
          tickets (id, name)
        )
      )
    `)
    .eq('id', tripId)
    .single()

  if (error) {
    console.error('getTrip error:', error)
    throw error
  }
  return data
}

export async function createTrip(trip: Partial<Trip>, userId: string) {
  const supabase = getAdmin()
  const { data, error } = await supabase
    .from('trips')
    .insert({ ...trip, created_by: userId })
    .select()
    .single()

  if (error) throw error

  await supabase.from('trip_members').insert({
    trip_id: data.id,
    user_id: userId,
    role: 'owner',
  })

  return data
}

export async function addDay(day: Partial<TripDay>) {
  const supabase = getAdmin()
  const { data, error } = await supabase
    .from('trip_days')
    .insert(day)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function addEvent(event: Partial<Event>) {
  const supabase = getAdmin()
  const { data, error } = await supabase
    .from('events')
    .insert(event)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateEvent(id: string, event: Partial<Event>) {
  const supabase = getAdmin()
  const { data, error } = await supabase
    .from('events')
    .update(event)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteEvent(id: string) {
  const supabase = getAdmin()
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function updateDay(id: string, patch: Partial<Pick<TripDay, 'label' | 'date'>>) {
  const supabase = getAdmin()
  const { data, error } = await supabase
    .from('trip_days')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteDay(id: string) {
  const supabase = getAdmin()
  const { error } = await supabase
    .from('trip_days')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function deleteTrip(id: string) {
  const supabase = getAdmin()
  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function reorderDays(ids: string[]) {
  const supabase = getAdmin()
  const updates = ids.map((id, i) => ({ id, position: i }))
  const { error } = await supabase
    .from('trip_days')
    .upsert(updates, { onConflict: 'id' })
  if (error) throw error
}
