'use client'

import { useEffect, useRef } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────
const PARTICLE_DISTANCE      = 130
const MOUSE_RADIUS           = 120
const STAR_COUNT_DEFAULT     = 25
const AIRPLANE_INTERVAL_MIN  = 8_000
const AIRPLANE_INTERVAL_MAX  = 15_000
const AIRPLANE_TRAIL_LENGTH  = 80
const METEOR_INTERVAL_MIN    = 15_000
const METEOR_INTERVAL_MAX    = 30_000
const MAX_FLIGHT_PATHS       = 2
const PARTICLE_COLORS = [
  '#4FC3F7', '#40C4FF', '#6C63FF', '#7C4DFF', '#9C27B0',
] as const

// ── Types ─────────────────────────────────────────────────────────────────
interface Particle {
  x: number; y: number
  vx: number; vy: number
  radius: number
  color: string
  alpha: number
}

interface Star {
  x: number; y: number
  radius: number
  baseAlpha: number
  phase: number
  frequency: number
}

interface TrailPoint { x: number; y: number }

interface Plane {
  x: number; y: number
  heading: number
  speedX: number; speedY: number
  size: number
  trail: TrailPoint[]
}

interface FlightPath {
  x1: number; y1: number
  x2: number; y2: number
  life: number
  maxLife: number
}

interface Meteor {
  x: number; y: number
  vx: number; vy: number
  length: number
  elapsed: number
  duration: number
  heading: number
}

