import { motion } from 'framer-motion'
import { TriangleAlert } from 'lucide-react'
import { SectionHeading, CalloutDot, CalloutList } from './shared'
import { EASE_OUT } from './motion'
import { ClCode } from './cl-highlight'

const CALLOUTS = [
  {
    title: 'Input echo',
    body: 'The evaluated form, exactly as sent to the runtime — steel gutter accent marks it as input.',
  },
  {
    title: 'OUT block',
    body: 'Everything written to *standard-output* while the form ran, streamed line by line.',
  },
  {
    title: 'Values block',
    body: 'The return values, printed readably after a ;;=> marker. Multiple values stack.',
  },
  {
    title: 'Meta footer',
    body: 'Wall time, value count, and the package the form ran in. Hover for copy / re-run.',
  },
  {
    title: 'Warning sub-block',
    body: 'Signaled warnings render inline, amber-accented — never lost in a separate console.',
  },
]

const SPECS = [
  {
    title: 'Persistence',
    body: 'Cells live in IndexedDB and survive reloads — close the tab mid-session, come back tomorrow.',
  },
  {
    title: 'Virtualization',
    body: 'Sessions past 100 cells virtualize; history is trimmed to the last 1,000 cells with a banner chip.',
  },
  {
    title: 'Copy & paste',
    body: 'Copy all yields a plain-text transcript with ;;=> markers — paste it into a gist or a bug report as-is.',
  },
  {
    title: 'Export',
    body: 'The download button (or the palette) saves the session as a Markdown notebook — code, output, values, warnings, errors and plots inline as SVG — or as a .lisp transcript with results as comments that evaluates as is. Import (palette) appends the cells of a Markdown or .lisp transcript back into the session, marked as imported and re-runnable. A settings slider can clip long values in exports. Open as buffer turns a cell into a linked buffer: re-running the cell evaluates the buffer\'s current text.',
  },
  {
    title: 'Run history',
    body: 'Re-running a cell (the ↻ button, or evaluating its linked buffer) adds a run to its history. The cell shows run k/N; click it to see the runs side by side — input, status, values — with each value marked when it differs from the run before, and a changed input shown as a line diff against it. The Markdown export keeps the runs (run k/N of cell m in the heading) and an import re-links them.',
  },
  {
    title: 'Truncation',
    body: 'Long values truncate at 60 chars / 20 lines; an expand chip reveals the full printed form.',
  },
]

function CellReplica() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      className="cc-cell cc-cell-input font-mono text-[12.5px] leading-[1.7]"
    >
      {/* [1] input echo */}
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <code className="whitespace-pre-wrap">
          <ClCode code={'(defun fib (n)\n  (if (< n 2) n\n      (+ (fib (- n 1)) (fib (- n 2)))))'} />
        </code>
        <CalloutDot n={1} delay={0} />
      </div>

      {/* [5] warning sub-block */}
      <div className="cc-cell cc-cell-warning m-3 mb-0 flex items-start gap-2.5 rounded-md border border-warning/25 bg-warning/5 px-3 py-2.5">
        <TriangleAlert size={13} strokeWidth={1.75} className="mt-[3px] shrink-0 text-warning" />
        <div className="flex-1 text-[12px] leading-relaxed text-warning/90">
          STYLE-WARNING: redefining FIB — previously defined in cell #3
        </div>
        <CalloutDot n={5} delay={0.6} />
      </div>

      {/* [2] OUT block */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="text-[12.5px]">
          <span className="tok-comment">;; OUT</span>
          <div className="text-secondary">computing the 25th Fibonacci number…</div>
        </div>
        <CalloutDot n={2} delay={0.15} />
      </div>

      {/* [3] values block */}
      <div className="flex items-start justify-between gap-3 px-4 pt-2">
        <div className="text-[13px]">
          <span className="text-muted">;;=&gt;</span>{' '}
          <span className="text-success">75025</span>
        </div>
        <CalloutDot n={3} delay={0.3} />
      </div>

      {/* [4] meta footer */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline bg-panel/60 px-4 py-2">
        <span className="text-[11px] text-muted">12 ms · 1 value · package CL-USER</span>
        <CalloutDot n={4} delay={0.45} />
      </div>
    </motion.div>
  )
}

export default function SessionCells() {
  return (
    <section id="session" className="scroll-mt-20">
      <SectionHeading
        title="Cells that remember everything."
        lead="Every evaluation lands in a session cell: the form you sent, what it printed, what it returned, and anything it complained about — one scannable unit, kept forever."
      />

      <div className="mt-12 grid items-start gap-10 xl:grid-cols-[1fr_260px]">
        <CellReplica />
        <CalloutList items={CALLOUTS} />
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {SPECS.map((spec, i) => (
          <motion.div
            key={spec.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ delay: 0.08 * i, duration: 0.4, ease: EASE_OUT }}
            className="cc-panel p-5"
          >
            <p className="text-[13px] font-semibold text-primary">{spec.title}</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-secondary">
              {spec.body}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
