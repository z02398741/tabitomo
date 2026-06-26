'use client'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { RankedCandidate } from '@/lib/agents/travel/types'

// Renders recommended spots/restaurants on an OpenStreetMap (Leaflet).
// Leaflet is imported dynamically so it never runs during SSR. Uses
// circleMarkers to avoid the default-marker icon asset problem.
export default function SpotsMap({ spots, restaurants }: {
  spots: RankedCandidate[]
  restaurants: RankedCandidate[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  useEffect(() => {
    const all = [...spots, ...restaurants]
    if (!containerRef.current || all.length === 0) return
    let cancelled = false

    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current) return

      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      const map = L.map(containerRef.current, { scrollWheelZoom: false, attributionControl: false })
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)

      const bounds: [number, number][] = []
      const addMarker = (c: RankedCandidate, color: string) => {
        const ll: [number, number] = [c.latLng.lat, c.latLng.lng]
        L.circleMarker(ll, { radius: 6, color, fillColor: color, fillOpacity: 0.85, weight: 1 })
          .bindPopup(`<b>${c.name}</b><br>${c.distanceKm.toFixed(1)}km`)
          .addTo(map)
        bounds.push(ll)
      }
      spots.forEach(s => addMarker(s, '#6c8ef5'))
      restaurants.forEach(r => addMarker(r, '#f06292'))

      if (bounds.length === 1) map.setView(bounds[0], 14)
      else if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 })
    })()

    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [spots, restaurants])

  if (spots.length + restaurants.length === 0) return null

  return (
    <div style={{ marginBottom: '16px' }}>
      <div ref={containerRef} style={{
        height: '240px', borderRadius: '12px', overflow: 'hidden',
        border: '1px solid #252a3a',
      }} />
      <div style={{ display: 'flex', gap: '14px', marginTop: '6px',
        fontSize: '10px', color: '#8b93b0' }}>
        <span><span style={{ color: '#6c8ef5' }}>●</span> スポット</span>
        <span><span style={{ color: '#f06292' }}>●</span> レストラン</span>
      </div>
    </div>
  )
}
