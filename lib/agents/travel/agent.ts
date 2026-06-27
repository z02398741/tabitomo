import type { TravelAgentInput, TravelRecommendation, LatLng, PlaceCandidate, RankedCandidate } from './types'
import { fetchPlaces } from './providers/places'
import { getPreferences } from './memory/preferences'
import { getCachedPlaces, setCachedPlaces, placeCacheKey } from './memory/placeCache'
import { rank } from './ranking'
import { buildItinerary } from './planner'
import { getWeatherByCoords, type DayWeather } from '@/lib/weather'

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Build a per-day weather block for the prompt so the planner can move
// outdoor plans indoors on rainy days. Empty string when unavailable.
async function buildWeatherHint(center: LatLng | undefined, startDate: string | undefined, days: number): Promise<string> {
  if (!center || !startDate) return ''
  const forecast: Record<string, DayWeather> = await getWeatherByCoords(center.lat, center.lng).catch(() => ({}))
  const lines: string[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i)
    const w = forecast[date]
    if (!w) continue
    const rainy = w.pop >= 60
    lines.push(`- Day${i + 1} (${date}): ${w.emoji}${w.label} / 最高${w.tmax}℃ 最低${w.tmin}℃ / 降水確率${w.pop}%${rainy ? ' → 屋内中心の予定を推奨' : ''}`)
  }
  if (lines.length === 0) return ''
  return `\n\n## 天気予報（降水確率が高い日は屋内スポットを優先）\n${lines.join('\n')}`
}

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

// Resolve coords for a destination that may list several places
// (e.g. "広島・宮島・尾道・福山・世羅"): try the full string first, then
// each segment until one geocodes. Uses the first segment as the center.
async function resolvePlaceCoords(destination: string, japanOnly = false): Promise<LatLng | null> {
  const candidates = [destination, ...destination.split(/[・、,，/／·]+/)]
    .map(s => s.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  for (const c of candidates) {
    if (seen.has(c)) continue
    seen.add(c)
    const r = await resolveCoords(c, japanOnly)
    if (r) return r
  }
  return null
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
async function fetchRawCandidates(input: TravelAgentInput): Promise<{ spots: PlaceCandidate[]; restaurants: PlaceCandidate[]; center?: LatLng }> {
  const fromInput = input.lat != null && input.lng != null
  let coords: LatLng | null = fromInput
    ? { lat: input.lat!, lng: input.lng! }
    : await resolvePlaceCoords(input.destination)

  let raw: { spots: PlaceCandidate[]; restaurants: PlaceCandidate[] } = { spots: [], restaurants: [] }
  if (coords) raw = await fetchAround(coords)

  // Geocoding fallback: when a name resolved to a place with no nearby
  // POIs (ambiguous name like "大島" landing on the wrong/ocean spot),
  // retry constrained to Japan and re-fetch.
  if (!fromInput && raw.spots.length === 0 && raw.restaurants.length === 0) {
    const jpCoords = await resolvePlaceCoords(input.destination, true)
    if (jpCoords && (jpCoords.lat !== coords?.lat || jpCoords.lng !== coords?.lng)) {
      coords = jpCoords
      raw = await fetchAround(jpCoords)
    }
  }
  return { ...raw, center: coords ?? undefined }
}

export async function getRankedCandidates(
  input: TravelAgentInput,
): Promise<{ spots: RankedCandidate[]; restaurants: RankedCandidate[]; center?: LatLng }> {
  // Cache the raw candidates per destination (skip cache when explicit
  // coords are passed). Ranking still runs per-request so personalization
  // stays fresh.
  const cacheKey = input.lat == null ? placeCacheKey(input.destination) : null

  let raw: { spots: PlaceCandidate[]; restaurants: PlaceCandidate[]; center?: LatLng } | null = null
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
    center: raw.center ?? (input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : undefined),
  }
}

export async function runTravelAgent(input: TravelAgentInput): Promise<TravelRecommendation> {
  const { spots, restaurants, center } = await getRankedCandidates(input)
  const weatherHint = await buildWeatherHint(center, input.startDate, input.durationDays)
  const itinerary = await buildItinerary(input, spots, restaurants, weatherHint)
  return { itinerary, spots, restaurants }
}
