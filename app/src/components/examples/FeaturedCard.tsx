import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Clipboard } from 'lucide-react'
import type { Example } from '@/data/examples'
import { renderTokens, tokenize } from './highlight'
import { cellCount, copySource, lineCount, readSeconds } from './helpers'

/**
 * Featured example hero card (examples.md §2).
 * Brand-gradient 1px ring; on hover the conic gradient rotates (6s loop).
 */
export default function FeaturedCard({
  example,
  onOpen,
}: {
  example: Example
  onOpen: (ex: Example) => void
}) {
  const lines = useMemo(() => tokenize(example.code), [example.code])
  const preview = lines.slice(0, 9)

  return (
    <>
      {/* Rotating conic-angle property (cannot live in shared index.css) */}
      <style>{`
        @property --cc-angle {
          syntax: '<angle>';
          inherits: false;
          initial-value: 120deg;
        }
        @keyframes cc-ring-rotate {
          to { --cc-angle: 480deg; }
        }
        .cc-featured-ring {
          background: conic-gradient(
            from var(--cc-angle),
            #6EA8DC 0%, #A78BFA 40%, #2C4A66 70%, #6EA8DC 100%
          );
        }
        .cc-featured-ring:hover {
          animation: cc-ring-rotate 6s linear infinite;
        }
      `}</style>

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.215, 0.61, 0.355, 1] }}
        className="cc-featured-ring rounded-lg p-px"
      >
        <div className="grid gap-8 rounded-[7px] bg-panel p-8 lg:grid-cols-2">
          {/* Left: info */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-lisp/40 bg-lisp/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-lisp">
                Featured
              </span>
              <span className="rounded-full border border-hairline px-2.5 py-0.5 font-mono text-[11px] text-secondary">
                {example.category}
              </span>
            </div>

            <h2 className="mt-4 font-display text-[26px] font-semibold leading-tight tracking-tight text-primary">
              once-only — the macro writer's rite of passage
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-secondary">
              The classic utility macro that captures the heart of Common Lisp
              metaprogramming: code that writes code, with gensyms done right.
              Includes a walkthrough cell-by-cell in the IDE.
            </p>

            <p className="mt-4 font-mono text-[11.5px] text-muted">
              {lineCount(example.code)} lines · ~{readSeconds(example.code)}s
              read · {cellCount(example.code)} cells
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to={`/ide?example=${example.slug}`}
                className="group flex items-center gap-1.5 rounded-md bg-steel px-4 py-2 text-[13px] font-semibold text-abyss transition-all duration-150 ease-snap hover:-translate-y-px hover:bg-steel-bright active:scale-[0.97]"
              >
                Run in IDE
                <ArrowRight
                  size={14}
                  strokeWidth={2}
                  className="transition-transform duration-150 ease-snap group-hover:translate-x-[3px]"
                />
              </Link>
              <button
                type="button"
                onClick={() => void copySource(example)}
                className="flex items-center gap-1.5 rounded-md border border-hairline px-4 py-2 text-[13px] font-medium text-secondary transition-colors duration-150 ease-snap hover:border-strong hover:bg-raised hover:text-white"
              >
                <Clipboard size={14} strokeWidth={1.75} />
                Copy code
              </button>
              <button
                type="button"
                onClick={() => onOpen(example)}
                className="text-[13px] font-medium text-steel transition-colors duration-150 ease-snap hover:text-steel-bright"
              >
                View details
              </button>
            </div>
          </div>

          {/* Right: code preview (9 lines, bottom fade) */}
          <div className="relative overflow-hidden rounded-lg bg-inset p-4">
            <pre className="pointer-events-none select-none font-mono text-[12.5px] leading-relaxed">
              {preview.map((toks, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 + i * 0.03, duration: 0.25 }}
                  className="whitespace-pre"
                >
                  {renderTokens(toks, `f${i}`)}
                </motion.div>
              ))}
            </pre>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-inset to-transparent"
            />
          </div>
        </div>
      </motion.section>
    </>
  )
}
