// Shared Overpass API caller. Tries the main endpoint then a mirror,
// with explicit headers (some front-ends return 406 without a proper
// User-Agent / Accept). Never throws — returns [] on total failure.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

export async function runOverpass(query: string): Promise<any[]> {
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'Tabitomo/1.0 (group travel planner)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(18_000),
      })
      if (!res.ok) {
        console.warn('[travel] overpass status', res.status, 'at', url)
        continue
      }
      const json = await res.json()
      return json.elements ?? []
    } catch (e: any) {
      console.warn('[travel] overpass error at', url, '-', e?.message)
    }
  }
  return []
}
