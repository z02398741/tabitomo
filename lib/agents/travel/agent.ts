import type { TravelAgentInput, TravelRecommendation, LatLng, PlaceCandidate } from './types'
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

export async function runTravelAgent(input: TravelAgentInput): Promise<TravelRecommendation> {
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

  const rankedSpots = rank(rawSpots, input, prefs, 10)
  const rankedRestaurants = rank(rawRestaurants, input, prefs, 10)

  const itinerary = await buildItinerary(input, rankedSpots, rankedRestaurants)

  return { itinerary, spots: rankedSpots, restaurants: rankedRestaurants }
}
