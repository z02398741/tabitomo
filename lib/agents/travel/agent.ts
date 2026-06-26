import type { TravelAgentInput, TravelRecommendation, LatLng, PlaceCandidate, RankedCandidate } from './types'
import { fetchPlaces } from './providers/places'
import { getPreferences } from './memory/preferences'
import { getCachedPlaces, setCachedPlaces, placeCacheKey } from './memory/placeCache'
import { rank } from './ranking'
import { buildItinerary } from './planner'

async function resolveCoords(destination: string, japanOnly = false): Promise<LatLng | null> {
  try {
    const jp = japanOnly ? '&countrycodes=jp' : ''
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination)}&format=json&limit=1&accept-language=ja${jp}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Tabitomo/1.0 (travel-agent)' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) {
      console.warn('[travel] nominatim status', res.status, 'for', destination)
      return null
    }
    const data = await res.json()
    if (!data?.[0]) {
      console.warn(`[travel] nominatim no match for "${destination}"${japanOnly ? ' (jp)' : ''}`)
      return null
    }
    console.log(`[travel] geocoded "${destination}"${japanOnly ? ' (jp)' : ''} -> ${data[0].display_name} (${data[0].lat},${data[0].lon})`)
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch (e: any) {
    console.warn('[travel] nominatim error:', e?.message)
    return null
  }
}

async function fetchAround(coords: LatLng): Promise<{ spots: PlaceCandidate[]; restaurants: PlaceCandidate[] }> {
  try {
    return await fetchPlaces(coords)
  } catch {
    return { spots: [], restaurants: [] }
  }
}

/**
 * Fetch and rank real place candidates (spots + restaurants) without
 * calling Gemini. Used by the recommendations panel, which only needs
 * the place lists and must return fast.
 */
// Geocode + Overpass fetch (the network-expensive part), with the
// Japan-biased retry for ambiguous names. No caching, no ranking.
async function fetchRawCandidates(input: TravelAgentInput): Promise<{ spots: PlaceCandidate[]; restaurants: PlaceCandidate[] }> {
  const fromInput = input.lat != null && input.lng != null
  let coords: LatLng | null = fromInput
    ? { lat: input.lat!, lng: input.lng! }
    : await resolveCoords(input.destination)

  let raw: { spots: PlaceCandidate[]; restaurants: PlaceCandidate[] } = { spots: [], restaurants: [] }
  if (coords) raw = await fetchAround(coords)

  // Geocoding fallback: when a name resolved to a place with no nearby
  // POIs (ambiguous name like "大島" landing on the wrong/ocean spot),
  // retry constrained to Japan and re-fetch.
  if (!fromInput && raw.spots.length === 0 && raw.restaurants.length === 0) {
    const jpCoords = await resolveCoords(input.destination, true)
    if (jpCoords && (jpCoords.lat !== coords?.lat || jpCoords.lng !== coords?.lng)) {
      raw = await fetchAround(jpCoords)
    }
  }
  return raw
}

export async function getRankedCandidates(
  input: TravelAgentInput,
): Promise<{ spots: RankedCandidate[]; restaurants: RankedCandidate[] }> {
  // Cache the raw candidates per destination (skip cache when explicit
  // coords are passed). Ranking still runs per-request so personalization
  // stays fresh.
  const cacheKey = input.lat == null ? placeCacheKey(input.destination) : null

  let raw: { spots: PlaceCandidate[]; restaurants: PlaceCandidate[] } | null = null
  if (cacheKey) raw = await getCachedPlaces(cacheKey).catch(() => null)

  if (raw) {
    console.log(`[travel] place cache hit for "${cacheKey}"`)
  } else {
    raw = await fetchRawCandidates(input)
    if (cacheKey && (raw.spots.length > 0 || raw.restaurants.length > 0)) {
      await setCachedPlaces(cacheKey, raw).catch(() => {})
    }
  }

  const prefs = input.userId ? await getPreferences(input.userId).catch(() => []) : []

  return {
    spots: rank(raw.spots, input, prefs, 10),
    restaurants: rank(raw.restaurants, input, prefs, 10),
  }
}

export async function runTravelAgent(input: TravelAgentInput): Promise<TravelRecommendation> {
  const { spots, restaurants } = await getRankedCandidates(input)
  const itinerary = await buildItinerary(input, spots, restaurants)
  return { itinerary, spots, restaurants }
}
