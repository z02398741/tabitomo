'use client'

import { useEffect, useRef } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────
const PARTICLE_DISTANCE    = 130
const MOUSE_RADIUS         = 120
const STAR_COUNT           = 25
const AIRPLANE_INTERVAL_MIN = 8_000
const AIRPLANE_INTERVAL_MAX = 15_000
const AIRPLANE_TRAIL_LENGTH = 80
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
  frequency: number   // rad / s
}

interface TrailPoint { x: number; y: number }

interface Plane {
  x: number; y: number
  heading: number     // radians — direction nose points
  speedX: number; speedY: number
  size: number
  trail: TrailPoint[]
}

export interface TechBackgroundProps {
  particleCount?: number
  airplaneEnabled?: boolean
}

// ── Tiny helpers ──────────────────────────────────────────────────────────
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function alpha3(a: number): string {
  return a.toFixed(3)
}

// ── Component ─────────────────────────────────────────────────────────────
export default function TechBackground({
  particleCount = 90,
  airplaneEnabled = true,
}: TechBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef  = useRef({ x: -9999, y: -9999 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

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

    // ── Particles ──────────────────────────────────────────────────────
    const particles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: rand(0, w), y: rand(0, h),
      vx: rand(-0.25, 0.25), vy: rand(-0.25, 0.25),
      radius: rand(1, 3),
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      alpha: rand(0.45, 1),
    }))

    // ── Stars ──────────────────────────────────────────────────────────
    const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
      x: rand(0, w), y: rand(0, h),
      radius: rand(0.5, 2),
      baseAlpha: rand(0.2, 1),
      phase: rand(0, Math.PI * 2),
      frequency: (Math.PI * 2) / rand(2, 5),
    }))

    // ── Airplane ───────────────────────────────────────────────────────
    let plane: Plane | null = null
    let rafId: number = 0
    let timerId: ReturnType<typeof setTimeout> | null = null

    function spawnPlane() {
      if (plane) return
      const facingRight = Math.random() > 0.5
      const tiltDeg = rand(-20, 20)
      const tiltRad = tiltDeg * (Math.PI / 180)
      // heading: left-to-right ≈ 0, right-to-left ≈ π
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

    function scheduleNext() {
      const delay = rand(AIRPLANE_INTERVAL_MIN, AIRPLANE_INTERVAL_MAX)
      timerId = setTimeout(() => { spawnPlane(); scheduleNext() }, delay)
    }

    if (airplaneEnabled) {
      timerId = setTimeout(() => { spawnPlane(); scheduleNext() }, 3_000)
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

    // ── Draw: aurora ───────────────────────────────────────────────────
    function drawAurora(t: number) {
      // purple blob
      const cx1 = w * 0.50 + Math.sin(t * 0.022) * w * 0.12
      const cy1 = h * 0.25 + Math.cos(t * 0.016) * h * 0.09
      const g1 = ctx.createRadialGradient(cx1, cy1, 0, cx1, cy1, w * 0.45)
      g1.addColorStop(0,   'rgba(108,99,255,0.15)')
      g1.addColorStop(0.5, 'rgba(108,99,255,0.06)')
      g1.addColorStop(1,   'rgba(108,99,255,0)')
      ctx.fillStyle = g1
      ctx.fillRect(0, 0, w, h)

      // cyan blob
      const cx2 = w * 0.68 + Math.cos(t * 0.019) * w * 0.14
      const cy2 = h * 0.35 + Math.sin(t * 0.013) * h * 0.11
      const g2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, w * 0.38)
      g2.addColorStop(0,   'rgba(79,195,247,0.10)')
      g2.addColorStop(0.5, 'rgba(79,195,247,0.04)')
      g2.addColorStop(1,   'rgba(79,195,247,0)')
      ctx.fillStyle = g2
      ctx.fillRect(0, 0, w, h)
    }

    // ── Draw: stars ────────────────────────────────────────────────────
    function drawStars(t: number) {
      for (const s of stars) {
        const a = s.baseAlpha * (0.5 + 0.5 * Math.sin(t * s.frequency + s.phase))
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${alpha3(a)})`
        ctx.fill()
      }
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
        // Dampen + micro-drift
        p.vx = p.vx * 0.97 + rand(-1, 1) * 0.012
        p.vy = p.vy * 0.97 + rand(-1, 1) * 0.012
        // Speed cap
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (spd > 1.5) { p.vx = (p.vx / spd) * 1.5; p.vy = (p.vy / spd) * 1.5 }
        // Move
        p.x += p.vx; p.y += p.vy
        // Wrap
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
        // Soft glow
        ctx.globalAlpha = 0.14 * p.alpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius * 5, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
        // Core
        ctx.globalAlpha = p.alpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // ── Draw: airplane silhouette ──────────────────────────────────────
    function drawPlaneBody(size: number) {
      // Fuselage
      ctx.beginPath()
      ctx.moveTo(size, 0)
      ctx.lineTo(-size * 0.5, -size * 0.13)
      ctx.lineTo(-size * 0.5,  size * 0.13)
      ctx.closePath()
      ctx.fill()
      // Wings (symmetric ±)
      for (const s of [-1, 1] as const) {
        ctx.beginPath()
        ctx.moveTo(size * 0.08, 0)
        ctx.lineTo(-size * 0.32, s * size * 0.78)
        ctx.lineTo(-size * 0.48, s * size * 0.68)
        ctx.lineTo(-size * 0.22, 0)
        ctx.closePath()
        ctx.fill()
        // Tail
        ctx.beginPath()
        ctx.moveTo(-size * 0.42, 0)
        ctx.lineTo(-size * 0.68, s * size * 0.33)
        ctx.lineTo(-size * 0.82, s * size * 0.26)
        ctx.lineTo(-size * 0.56, 0)
        ctx.closePath()
        ctx.fill()
      }
    }

    // ── Update + draw: plane ───────────────────────────────────────────
    function updateAndDrawPlane(dt: number) {
      if (!plane) return
      plane.trail.unshift({ x: plane.x, y: plane.y })
      if (plane.trail.length > AIRPLANE_TRAIL_LENGTH) plane.trail.pop()
      plane.x += plane.speedX * dt
      plane.y += plane.speedY * dt
      if (plane.x < -200 || plane.x > w + 200 || plane.y < -200 || plane.y > h + 200) {
        plane = null; return
      }
      // Trail
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
      // Body
      ctx.save()
      ctx.translate(plane.x, plane.y)
      ctx.rotate(plane.heading)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      drawPlaneBody(plane.size)
      ctx.restore()
    }

    // ── Animation loop ─────────────────────────────────────────────────
    let last = 0
    function tick(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t  = now / 1000
      drawBackground()
      drawAurora(t)
      drawStars(t)
      updateParticles(dt)
      drawConnections()
      drawParticles()
      if (airplaneEnabled) updateAndDrawPlane(dt)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    // ── Listeners ──────────────────────────────────────────────────────
    const onResize = () => resize()
    const onMouse  = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY } }
    window.addEventListener('resize',    onResize)
    window.addEventListener('mousemove', onMouse)

    return () => {
      cancelAnimationFrame(rafId)
      if (timerId) clearTimeout(timerId)
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
