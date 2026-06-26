import type { PlaceCandidate, LatLng } from '../types'
import { haversine } from '../geo'
import { runOverpass } from './overpass'

const RADIUS_M = 15_000

export async function fetchRestaurants(center: LatLng): Promise<PlaceCandidate[]> {
  const query = `[out:json][timeout:18];
(
  nwr["amenity"~"^(restaurant|cafe|food_court|fast_food|bar|pub|izakaya_pub)$"](around:${RADIUS_M},${center.lat},${center.lng});
);
out body center;`

  const raw = await runOverpass(query)
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
}
