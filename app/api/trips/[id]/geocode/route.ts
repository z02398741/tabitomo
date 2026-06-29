import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'
import { isTripMember } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

// Geocoding several venues can take a while (Nominatim politeness delay).
export const maxDuration = 60

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Generic activities with no real venue — never geocode (the bare word
// resolves to random places, e.g. "早餐" → China).
const GENERIC = /^(朝食|昼食|夕食|朝ご?はん|昼ご?はん|晩ご?はん|早餐|午餐|晚餐|早午餐|ランチ|ディナー|ブランチ|モーニング|食事|お昼|休憩|自由時間|フリータイム|集合|解散|出発|到着|チェックイン|チェックアウト|買い物|散策|移動|宿泊|起床|就寝)/

// Coarse Nominatim results we reject (island / city / admin centroids) so
// a vague query doesn't collapse to the destination's center.
const COARSE_TYPES = new Set([
  'island', 'islet', 'archipelago', 'city', 'town', 'village', 'hamlet',
  'municipality', 'county', 'state', 'region', 'province', 'country',
  'suburb', 'locality', 'district', 'administrative',
])

interface GeoResult { lat: number; lng: number; coarse: boolean }

async function geocode(query: string, viewbox?: string): Promise<GeoResult | null> {
  try {
    const vb = viewbox ? `&viewbox=${viewbox}&bounded=1` : ''
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1&accept-language=ja${vb}`
    const res = await fetch(url, { headers: { 'User-Agent': 'Tabitomo/1.0 (trip-map)' }, signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const data = await res.json()
    const r = data?.[0]
    if (!r) return null
    const coarse = r.class === 'boundary' || (r.class === 'place' && COARSE_TYPES.has(r.type)) || COARSE_TYPES.has(r.addresstype)
    return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), coarse }
  } catch {
    return null
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const userId = (session.user as any).id
  if (!(await isTripMember(id, userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // force=1 re-geocodes every event (ignoring stored coords + cache) and
  // clears coordinates that no longer resolve — used by the "再定位" button.
  const force = new URL(req.url).searchParams.get('force') === '1'

  const supabase = getAdmin()
  const { data: trip } = await supabase
    .from('trips')
    .select('destination, days:trip_days(events(id, title, location, lat, lng))')
    .eq('id', id)
    .single()
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const destination: string = (trip as any).destination || ''
  const events: any[] = ((trip as any).days ?? []).flatMap((d: any) => d.events ?? [])

  // Resolve destination center → a viewbox to constrain venue searches to
  // the area (prevents far-off matches and island-centroid collapse).
  let viewbox: string | undefined
  if (destination) {
    const c = await geocode(destination)
    await sleep(300)
    if (c) {
      const pad = 0.7   // ~70km box around the destination center
      viewbox = `${c.lng - pad},${c.lat + pad},${c.lng + pad},${c.lat - pad}`
    }
  }

  const coords: Record<string, { lat: number; lng: number }> = {}
  let calls = 0
  for (const ev of events) {
    const title = (ev.title || '').trim()
    const location = (ev.location || '').trim()
    const isGeneric = !location && GENERIC.test(title)

    // Generic activity with no venue → not on the map; clear stale coords.
    if (isGeneric) {
      if (ev.lat != null || ev.lng != null) {
        await supabase.from('events').update({ lat: null, lng: null }).eq('id', ev.id)
      }
      continue
    }

    const hadCoords = ev.lat != null && ev.lng != null
    if (!force && hadCoords) { coords[ev.id] = { lat: ev.lat, lng: ev.lng }; continue }

    // Prefer a real venue (location); fall back to the title.
    const base = (location || title).replace(/\s+/g, ' ').trim()
    if (!base || calls >= 60) { if (!force && hadCoords) coords[ev.id] = { lat: ev.lat, lng: ev.lng }; continue }
    const key = `${base}|${viewbox ?? ''}`.toLowerCase().slice(0, 250)

    const { data: cached } = force
      ? { data: null }
      : await supabase.from('geocode_cache').select('lat, lng').eq('query', key).maybeSingle()
    let hit = cached as { lat: number; lng: number } | null
    if (!hit) {
      calls++
      const g = await geocode(base, viewbox)
      await sleep(300)
      if (g && !g.coarse) {                       // skip island/city-level matches
        hit = { lat: g.lat, lng: g.lng }
        await supabase.from('geocode_cache').upsert({ query: key, lat: g.lat, lng: g.lng })
      }
    }
    if (hit) {
      coords[ev.id] = { lat: hit.lat, lng: hit.lng }
      await supabase.from('events').update({ lat: hit.lat, lng: hit.lng }).eq('id', ev.id)
    } else if (force && hadCoords) {
      // re-geocode failed → drop the now-invalid stored coordinate
      await supabase.from('events').update({ lat: null, lng: null }).eq('id', ev.id)
    }
  }

  return NextResponse.json({ coords })
}
