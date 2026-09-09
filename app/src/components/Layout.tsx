import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

gsap.registerPlugin(ScrollTrigger)

/**
 * Smooth scrolling for marketing routes (/, /examples, /docs).
 * The IDE route (/ide) is a 100dvh app shell with native panel
 * scrolling only — Lenis is disabled there (design 2.4).
 */
function useSmoothScroll() {
  const { pathname, hash } = useLocation()
  const isIde = pathname.startsWith('/ide')

  useEffect(() => {
    if (isIde) return

    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 })
    lenis.on('scroll', ScrollTrigger.update)
    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(raf)
      lenis.destroy()
    }
  }, [isIde])

  /* Scroll to top on route change, or to hash anchor with 80px header offset */
  useEffect(() => {
    if (isIde) return
    if (hash) {
      const id = hash.slice(1)
      /* wait a frame so the target page has rendered */
      requestAnimationFrame(() => {
        const el = document.getElementById(id)
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - 80
          window.scrollTo({ top: y, behavior: 'smooth' })
        }
      })
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
  }, [pathname, hash, isIde])
}

export default function Layout() {
  const { pathname } = useLocation()
  const isIde = pathname.startsWith('/ide')
  useSmoothScroll()

  if (isIde) {
    /* IDE: no marketing chrome, no page scroll — the app owns the viewport */
    return (
      <div className="h-[100dvh] overflow-hidden bg-abyss text-primary">
        <Outlet />
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-abyss text-primary">
      <Navbar />
      {/* Navbar is fixed h-16 — this offset keeps page content below it.
          Full-bleed heroes opt out inside the page with -mt-16. */}
      <main className="pt-16">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
