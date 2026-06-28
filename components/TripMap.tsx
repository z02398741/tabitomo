'use client'
import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'

export interface MapEvent { id: string; title: string; time: string; lat: number; lng: number }
export interface MapDay { id: string; label: string; color: string; events: MapEvent[] }

// Renders trip events on an OpenStreetMap. Numbering restarts each day
// (1..n by time), markers colored per day, with a route line per day.
// "全程" shows all days; tabs switch to a single day. Leaflet is imported
// dynamically so it never runs during SSR.
export default function TripMap({ days }: { days: MapDay[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [sel, setSel] = useState<string>('all')   // 'all' or a day id

  useEffect(() => {
    if (!containerRef.current) return
    const visible = sel === 'all' ? days : days.filter(d => d.id === sel)
    const hasPoints = visible.some(d => d.events.length > 0)
    if (!hasPoints) return
    let cancelled = false

    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current) return
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      const map = L.map(containerRef.current, { scrollWheelZoom: false, attributionControl: false })
      mapRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)

      const bounds: [number, number][] = []
      for (const day of visible) {
        const evs = [...day.events].sort((a, b) => a.time.localeCompare(b.time))
        const pts: [number, number][] = []
        evs.forEach((ev, i) => {
          const ll: [number, number] = [ev.lat, ev.lng]
          pts.push(ll); bounds.push(ll)
          const icon = L.divIcon({
            className: '',
            html: `<div style="width:24px;height:24px;border-radius:50%;background:${day.color};color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${i + 1}</div>`,
            iconSize: [24, 24], iconAnchor: [12, 12],
          })
          L.marker(ll, { icon }).bindPopup(`<b>${i + 1}. ${ev.title}</b><br>${ev.time}`).addTo(map)
        })
        if (pts.length > 1) L.polyline(pts, { color: day.color, weight: 2, opacity: 0.6, dashArray: '5,5' }).addTo(map)
      }
      if (bounds.length === 1) map.setView(bounds[0], 14)
      else if (bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 })
    })()

    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }
  }, [sel, days])

  const totalPts = days.reduce((a, d) => a + d.events.length, 0)
  if (totalPts === 0) return null

  const tabBtn = (active: boolean, color?: string): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
    border: `1.5px solid ${active ? (color ?? '#6c8ef5') : '#252a3a'}`,
    background: active ? (color ? color + '22' : '#6c8ef522') : 'none',
    color: active ? (color ?? '#8aaaf8') : '#8b93b0',
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '8px' }}>
        <button onClick={() => setSel('all')} style={tabBtn(sel === 'all')}>全程</button>
        {days.map((d, i) => (
          <button key={d.id} onClick={() => setSel(d.id)} style={tabBtn(sel === d.id, d.color)}>
            {`Day${i + 1}`}
          </button>
        ))}
      </div>
      <div ref={containerRef} style={{ height: '300px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #252a3a' }} />
    </div>
  )
}
