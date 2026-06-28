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

async function geocodeVenue(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=ja`
    const res = await fetch(url, { headers: { 'User-Agent': 'Tabitomo/1.0 (trip-map)' }, signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.[0]) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
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

  const supabase = getAdmin()
  const { data: trip } = await supabase
    .from('trips')
    .select('destination, days:trip_days(events(id, title, location, lat, lng))')
    .eq('id', id)
    .single()
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const destination: string = (trip as any).destination || ''
  const events: any[] = ((trip as any).days ?? []).flatMap((d: any) => d.events ?? [])

  const coords: Record<string, { lat: number; lng: number }> = {}
  const toGeocode: any[] = []
  for (const ev of events) {
    if (ev.lat != null && ev.lng != null) coords[ev.id] = { lat: ev.lat, lng: ev.lng }
    else if (ev.location || ev.title) toGeocode.push(ev)
  }

  for (const ev of toGeocode.slice(0, 60)) {
    const base = (ev.location || ev.title || '').trim()
    if (!base) continue
    const query = (destination && !base.includes(destination) ? `${base} ${destination}` : base).slice(0, 200)
    const key = query.toLowerCase()

    // cache lookup
    const { data: cached } = await supabase.from('geocode_cache').select('lat, lng').eq('query', key).maybeSingle()
    let hit = cached as { lat: number; lng: number } | null
    if (!hit) {
      const g = await geocodeVenue(query)
      await sleep(300) // be polite to Nominatim
      if (g) {
        hit = g
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
