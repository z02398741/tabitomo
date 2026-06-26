import type { TravelAgentInput, TravelRecommendation, LatLng, PlaceCandidate, RankedCandidate } from './types'
import { fetchSpots } from './providers/spots'
import { fetchRestaurants } from './providers/restaurants'
import { getPreferences } from './memory/preferences'
import { rank } from './ranking'
import { buildItinerary } from './planner'

async function resolveCoords(destination: string): Promise<LatLng | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(destination)}&format=json&limit=1&accept-language=ja`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Tabitomo/1.0' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.[0]) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

/**
 * Fetch and rank real place candidates (spots + restaurants) without
 * calling Gemini. Used by the recommendations panel, which only needs
 * the place lists and must return fast.
 */
export async function getRankedCandidates(
  input: TravelAgentInput,
): Promise<{ spots: RankedCandidate[]; restaurants: RankedCandidate[] }> {
  const coords: LatLng | null =
    input.lat != null && input.lng != null
      ? { lat: input.lat, lng: input.lng }
      : await resolveCoords(input.destination)

  let rawSpots: PlaceCandidate[] = []
  let rawRestaurants: PlaceCandidate[] = []

  if (coords) {
    const [spotsResult, restaurantsResult] = await Promise.allSettled([
      fetchSpots(coords),
      fetchRestaurants(coords),
    ])
    rawSpots = spotsResult.status === 'fulfilled' ? spotsResult.value : []
    rawRestaurants = restaurantsResult.status === 'fulfilled' ? restaurantsResult.value : []
  }

  const prefs = input.userId ? await getPreferences(input.userId).catch(() => []) : []

  return {
    spots: rank(rawSpots, input, prefs, 10),
    restaurants: rank(rawRestaurants, input, prefs, 10),
  }
}

export async function runTravelAgent(input: TravelAgentInput): Promise<TravelRecommendation> {
  const { spots, restaurants } = await getRankedCandidates(input)
  const itinerary = await buildItinerary(input, spots, restaurants)
  return { itinerary, spots, restaurants }
}
