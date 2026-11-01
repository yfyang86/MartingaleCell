import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '@/i18n/context'

const TYPED_FORM = "(mapcar #'1+ '(1 2 3 4))"
const CYCLE_MS = 6000

/** Rainbow parens for a printed list like (2 3 4 5) — depth 1 color */
function ResultList() {
  return (
    <span className="font-mono text-[13px]">
      <span className="tok-paren-1">(</span>
      <span className="tok-number">2</span> <span className="tok-number">3</span>{' '}
      <span className="tok-number">4</span> <span className="tok-number">5</span>
      <span className="tok-paren-1">)</span>
    </span>
  )
}

function CellResult() {
  return (
    <div className="cc-cell cc-cell-result p-3.5 pl-5">
      <span className="absolute left-0 top-0 h-px w-full origin-left animate-scan-x bg-steel/70" />
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[12px] text-muted">;;=&gt;</span>
          <ResultList />
        </div>
        <span className="font-mono text-[11px] text-muted">2 ms</span>
      </div>
    </div>
  )
}

function CellWarning() {
  return (
    <div className="cc-cell cc-cell-warning p-3.5 pl-5">
      <span className="absolute left-0 top-0 h-px w-full origin-left animate-scan-x bg-steel/70" />
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[12px] text-warning">;;!</span>
          <span className="font-mono text-[13px]">
            <span className="text-warning">STYLE-WARNING</span>
            <span className="text-secondary">: undefined variable </span>
            <span className="tok-constant">*CACHE*</span>
          </span>
        </div>
        <span className="font-mono text-[11px] text-muted">warn</span>
      </div>
    </div>
  )
}

function CellValues() {
  return (
    <div className="cc-cell cc-cell-result p-3.5 pl-5">
      <span className="absolute left-0 top-0 h-px w-full origin-left animate-scan-x bg-steel/70" />
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[12px] text-muted">CL-USER&gt;</span>
        <span className="font-mono text-[13px]">
          <span className="tok-paren-1">(</span>
          <span className="tok-symbol">floor</span> <span className="tok-number">17</span>{' '}
          <span className="tok-number">5</span>
          <span className="tok-paren-1">)</span>
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[12px] text-muted">;;=&gt;</span>
            <span className="tok-number font-mono text-[13px]">3</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[12px] text-muted">;</span>
            <span className="tok-number font-mono text-[13px]">2</span>
          </div>
        </div>
        <span className="font-mono text-[11px] text-muted">1 ms</span>
      </div>
    </div>
  )
}

const CELLS = [CellResult, CellWarning, CellValues]

/**
 * Simulated live REPL preview for the hero (home.md §2). Types the demo form
 * once scrolled into view, prints the result cell, then cycles warning /
 * multiple-values demos on a 6s loop. Pauses on hover. No real runtime.
 */
export default function MiniRepl() {
  const { t } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)
  const [typed, setTyped] = useState(0)
  const [cellIndex, setCellIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const typingDone = typed >= TYPED_FORM.length

  /* start typing when scrolled into view */
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true)
          io.disconnect()
        }
      },
      { threshold: 0.35 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  /* type at 40ms/char */
  useEffect(() => {
    if (!started || typingDone) return
    const id = window.setTimeout(() => setTyped((n) => n + 1), 40)
    return () => window.clearTimeout(id)
  }, [started, typed, typingDone])

  /* cycle cells on a 6s loop once typing completes; pause on hover */
  useEffect(() => {
    if (!typingDone || hovered) return
    const id = window.setInterval(() => setCellIndex((i) => (i + 1) % CELLS.length), CYCLE_MS)
    return () => window.clearInterval(id)
  }, [typingDone, hovered])

  const ActiveCell = CELLS[cellIndex]

  return (
    <div
      ref={rootRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full max-w-[640px] animate-float-soft"
    >
      <div className="cc-panel overflow-hidden">
        {/* panel header strip */}
        <div className="flex h-8 items-center justify-between border-b border-hairline px-3">
          <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {t('Session — CL-USER')}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            {t('ecl/wasm ready')}
          </span>
        </div>

        <div className="space-y-3 p-4">
          {/* fake editor line with typing animation */}
          <div className="flex items-baseline gap-2 font-mono text-[13px]">
            <span className="tok-package">CL-USER&gt;</span>
            <span className="text-primary">{TYPED_FORM.slice(0, typed)}</span>
            <span
              className="inline-block h-[15px] w-[7px] translate-y-[2px] animate-caret-blink bg-steel"
              aria-hidden
            />
          </div>

          {/* cycling cells */}
          <div className="min-h-[52px]">
            <AnimatePresence mode="wait">
              {typingDone && (
                <motion.div
                  key={cellIndex}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: [0.2, 0.7, 0.3, 1] }}
                >
                  <ActiveCell />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center font-mono text-[11px] text-muted">
        {t('This is a live preview — the real thing runs SBCL or ECL')}
      </p>
    </div>
  )
}
