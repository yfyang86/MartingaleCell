import { memo, useEffect, useRef } from 'react'

const GLYPHS = ['(', ')', 'λ', ';']
const CYCLE_COLORS = ['#8FC3EE', '#A78BFA', '#F472B6', '#4ADE80', '#FBBF24', '#38BDF8']
const COUNT = 40
const REPEL_RADIUS = 60

interface Particle {
  glyph: string
  x: number
  y: number
  size: number
  color: string
  alpha: number
  speed: number
  swayAmp: number
  swayFreq: number
  phase: number
  dx: number
  dy: number
}

/**
 * Paren particle field (home.md §2): ~40 glyphs from `( ) λ ;` in rainbow
 * cycle colors at low opacity, slow upward drift with sine sway. Glyphs near
 * the cursor repel gently and spring back (displacement + lerp decay).
 * Paused when offscreen or the tab is hidden.
 */
const ParenField = memo(function ParenField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let raf = 0
    let running = false
    let inView = true
    let last = performance.now()
    const mouse = { x: -9999, y: -9999 }

    const particles: Particle[] = []
    const rand = (min: number, max: number) => min + Math.random() * (max - min)

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      width = parent.clientWidth
      height = parent.clientHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const seed = () => {
      particles.length = 0
      for (let i = 0; i < COUNT; i++) {
        particles.push({
          glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
          x: rand(0, width),
          y: rand(0, height),
          size: rand(14, 42),
          color: CYCLE_COLORS[i % CYCLE_COLORS.length],
          alpha: rand(0.04, 0.1),
          speed: rand(10, 20), // px/s upward
          swayAmp: rand(6, 18),
          swayFreq: rand(0.15, 0.45),
          phase: rand(0, Math.PI * 2),
          dx: 0,
          dy: 0,
        })
      }
    }

    const frame = (now: number) => {
      if (!running) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t = now / 1000

      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        p.y -= p.speed * dt
        if (p.y < -p.size) {
          p.y = height + p.size
          p.x = rand(0, width)
        }

        /* cursor repel: displacement + lerp decay (never touch base pos) */
        const px = p.x + Math.sin(t * p.swayFreq + p.phase) * p.swayAmp
        const py = p.y
        const ox = px + p.dx
        const oy = py + p.dy
        const ddx = ox - mouse.x
        const ddy = oy - mouse.y
        const dist = Math.hypot(ddx, ddy)
        if (dist < REPEL_RADIUS && dist > 0.001) {
          const force = ((REPEL_RADIUS - dist) / REPEL_RADIUS) * 2.2
          p.dx += (ddx / dist) * force
          p.dy += (ddy / dist) * force
        }
        p.dx *= 0.92
        p.dy *= 0.92

        ctx.font = `${p.size}px "JetBrains Mono", monospace`
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.alpha
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.glyph, px + p.dx, py + p.dy)
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(frame)
    }

    const start = () => {
      if (running || reduced || document.hidden || !inView) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
    }
    const onLeave = () => {
      mouse.x = -9999
      mouse.y = -9999
    }
    const onVisibility = () => (document.hidden ? stop() : start())

    resize()
    seed()

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting
        if (inView) start()
        else stop()
      },
      { threshold: 0 }
    )
    io.observe(canvas)

    const ro = new ResizeObserver(() => {
      resize()
      seed()
    })
    ro.observe(canvas.parentElement ?? canvas)

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      stop()
      io.disconnect()
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  )
})

export default ParenField
