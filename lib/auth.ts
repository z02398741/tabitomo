import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Returns true if userId is a member (any role) of tripId
export async function isTripMember(tripId: string, userId: string): Promise<boolean> {
  const { data } = await getAdmin()
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .single()
  return !!data
}

// Resolves trip_id from a day_id (looks up trip_days)
export async function tripIdFromDay(dayId: string): Promise<string | null> {
  const { data } = await getAdmin()
    .from('trip_days')
    .select('trip_id')
    .eq('id', dayId)
    .single()
  return data?.trip_id ?? null
}

// Resolves trip_id from an event_id (looks up events → trip_days)
export async function tripIdFromEvent(eventId: string): Promise<string | null> {
  const { data } = await getAdmin()
    .from('events')
    .select('day_id, trip_days(trip_id)')
    .eq('id', eventId)
    .single()
  const td = data?.trip_days as unknown as { trip_id: string } | null
  return td?.trip_id ?? null
}
