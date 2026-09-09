import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export const CATEGORIES = [
  'All',
  'Basics',
  'Macros',
  'CLOS',
  'Conditions',
  'Algorithms',
  'Format & Loop',
] as const

export const DIFFICULTIES = [
  { value: 1, label: 'intro' },
  { value: 2, label: 'intermediate' },
  { value: 3, label: 'advanced' },
] as const

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1 font-mono text-[11px] transition-colors duration-150 ease-snap',
        active
          ? 'border-steel/50 bg-steel-dim text-steel-bright'
          : 'border-hairline text-secondary hover:border-strong hover:text-white'
      )}
    >
      {children}
    </button>
  )
}

export default function FilterBar({
  category,
  onCategory,
  difficulty,
  onDifficulty,
  query,
  onQuery,
  count,
  total,
}: {
  category: string
  onCategory: (c: string) => void
  difficulty: 0 | 1 | 2 | 3
  onDifficulty: (d: 0 | 1 | 2 | 3) => void
  query: string
  onQuery: (q: string) => void
  count: number
  total: number
}) {
  /* 150ms debounce on the search input */
  const [raw, setRaw] = useState(query)
  useEffect(() => {
    const t = setTimeout(() => onQuery(raw), 150)
    return () => clearTimeout(t)
  }, [raw, onQuery])

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-16 z-30 border-b border-hairline bg-abyss/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
        {CATEGORIES.map((c, i) => (
          <motion.span
            key={c}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * (i + 1), duration: 0.3 }}
          >
            <Chip active={category === c} onClick={() => onCategory(c)}>
              {c}
            </Chip>
          </motion.span>
        ))}

        <span
          aria-hidden
          className="mx-1 hidden h-4 w-px bg-hairline sm:block"
        />
        {DIFFICULTIES.map((d, i) => (
          <motion.span
            key={d.value}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * (CATEGORIES.length + i + 1), duration: 0.3 }}
          >
            <Chip
              active={difficulty === d.value}
              onClick={() => onDifficulty(difficulty === d.value ? 0 : d.value)}
            >
              {d.label}
            </Chip>
          </motion.span>
        ))}

        <span className="flex-1" />

        <span className="hidden font-mono text-[11px] text-muted sm:block">
          {count === total ? `${total} examples` : `${count} of ${total}`}
        </span>

        <div className="relative">
          <Search
            size={13}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Filter by name…"
            aria-label="Filter examples by name"
            className="w-[240px] rounded-md border border-hairline bg-inset py-1.5 pl-8 pr-3 text-[13px] text-primary placeholder:text-muted focus:border-strong focus:outline-none focus:ring-2 focus:ring-steel/45"
          />
        </div>
      </div>
    </motion.div>
  )
}
