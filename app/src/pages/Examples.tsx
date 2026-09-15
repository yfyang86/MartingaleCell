import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Toaster } from 'sonner'
import { EXAMPLES } from '@/data/examples'
import type { Example } from '@/data/examples'
import FeaturedCard from '@/components/examples/FeaturedCard'
import ExampleCard from '@/components/examples/ExampleCard'
import ExampleModal from '@/components/examples/ExampleModal'
import FilterBar from '@/components/examples/FilterBar'

const FEATURED_SLUG = 'once-only'
const HEADLINE = 'Twelve programs. Zero setup.'

export default function Examples() {
  const [category, setCategory] = useState('All')
  const [difficulty, setDifficulty] = useState<0 | 1 | 2 | 3>(0)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Example | null>(null)

  const onQuery = useCallback((q: string) => setQuery(q), [])
  const onOpen = useCallback((ex: Example) => setSelected(ex), [])
  const onClose = useCallback(() => setSelected(null), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return EXAMPLES.filter((ex) => {
      if (category !== 'All' && ex.category !== category) return false
      if (difficulty !== 0 && ex.difficulty !== difficulty) return false
      if (!q) return true
      return [ex.title, ex.description, ex.category, ex.slug]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [category, difficulty, query])

  const featured = EXAMPLES.find((ex) => ex.slug === FEATURED_SLUG)!
  const grid = filtered.filter((ex) => ex.slug !== FEATURED_SLUG)

  return (
    <div className="min-h-[100dvh]">
      <Toaster
        position="bottom-left"
        offset={16}
        visibleToasts={3}
        toastOptions={{
          duration: 3500,
          style: {
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-hairline)',
            color: 'var(--text-primary)',
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          },
        }}
      />

      {/* Section 1 — Page header */}
      <header className="mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6 sm:pt-20">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-steel"
        >
          Gallery
        </motion.p>

        {/* Word-level rise, 12ms stagger, on load */}
        <h1 className="mt-3 font-display text-[clamp(30px,4vw,44px)] font-semibold leading-[1.1] tracking-[-0.02em] text-primary">
          {HEADLINE.split(' ').map((word, i) => (
            <span
              key={i}
              className="inline-block overflow-hidden pb-1 align-bottom"
            >
              <motion.span
                initial={{ y: '110%' }}
                animate={{ y: 0 }}
                transition={{
                  delay: 0.05 + i * 0.012,
                  duration: 0.6,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="inline-block"
              >
                {word}
                {i < HEADLINE.split(' ').length - 1 ? ' ' : ''}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 max-w-2xl text-[17px] leading-relaxed text-secondary"
        >
          Every example runs in the browser Lisp engine (SBCL or ECL) — ANSI Common Lisp
          compiled to WebAssembly. Pick one, and it
          opens in the IDE with the session ready — just press{' '}
          <kbd className="cc-kbd">Ctrl</kbd>{' '}
          <span aria-hidden className="text-muted">+</span>{' '}
          <kbd className="cc-kbd">Enter</kbd>.
        </motion.p>
      </header>

      {/* Filter bar (sticky under navbar) */}
      <FilterBar
        category={category}
        onCategory={setCategory}
        difficulty={difficulty}
        onDifficulty={setDifficulty}
        query={query}
        onQuery={onQuery}
        count={filtered.length}
        total={EXAMPLES.length}
      />

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Section 2 — Featured example hero card */}
        <div className="pt-10">
          <FeaturedCard example={featured} onOpen={onOpen} />
        </div>

        {/* Section 3 — Example grid */}
        <section className="pt-12">
          {grid.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {grid.map((ex, i) => (
                  <ExampleCard
                    key={ex.slug}
                    example={ex}
                    onOpen={onOpen}
                    staggerDelay={Math.min(i * 0.07, 0.49)}
                  />
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center rounded-lg border border-dashed border-hairline py-16"
            >
              <span className="font-mono text-4xl text-muted">λ</span>
              <p className="mt-3 text-[14px] text-secondary">
                No examples match that filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCategory('All')
                  setDifficulty(0)
                  setQuery('')
                }}
                className="mt-4 rounded-md border border-hairline px-4 py-2 text-[13px] font-medium text-secondary transition-colors duration-150 ease-snap hover:border-strong hover:bg-raised hover:text-white"
              >
                Reset filters
              </button>
            </motion.div>
          )}
        </section>

        {/* Section 5 — Bottom CTA */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.85 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center py-24 text-center"
        >
          <h2 className="font-display text-[22px] font-semibold tracking-tight text-primary">
            Have a snippet of your own?
          </h2>
          <p className="mt-2 text-[15px] text-secondary">
            Open a blank buffer and start consing.
          </p>
          <Link
            to="/ide"
            className="group mt-6 flex items-center gap-1.5 rounded-md border border-hairline px-4 py-2 text-[13px] font-medium text-secondary transition-colors duration-150 ease-snap hover:border-strong hover:bg-raised hover:text-white"
          >
            Open empty IDE
            <ArrowRight
              size={14}
              strokeWidth={1.75}
              className="transition-transform duration-150 ease-snap group-hover:translate-x-[3px]"
            />
          </Link>
        </motion.section>
      </main>

      {/* Section 4 — Detail modal */}
      <ExampleModal example={selected} onClose={onClose} />
    </div>
  )
}
