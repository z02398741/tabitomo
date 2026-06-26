import type { PlaceCandidate, LatLng } from '../types'
import { haversine } from '../geo'
import { runOverpass } from './overpass'

const RADIUS_M = 15_000
const RESTAURANT_AMENITIES = new Set([
  'restaurant', 'cafe', 'food_court', 'fast_food', 'bar', 'pub', 'izakaya_pub',
])

/**
 * Fetch spots AND restaurants in a SINGLE Overpass query, then split by
 * tag. One request avoids self-inflicted 429 rate limiting that happened
 * when spots + restaurants were fired in parallel to the same endpoint.
 */
export async function fetchPlaces(center: LatLng): Promise<{ spots: PlaceCandidate[]; restaurants: PlaceCandidate[] }> {
  const a = `(around:${RADIUS_M},${center.lat},${center.lng})`
  const query = `[out:json][timeout:15];
(
  nwr["tourism"]${a};
  nwr["historic"]${a};
  nwr["natural"~"^(peak|beach|volcano|hot_spring|bay|cape)$"]${a};
  nwr["leisure"~"^(park|garden|nature_reserve)$"]${a};
  nwr["amenity"~"^(restaurant|cafe|food_court|fast_food|bar|pub|izakaya_pub)$"]${a};
);
out body center;`

  const raw = await runOverpass(query)
  const spots: PlaceCandidate[] = []
  const restaurants: PlaceCandidate[] = []

  for (const el of raw) {
    const name: string = el.tags?.['name:ja'] || el.tags?.name || el.tags?.['name:en']
    if (!name) continue
    const lat: number = el.type === 'node' ? el.lat : el.center?.lat
    const lng: number = el.type === 'node' ? el.lon : el.center?.lon
    if (!lat || !lng) continue
    const tags: string[] = Object.entries(el.tags ?? {}).map(([k, v]) => `${k}=${v}`)
    const rawRating = parseFloat(el.tags?.stars ?? el.tags?.rating ?? '')
    const amenity: string | undefined = el.tags?.amenity
    const isRestaurant = amenity && RESTAURANT_AMENITIES.has(amenity)
    const candidate: PlaceCandidate = {
      id: String(el.id),
      name,
      category: isRestaurant
        ? amenity!
        : (el.tags?.tourism || el.tags?.historic || el.tags?.natural || el.tags?.leisure || 'sight'),
      latLng: { lat, lng },
      tags,
      rating: isNaN(rawRating) ? undefined : Math.min(rawRating, 5),
      distanceKm: haversine(center.lat, center.lng, lat, lng),
    }
    if (isRestaurant) restaurants.push(candidate)
    else spots.push(candidate)
  }

  console.log(`[travel] fetchPlaces: ${raw.length} raw -> ${spots.length} spots, ${restaurants.length} restaurants`)
  return { spots, restaurants }
}