export interface TechBackgroundProps {
  particleCount?: number
  airplaneEnabled?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function alpha3(a: number): string {
  return Math.max(0, Math.min(1, a)).toFixed(3)
}

// ── Component ─────────────────────────────────────────────────────────────
export default function TechBackground({
  particleCount = 90,
  airplaneEnabled = true,
}: TechBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef  = useRef({ x: -9999, y: -9999 })

  useEffect(() => {
    const maybeCanvas = canvasRef.current
    if (!maybeCanvas) return
    // Explicit non-null types so TypeScript does not complain in closures
    const canvas: HTMLCanvasElement = maybeCanvas
    const maybeCtx = canvas.getContext('2d')
    if (!maybeCtx) return
    const ctx: CanvasRenderingContext2D = maybeCtx

    // ── Feature 16: Reduced motion ────────────────────────────────────
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // ── Feature 15: Responsive downgrade ──────────────────────────────
    const vw = window.innerWidth
    const effParticles = reducedMotion
      ? Math.floor(particleCount / 2)
      : vw < 480 ? Math.min(particleCount, 30)
      : vw < 768 ? Math.min(particleCount, 50)
      : particleCount
    const effStars = reducedMotion
      ? Math.max(10, Math.floor(STAR_COUNT_DEFAULT / 2))
      : vw < 480 ? 10
      : vw < 768 ? 15
      : STAR_COUNT_DEFAULT
    const effAirplane = airplaneEnabled && !reducedMotion
    const effMeteor   = !reducedMotion
    const auroraSpeed = reducedMotion ? 0.3 : 1.0

    const dpr = window.devicePixelRatio || 1
    let w = 0
    let h = 0

    function resize() {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width  = w * dpr
      canvas.height = h * dpr
      canvas.style.width  = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    // ── Feature 14: Parallax state ────────────────────────────────────
    let parAuroraX = 0, parAuroraY = 0
    let parStarX   = 0, parStarY   = 0
    let parTargetX = 0, parTargetY = 0

    // ── Particles ──────────────────────────────────────────────────────
    const particles: Particle[] = Array.from({ length: effParticles }, () => ({
      x: rand(0, w), y: rand(0, h),
      vx: rand(-0.25, 0.25), vy: rand(-0.25, 0.25),
      radius: rand(1, 3),
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      alpha: rand(0.45, 1),
    }))

    // ── Stars ──────────────────────────────────────────────────────────
    const stars: Star[] = Array.from({ length: effStars }, () => ({
      x: rand(0, w), y: rand(0, h),
      radius: rand(0.5, 2),
      baseAlpha: rand(0.2, 1),
      phase: rand(0, Math.PI * 2),
      frequency: (Math.PI * 2) / rand(2, 5),
    }))

    // ── Airplane + flight paths ────────────────────────────────────────
    let plane: Plane | null = null
    const flightPaths: FlightPath[] = []
    let rafId: number = 0
    let planeTimer:  ReturnType<typeof setTimeout> | null = null
    let meteorTimer: ReturnType<typeof setTimeout> | null = null

    function spawnPlane() {
      if (plane) return
      const facingRight = Math.random() > 0.5
      const tiltRad = rand(-20, 20) * (Math.PI / 180)
      const heading = facingRight ? tiltRad : Math.PI + tiltRad
      const speed = rand(100, 170)
      const size  = rand(10, 14)
      plane = {
        x: facingRight ? -size * 3 : w + size * 3,
        y: rand(h * 0.08, h * 0.72),
        heading,
        speedX: Math.cos(heading) * speed,
        speedY: Math.sin(heading) * speed,
        size,
        trail: [],
      }
    }

    function schedulePlane() {
      const delay = rand(AIRPLANE_INTERVAL_MIN, AIRPLANE_INTERVAL_MAX)
      planeTimer = setTimeout(() => { spawnPlane(); schedulePlane() }, delay)
    }

    if (effAirplane) {
      planeTimer = setTimeout(() => { spawnPlane(); schedulePlane() }, 3_000)
    }

    // ── Feature 12: Meteor ────────────────────────────────────────────
    let meteor: Meteor | null = null

    function spawnMeteor() {
      if (meteor) return
      const heading = rand(25, 65) * (Math.PI / 180)
      const speed   = rand(400, 700)
      meteor = {
        x: rand(w * 0.05, w * 0.75),
        y: rand(-60, h * 0.3),
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed,
        length: rand(80, 150),
        elapsed: 0,
        duration: rand(0.8, 1.5),
        heading,
      }
    }

    function scheduleMeteor() {
      const delay = rand(METEOR_INTERVAL_MIN, METEOR_INTERVAL_MAX)
      meteorTimer = setTimeout(() => { spawnMeteor(); scheduleMeteor() }, delay)
    }

    if (effMeteor) {
      meteorTimer = setTimeout(() => { spawnMeteor(); scheduleMeteor() }, 5_000)
    }

    // ── Draw: background ───────────────────────────────────────────────
    function drawBackground() {
      const r = Math.max(w, h) * 0.85
      const g = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, r)
      g.addColorStop(0,   '#0B1020')
      g.addColorStop(0.5, '#0B1020')
      g.addColorStop(0.8, '#151933')
      g.addColorStop(1,   '#050814')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }

    // ── Feature 13: Dynamic aurora ────────────────────────────────────
    function drawAurora(t: number) {
      const s = auroraSpeed

      const scale1 = 0.42 + 0.06 * Math.sin(t * s * 0.031)
      const opac1  = 0.14 + 0.04 * Math.sin(t * s * 0.023 + 1.2)
      const cx1 = w * 0.50 + Math.sin(t * s * 0.022) * w * 0.12 + parAuroraX
      const cy1 = h * 0.25 + Math.cos(t * s * 0.016) * h * 0.09 + parAuroraY
      const g1 = ctx.createRadialGradient(cx1, cy1, 0, cx1, cy1, w * scale1)
      g1.addColorStop(0,   `rgba(108,99,255,${alpha3(opac1)})`)
      g1.addColorStop(0.5, `rgba(108,99,255,${alpha3(opac1 * 0.4)})`)
      g1.addColorStop(1,   'rgba(108,99,255,0)')
      ctx.fillStyle = g1
      ctx.fillRect(0, 0, w, h)

      const scale2 = 0.36 + 0.05 * Math.sin(t * s * 0.027 + 2.1)
      const opac2  = 0.09 + 0.03 * Math.sin(t * s * 0.019 + 3.4)
      const cx2 = w * 0.68 + Math.cos(t * s * 0.019) * w * 0.14 + parAuroraX * 0.7
      const cy2 = h * 0.35 + Math.sin(t * s * 0.013) * h * 0.11 + parAuroraY * 0.7
      const g2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, w * scale2)
      g2.addColorStop(0,   `rgba(79,195,247,${alpha3(opac2)})`)
      g2.addColorStop(0.5, `rgba(79,195,247,${alpha3(opac2 * 0.4)})`)
      g2.addColorStop(1,   'rgba(79,195,247,0)')
      ctx.fillStyle = g2
      ctx.fillRect(0, 0, w, h)
    }

    // ── Draw: stars with parallax offset ──────────────────────────────
    function drawStars(t: number) {
      for (const s of stars) {
        const a = s.baseAlpha * (0.5 + 0.5 * Math.sin(t * s.frequency + s.phase))
        ctx.beginPath()
        ctx.arc(s.x + parStarX, s.y + parStarY, s.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${alpha3(a)})`
        ctx.fill()
      }
    }

    // ── Update: parallax ──────────────────────────────────────────────
    function updateParallax(dt: number) {
      const eA = 1 - Math.exp(-dt * 1.5)
      const eS = 1 - Math.exp(-dt * 0.7)
      parAuroraX += (parTargetX * 0.5  - parAuroraX) * eA
      parAuroraY += (parTargetY * 0.5  - parAuroraY) * eA
      parStarX   += (parTargetX * 0.12 - parStarX)   * eS
      parStarY   += (parTargetY * 0.12 - parStarY)   * eS
    }

    // ── Update: particles ──────────────────────────────────────────────
    function updateParticles(dt: number) {
      const { x: mx, y: my } = mouseRef.current
      for (const p of particles) {
        const dx = p.x - mx
        const dy = p.y - my
        const d2 = dx * dx + dy * dy
        if (d2 < MOUSE_RADIUS * MOUSE_RADIUS && d2 > 0) {
          const d = Math.sqrt(d2)
          const f = ((MOUSE_RADIUS - d) / MOUSE_RADIUS) * 2
          p.vx += (dx / d) * f * dt
          p.vy += (dy / d) * f * dt
        }
        p.vx = p.vx * 0.97 + rand(-1, 1) * 0.012
        p.vy = p.vy * 0.97 + rand(-1, 1) * 0.012
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (spd > 1.5) { p.vx = (p.vx / spd) * 1.5; p.vy = (p.vy / spd) * 1.5 }
        p.x += p.vx; p.y += p.vy
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10
      }
    }

    // ── Draw: connections ──────────────────────────────────────────────
    function drawConnections() {
      ctx.lineWidth = 0.5
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const d  = Math.sqrt(dx * dx + dy * dy)
          if (d < PARTICLE_DISTANCE) {
            const a = (1 - d / PARTICLE_DISTANCE) * 0.28
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(100,140,255,${alpha3(a)})`
            ctx.stroke()
          }
        }
      }
    }

