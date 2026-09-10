import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export const DOC_SECTIONS = [
  { id: 'getting-started', label: 'Getting started' },
  { id: 'features', label: 'Feature support matrix' },
  { id: 'session', label: 'The session & cells' },
  { id: 'editor', label: 'Editor & buffers' },
  { id: 'debugger', label: 'Debugger & restarts' },
  { id: 'projects', label: 'Projects' },
  { id: 'modules', label: 'Modules' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
  { id: 'persistence', label: 'Persistence & privacy' },
  { id: 'faq', label: 'FAQ' },
] as const

/** Scrollspy: section closest to the 40%-viewport line becomes active. */
function useScrollSpy() {
  const [active, setActive] = useState<string>(DOC_SECTIONS[0].id)

  useEffect(() => {
    const visible = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting)
        const firstVisible = DOC_SECTIONS.find((s) => visible.get(s.id))
        if (firstVisible) setActive(firstVisible.id)
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    )
    for (const s of DOC_SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  return active
}

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const y = el.getBoundingClientRect().top + window.scrollY - 80
  window.scrollTo({ top: y, behavior: 'smooth' })
}

export default function DocsSidebar() {
  const active = useScrollSpy()

  return (
    <aside className="sticky top-16 hidden max-h-[calc(100dvh-4rem)] w-60 shrink-0 self-start overflow-y-auto py-14 pr-6 scrollbar-thin lg:block">
      <p className="px-3 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Documentation
      </p>

      <nav className="mt-4 flex flex-col gap-0.5" aria-label="Documentation sections">
        {DOC_SECTIONS.map((s, i) => {
          const isActive = active === s.id
          return (
            <motion.button
              key={s.id}
              type="button"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => scrollToSection(s.id)}
              className={cn(
                'relative rounded-md px-3 py-2 text-left text-[13.5px] transition-colors duration-150 ease-snap hover:text-white',
                isActive ? 'text-steel' : 'text-secondary'
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="docs-nav-indicator"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-steel"
                />
              )}
              {s.label}
            </motion.button>
          )
        })}
      </nav>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 * DOC_SECTIONS.length + 0.1, duration: 0.35 }}
        className="cc-panel mt-8 p-4"
      >
        <p className="text-[13px] font-semibold text-primary">New here?</p>
        <p className="mt-1 text-[12px] leading-relaxed text-secondary">
          Skip the reading — open the workspace and evaluate something.
        </p>
        <Link
          to="/ide"
          className="group mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-steel px-4 py-2 text-[12.5px] font-semibold text-abyss transition-all [transition-duration:120ms] ease-snap hover:-translate-y-px hover:bg-steel-bright active:scale-[0.97]"
        >
          Launch the IDE
          <ArrowRight
            size={13}
            strokeWidth={2}
            className="transition-transform duration-150 ease-snap group-hover:translate-x-[3px]"
          />
        </Link>
      </motion.div>
    </aside>
  )
}
