/* First-visit loading screen: real runtime boot transcript, progress bar,
 * breathing logo, failure state with Retry / demo-runtime fallback. */

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Check, TriangleAlert } from 'lucide-react'

export default function BootScreen({ lines, progress, failed, onRetry, onDemo }: {
  lines: string[]
  /** an artifact streaming in (Sprint 27) */
  progress?: { file: string; loaded: number; total: number | null } | null
  failed: boolean
  onRetry: () => void
  onDemo: () => void
}) {
  const termRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    termRef.current?.scrollTo({ top: termRef.current.scrollHeight })
  }, [lines.length])

  /* the bar follows the download while one is streaming, the boot-line count otherwise */
  const mb = (n: number) => (n / 1e6).toFixed(1)
  const fraction = failed ? 1 : progress && progress.total ? Math.min(0.97, progress.loaded / progress.total) : Math.min(0.97, lines.length / 6)

  return (
    <motion.div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-abyss"
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.3, ease: [0.2, 0.7, 0.3, 1] }}
    >
      <div className="pointer-events-none absolute inset-0 bg-noise opacity-[0.03]" />
      {/* breathing logo */}
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        className="relative mb-6"
      >
        <div
          className="absolute -inset-8 rounded-full opacity-40 blur-2xl"
          style={{ background: 'radial-gradient(circle, rgba(110,168,220,.35) 0%, rgba(167,139,250,.25) 60%, transparent 100%)' }}
        />
        <img src="/logo.svg" alt="ConsCell" className="relative h-16 w-16" />
      </motion.div>

      <h1 className="mb-5 font-display text-[20px] font-semibold text-primary">
        {failed ? 'Runtime failed to boot' : 'Compiling the environment…'}
      </h1>

      {/* boot terminal */}
      <div
        ref={termRef}
        className="scrollbar-thin h-[160px] w-[420px] max-w-[92vw] overflow-y-auto rounded-lg border border-hairline bg-inset px-3.5 py-3 font-mono text-[12px] leading-[1.7]"
      >
        <div className="text-lisp-purple">λ conscell boot v0.9.2</div>
        {lines.map((l, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="flex items-baseline gap-2">
            <Check size={11} className="shrink-0 translate-y-px text-success" />
            <span className="text-secondary">{l}</span>
          </motion.div>
        ))}
        {failed && (
          <div className="flex items-baseline gap-2 text-error">
            <TriangleAlert size={11} className="shrink-0 translate-y-px" />
            <span>boot failed — see options below</span>
          </div>
        )}
      </div>

      {/* progress */}
      <div className="mt-5 h-0.5 w-[420px] max-w-[92vw] overflow-hidden rounded-full bg-inset">
        {failed ? (
          <div className="h-full w-full bg-error/60" />
        ) : (
          <motion.div
            className="h-full"
            style={{ background: 'linear-gradient(120deg, #6EA8DC 0%, #A78BFA 100%)' }}
            animate={{ width: `${Math.max(6, fraction * 100)}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        )}
      </div>

      {!failed && progress && (
        <p className="mt-2 font-mono text-[11px] text-muted" data-testid="boot-progress">
          {progress.file} · {mb(progress.loaded)}{progress.total ? ` / ${mb(progress.total)}` : ''} MB
        </p>
      )}

      {failed && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 flex w-[420px] max-w-[92vw] flex-col gap-3 rounded-lg border border-error/40 bg-error/10 px-4 py-4"
        >
          <p className="text-[13px] text-primary/90">
            The WASM runtime could not start in this browser (missing WebAssembly support, blocked fetch, or a crash during boot).
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-md bg-steel px-4 py-2 text-[12.5px] font-semibold text-abyss transition-all duration-150 hover:-translate-y-px hover:bg-steel-bright active:scale-[0.97]"
              onClick={onRetry}
            >
              Retry
            </button>
            <button
              className="rounded-md border border-hairline px-4 py-2 text-[12.5px] text-secondary transition-all duration-150 hover:border-strong hover:bg-raised hover:text-primary"
              onClick={onDemo}
            >
              Continue with demo runtime
            </button>
          </div>
        </motion.div>
      )}

      <p className="mt-8 font-mono text-[11px] text-muted">runs 100% client-side — no code ever leaves your machine</p>
    </motion.div>
  )
}
