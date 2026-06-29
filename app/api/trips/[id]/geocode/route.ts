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

// Generic activities with no real venue — don't geocode (the bare word
// resolves to random far-away places, e.g. "早餐" → China).
const GENERIC = /^(朝食|昼食|夕食|朝ご?はん|昼ご?はん|晩ご?はん|早餐|午餐|晚餐|早午餐|ランチ|ディナー|ブランチ|モーニング|食事|お昼|休憩|自由時間|フリータイム|集合|解散|出発|到着|チェックイン|チェックアウト|買い物|散策|移動|宿泊|起床|就寝)/

async function geocodeDetailed(query: string): Promise<{ lat: number; lng: number; country?: string } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1&accept-language=ja`
    const res = await fetch(url, { headers: { 'User-Agent': 'Tabitomo/1.0 (trip-map)' }, signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.[0]) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), country: data[0].address?.country_code }
  } catch {
    return null
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const userId = (session.user as any).id
  if (!(await isTripMember(id, userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getAdmin()
  const { data: trip } = await supabase
    .from('trips')
    .select('destination, days:trip_days(events(id, title, location, lat, lng))')
    .eq('id', id)
    .single()
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const destination: string = (trip as any).destination || ''
  const events: any[] = ((trip as any).days ?? []).flatMap((d: any) => d.events ?? [])

  // Country of the destination — used to reject far-off geocodes.
  let destCountry: string | undefined
  if (destination) {
    const d = await geocodeDetailed(destination)
    destCountry = d?.country
    await sleep(300)
  }

  const coords: Record<string, { lat: number; lng: number }> = {}
  let calls = 0
  for (const ev of events) {
    const title = (ev.title || '').trim()
    const location = (ev.location || '').trim()
    const isGeneric = !location && GENERIC.test(title)

    // Generic activity with no venue → must not be on the map.
    // Also clean any previously-stored bad coordinate.
    if (isGeneric) {
      if (ev.lat != null || ev.lng != null) {
        await supabase.from('events').update({ lat: null, lng: null }).eq('id', ev.id)
      }
      continue
    }

    if (ev.lat != null && ev.lng != null) { coords[ev.id] = { lat: ev.lat, lng: ev.lng }; continue }

    const base = location || title
    if (!base || calls >= 60) continue
    const query = (destination && !base.includes(destination) ? `${base} ${destination}` : base).slice(0, 200)
    const key = query.toLowerCase()

    const { data: cached } = await supabase.from('geocode_cache').select('lat, lng').eq('query', key).maybeSingle()
    let hit = cached as { lat: number; lng: number } | null
    if (!hit) {
      calls++
      const g = await geocodeDetailed(query)
      await sleep(300)
      // Reject results in a different country than the destination.
      if (g && (!destCountry || !g.country || g.country === destCountry)) {
        hit = { lat: g.lat, lng: g.lng }
        await supabase.from('geocode_cache').upsert({ query: key, lat: g.lat, lng: g.lng })
      }
    }
    if (hit) {
      coords[ev.id] = { lat: hit.lat, lng: hit.lng }
      await supabase.from('events').update({ lat: hit.lat, lng: hit.lng }).eq('id', ev.id)
    }
  }

  return NextResponse.json({ coords })
}
