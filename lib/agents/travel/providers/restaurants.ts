import type { PlaceCandidate, LatLng } from '../types'
import { haversine } from '../geo'

const RADIUS_M = 15_000
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

export async function fetchRestaurants(center: LatLng): Promise<PlaceCandidate[]> {
  const query = `[out:json][timeout:25];
(
  nwr["amenity"~"^(restaurant|cafe|food_court|fast_food|bar|pub|izakaya_pub)$"](around:${RADIUS_M},${center.lat},${center.lng});
);
out body center;`

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      console.warn('[travel] fetchRestaurants overpass status', res.status)
      return []
    }
    const json = await res.json()
    const raw = json.elements ?? []
    const out = raw.flatMap((el: any): PlaceCandidate[] => {
      const name: string = el.tags?.['name:ja'] || el.tags?.name || el.tags?.['name:en']
      if (!name) return []
      const lat: number = el.type === 'node' ? el.lat : el.center?.lat
      const lng: number = el.type === 'node' ? el.lon : el.center?.lon
      if (!lat || !lng) return []
      const tags: string[] = Object.entries(el.tags ?? {}).map(([k, v]) => `${k}=${v}`)
      const rawRating = parseFloat(el.tags?.stars ?? el.tags?.rating ?? '')
      return [{
        id: String(el.id),
        name,
        category: el.tags?.amenity ?? 'restaurant',
        latLng: { lat, lng },
        tags,
        rating: isNaN(rawRating) ? undefined : Math.min(rawRating, 5),
        distanceKm: haversine(center.lat, center.lng, lat, lng),
      }]
    })
    console.log(`[travel] fetchRestaurants: ${raw.length} raw, ${out.length} named`)
    return out
  } catch (e: any) {
    console.warn('[travel] fetchRestaurants error:', e?.message)
    return []
  }
}
