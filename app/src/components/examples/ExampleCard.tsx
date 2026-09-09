import { memo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowUpRight, Copy } from 'lucide-react'
import type { Example } from '@/data/examples'
import { ClCode } from './highlight'
import {
  DIFFICULTY_CLASS,
  DIFFICULTY_LABEL,
  cellCount,
  copySource,
  lineCount,
} from './helpers'

function ExampleCardInner({
  example,
  onOpen,
  staggerDelay = 0,
}: {
  example: Example
  onOpen: (ex: Example) => void
  staggerDelay?: number
}) {
  const lines = lineCount(example.code)
  const cells = cellCount(example.code)

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 28 }}
      whileInView={{
        opacity: 1,
        y: 0,
        transition: { delay: staggerDelay, duration: 0.4, ease: [0.16, 1, 0.3, 1] },
      }}
      viewport={{ once: true, amount: 0.85 }}
      exit={{
        opacity: 0,
        height: 0,
        paddingTop: 0,
        paddingBottom: 0,
        transition: { duration: 0.18 },
      }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      onClick={() => onOpen(example)}
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-hairline bg-raised p-5 transition-all duration-150 ease-snap hover:-translate-y-[3px] hover:border-strong hover:shadow-[0_8px_32px_rgba(110,168,220,0.08)]"
    >
      {/* Top row: category + difficulty chips */}
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-hairline px-2.5 py-0.5 font-mono text-[11px] text-secondary">
          {example.category}
        </span>
        <span
          className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${DIFFICULTY_CLASS[example.difficulty]}`}
        >
          {DIFFICULTY_LABEL[example.difficulty]}
        </span>
      </div>

      {/* Title + description */}
      <h3 className="mt-3 text-[15px] font-semibold text-primary">
        {example.title}
      </h3>
      <p className="mt-1 line-clamp-2 min-h-[2.6em] text-[13px] leading-snug text-secondary">
        {example.description}
      </p>

      {/* Code preview: first 5 lines, inset well, faded overflow */}
      <div className="relative mt-3 overflow-hidden rounded-md bg-inset p-3">
        <ClCode
          code={example.code}
          maxLines={5}
          className="pointer-events-none select-none text-[11.5px] leading-relaxed"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-inset to-transparent"
        />
      </div>

      {/* Footer row */}
      <div className="mt-3 flex items-center gap-3 font-mono text-[11px] text-muted">
        <span>{lines} lines</span>
        <span aria-hidden>·</span>
        <span>{cells} cells</span>
        <span className="flex-1" />
        <button
          type="button"
          aria-label={`Copy ${example.title} source`}
          title="Copy source"
          onClick={(e) => {
            e.stopPropagation()
            void copySource(example)
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors duration-150 ease-snap hover:bg-panel hover:text-white"
        >
          <Copy size={13} strokeWidth={1.75} />
        </button>
        <Link
          to={`/ide?example=${example.slug}`}
          aria-label={`Open ${example.title} in the IDE`}
          title="Run in IDE"
          onClick={(e) => e.stopPropagation()}
          className="flex h-7 w-7 items-center justify-center rounded-md text-steel transition-colors duration-150 ease-snap hover:bg-steel-dim/40 hover:text-steel-bright"
        >
          <ArrowUpRight size={14} strokeWidth={1.75} />
        </Link>
      </div>
    </motion.article>
  )
}

const ExampleCard = memo(ExampleCardInner)
export default ExampleCard
