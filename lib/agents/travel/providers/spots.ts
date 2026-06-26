import type { PlaceCandidate, LatLng } from '../types'
import { haversine } from '../geo'

const RADIUS_M = 15_000
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

export async function fetchSpots(center: LatLng): Promise<PlaceCandidate[]> {
  // Broad coverage: any tourism POI, plus historic sites, notable nature
  // (peaks/beaches/volcanoes/hot springs), and parks/gardens. Keeps
  // results meaningful even on sparsely-mapped rural areas / islands.
  const query = `[out:json][timeout:25];
(
  nwr["tourism"](around:${RADIUS_M},${center.lat},${center.lng});
  nwr["historic"](around:${RADIUS_M},${center.lat},${center.lng});
  nwr["natural"~"^(peak|beach|volcano|hot_spring|bay|cape)$"](around:${RADIUS_M},${center.lat},${center.lng});
  nwr["leisure"~"^(park|garden|nature_reserve)$"](around:${RADIUS_M},${center.lat},${center.lng});
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
      console.warn('[travel] fetchSpots overpass status', res.status)
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
      const category = el.tags?.tourism || el.tags?.historic || el.tags?.natural || el.tags?.leisure || 'sight'
      return [{
        id: String(el.id),
        name,
        category,
        latLng: { lat, lng },
        tags,
        rating: isNaN(rawRating) ? undefined : Math.min(rawRating, 5),
        distanceKm: haversine(center.lat, center.lng, lat, lng),
      }]
    })
    console.log(`[travel] fetchSpots: ${raw.length} raw, ${out.length} named`)
    return out
  } catch (e: any) {
    console.warn('[travel] fetchSpots error:', e?.message)
    return []
  }
}
