import type { PlaceCandidate, LatLng } from '../types'
import { haversine } from '../geo'

const RADIUS_M = 15_000
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

export async function fetchSpots(center: LatLng): Promise<PlaceCandidate[]> {
  const query = `[out:json][timeout:25];
(
  node["tourism"~"^(attraction|museum|castle|shrine|temple|park|historic)$"](around:${RADIUS_M},${center.lat},${center.lng});
  way["tourism"~"^(attraction|museum|castle|shrine|temple|park|historic)$"](around:${RADIUS_M},${center.lat},${center.lng});
);
out body center;`

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.elements ?? []).flatMap((el: any): PlaceCandidate[] => {
      const name: string = el.tags?.['name:ja'] || el.tags?.name
      if (!name) return []
      const lat: number = el.type === 'way' ? el.center?.lat : el.lat
      const lng: number = el.type === 'way' ? el.center?.lon : el.lon
      if (!lat || !lng) return []
      const tags: string[] = Object.entries(el.tags ?? {}).map(([k, v]) => `${k}=${v}`)
      const rawRating = parseFloat(el.tags?.stars ?? el.tags?.rating ?? '')
      return [{
        id: String(el.id),
        name,
        category: el.tags?.tourism ?? 'sight',
        latLng: { lat, lng },
        tags,
        rating: isNaN(rawRating) ? undefined : Math.min(rawRating, 5),
        distanceKm: haversine(center.lat, center.lng, lat, lng),
      }]
    })
  } catch {
    return []
  }
}