    // ── Draw: particles ────────────────────────────────────────────────
    function drawParticles() {
      for (const p of particles) {
        ctx.globalAlpha = 0.14 * p.alpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius * 5, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
        ctx.globalAlpha = p.alpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // ── Feature 11: Dashed flight path trails ─────────────────────────
    function updateAndDrawFlightPaths(dt: number) {
      for (let i = flightPaths.length - 1; i >= 0; i--) {
        const fp = flightPaths[i]
        fp.life -= dt
        if (fp.life <= 0) { flightPaths.splice(i, 1); continue }
        const a = (fp.life / fp.maxLife) * 0.12
        ctx.save()
        ctx.setLineDash([8, 8])
        ctx.lineWidth = 1
        ctx.strokeStyle = `rgba(255,255,255,${alpha3(a)})`
        ctx.beginPath()
        ctx.moveTo(fp.x1, fp.y1)
        ctx.lineTo(fp.x2, fp.y2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }
    }

    // ── Draw: airplane silhouette ──────────────────────────────────────
    function drawPlaneBody(size: number) {
      ctx.beginPath()
      ctx.moveTo(size, 0)
      ctx.lineTo(-size * 0.5, -size * 0.13)
      ctx.lineTo(-size * 0.5,  size * 0.13)
      ctx.closePath()
      ctx.fill()
      for (const s of [-1, 1] as const) {
        ctx.beginPath()
        ctx.moveTo(size * 0.08, 0)
        ctx.lineTo(-size * 0.32, s * size * 0.78)
        ctx.lineTo(-size * 0.48, s * size * 0.68)
        ctx.lineTo(-size * 0.22, 0)
        ctx.closePath()
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(-size * 0.42, 0)
        ctx.lineTo(-size * 0.68, s * size * 0.33)
        ctx.lineTo(-size * 0.82, s * size * 0.26)
        ctx.lineTo(-size * 0.56, 0)
        ctx.closePath()
        ctx.fill()
      }
    }

    // ── Update + draw: plane (deposits flight path on exit) ───────────
    function updateAndDrawPlane(dt: number) {
      if (!plane) return
      plane.trail.unshift({ x: plane.x, y: plane.y })
      if (plane.trail.length > AIRPLANE_TRAIL_LENGTH) plane.trail.pop()
      plane.x += plane.speedX * dt
      plane.y += plane.speedY * dt
      if (plane.x < -200 || plane.x > w + 200 || plane.y < -200 || plane.y > h + 200) {
        const tLen = plane.trail.length
        if (tLen > 8) {
          if (flightPaths.length >= MAX_FLIGHT_PATHS) flightPaths.shift()
          const p1 = plane.trail[Math.floor(tLen * 0.6)]
          const p2 = plane.trail[0]
          const life = rand(2, 4)
          flightPaths.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, life, maxLife: life })
        }
        plane = null
        return
      }
      ctx.lineCap = 'round'
      ctx.lineWidth = 1.5
      for (let i = 1; i < plane.trail.length; i++) {
        const a = (1 - i / plane.trail.length) * 0.28
        ctx.beginPath()
        ctx.moveTo(plane.trail[i - 1].x, plane.trail[i - 1].y)
        ctx.lineTo(plane.trail[i].x,     plane.trail[i].y)
        ctx.strokeStyle = `rgba(255,255,255,${alpha3(a)})`
        ctx.stroke()
      }
      ctx.save()
      ctx.translate(plane.x, plane.y)
      ctx.rotate(plane.heading)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      drawPlaneBody(plane.size)
      ctx.restore()
    }

    // ── Feature 12: Meteor / shooting star ────────────────────────────
    function updateAndDrawMeteor(dt: number) {
      if (!meteor) return
      meteor.elapsed += dt
      if (meteor.elapsed >= meteor.duration) { meteor = null; return }
      meteor.x += meteor.vx * dt
      meteor.y += meteor.vy * dt

      const progress = meteor.elapsed / meteor.duration
      const fadeA    = progress > 0.8 ? 1 - (progress - 0.8) / 0.2 : 1.0

      const tx = meteor.x - Math.cos(meteor.heading) * meteor.length
      const ty = meteor.y - Math.sin(meteor.heading) * meteor.length

      const grad = ctx.createLinearGradient(tx, ty, meteor.x, meteor.y)
      grad.addColorStop(0, 'rgba(79,195,247,0)')
      grad.addColorStop(1, `rgba(255,255,255,${alpha3(0.9 * fadeA)})`)

      ctx.save()
      ctx.globalAlpha = fadeA
      ctx.lineWidth   = 2
      ctx.lineCap     = 'round'
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(meteor.x, meteor.y)
      ctx.strokeStyle = grad
      ctx.stroke()
      const hg = ctx.createRadialGradient(meteor.x, meteor.y, 0, meteor.x, meteor.y, 5)
      hg.addColorStop(0, `rgba(255,255,255,${alpha3(0.9 * fadeA)})`)
      hg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.beginPath()
      ctx.arc(meteor.x, meteor.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = hg
      ctx.fill()
      ctx.restore()
    }

    // ── Animation loop ─────────────────────────────────────────────────
    let last = 0
    function tick(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t  = now / 1000

      updateParallax(dt)
      drawBackground()
      drawAurora(t)
      drawStars(t)
      updateAndDrawFlightPaths(dt)
      updateParticles(dt)
      drawConnections()
      drawParticles()
      if (effAirplane) updateAndDrawPlane(dt)
      if (effMeteor)   updateAndDrawMeteor(dt)

      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    // ── Listeners ──────────────────────────────────────────────────────
    const onResize = () => resize()
    const onMouse  = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
      parTargetX = (e.clientX / w - 0.5) * 40
      parTargetY = (e.clientY / h - 0.5) * 40
    }
    window.addEventListener('resize',    onResize)
    window.addEventListener('mousemove', onMouse)

    return () => {
      cancelAnimationFrame(rafId)
      if (planeTimer)  clearTimeout(planeTimer)
      if (meteorTimer) clearTimeout(meteorTimer)
      window.removeEventListener('resize',    onResize)
      window.removeEventListener('mousemove', onMouse)
    }
  }, [particleCount, airplaneEnabled])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 pointer-events-none"
    />
  )
}
