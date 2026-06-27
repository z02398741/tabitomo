import { adminClient } from '@/lib/supabase/admin'
import type { PlaceCandidate, LatLng } from '../types'

const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface CachedPlaces {
  spots: PlaceCandidate[]
  restaurants: PlaceCandidate[]
  center?: LatLng
}

export function placeCacheKey(destination: string): string {
  return destination.trim().toLowerCase().slice(0, 200)
}

export async function getCachedPlaces(key: string): Promise<CachedPlaces | null> {
  const { data, error } = await adminClient
    .from('place_cache')
    .select('data, expires_at')
    .eq('destination', key)
    .maybeSingle()
  if (error) { console.warn('[travel] getCachedPlaces error:', error.message); return null }
  if (!data) return null
  if (new Date(data.expires_at) < new Date()) return null
  return data.data as CachedPlaces
}

export async function setCachedPlaces(key: string, places: CachedPlaces): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  const { error } = await adminClient
    .from('place_cache')
    .upsert({ destination: key, data: places, expires_at: expiresAt })
  if (error) console.warn('[travel] setCachedPlaces error:', error.message)
}
