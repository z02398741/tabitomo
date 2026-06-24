import { adminClient } from '@/lib/supabase/admin'
import type { TravelPreference, BudgetLevel } from '../types'

export async function getPreferences(userId: string): Promise<TravelPreference[]> {
  const { data, error } = await adminClient
    .from('travel_preferences')
    .select('user_id, destination, tags, budget')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) { console.error('[travel] getPreferences error:', error.message); return [] }
  return (data ?? []).map(r => ({
    userId: r.user_id,
    destination: r.destination,
    tags: r.tags ?? [],
    budget: r.budget as BudgetLevel,
  }))
}

export async function savePreference(pref: Omit<TravelPreference, never>): Promise<void> {
  const { error } = await adminClient
    .from('travel_preferences')
    .insert({
      user_id: pref.userId,
      destination: pref.destination,
      tags: pref.tags,
      budget: pref.budget,
    })
  if (error) console.error('[travel] savePreference error:', error.message)
}
