import { motion } from 'framer-motion'
import { ChevronRight, CircleAlert } from 'lucide-react'
import { SectionHeading, CalloutDot, CalloutList, EASE_OUT } from './shared'
import { ClCode } from './cl-highlight'

const CALLOUTS = [
  {
    title: 'Condition report',
    body: 'The signaled condition, printed in full — type, format arguments, and the form that raised it.',
  },
  {
    title: 'Restart rows',
    body: 'Every established restart, clickable. Keys 0–4 work while the debugger cell has focus.',
  },
  {
    title: 'Frames expander',
    body: 'The backtrace, collapsed by default. Expand to walk the stack frame by frame.',
  },
  {
    title: 'Resolution line',
    body: 'After you pick a restart, the cell records how the condition was resolved and evaluation resumes.',
  },
]

const RESTARTS = [
  { key: '0', name: 'ABORT', desc: 'Return to the top-level REPL', active: false },
  { key: '1', name: 'USE-VALUE', desc: 'Supply a value to use instead', active: false },
  { key: '2', name: 'RETURN-ZERO', desc: 'Return 0 instead', active: false },
  { key: '3', name: 'CONTINUE', desc: 'Pretend the division succeeded', active: true },
]

const CODE_LINES = [
  '(defun safe-divide (a b)',
  '  (restart-case (/ a b)',
  '    (use-value (v) :report "Supply a value" v)',
  '    (return-zero () :report "Return 0 instead" 0)))',
]

function DebuggerReplica() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
      className="cc-cell cc-cell-error font-mono text-[12.5px] leading-[1.7]"
    >
      {/* [1] condition report */}
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <CircleAlert size={14} strokeWidth={1.75} className="mt-[3px] shrink-0 text-error" />
          <div>
            <p className="text-[12.5px] font-semibold text-error">
              DIVISION-BY-ZERO
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-secondary">
              signaled in <span className="tok-symbol">SAFE-DIVIDE</span> with arguments{' '}
              <span className="tok-number">10</span>, <span className="tok-number">0</span>
            </p>
          </div>
        </div>
        <CalloutDot n={1} delay={0} />
      </div>

      {/* [2] restart rows */}
      <div className="border-t border-hairline px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.12em] text-muted">
            Available restarts
          </span>
          <CalloutDot n={2} delay={0.15} />
        </div>
        <div className="space-y-1">
          {RESTARTS.map((r) => (
            <div
              key={r.key}
              className={`flex items-baseline gap-3 rounded-md px-2 py-1.5 ${
                r.active
                  ? 'border border-steel/40 bg-steel-dim/30'
                  : 'border border-transparent hover:bg-raised'
              }`}
            >
              <span className="cc-kbd">{r.key}</span>
              <span className={r.active ? 'font-semibold text-steel-bright' : 'text-primary'}>
                {r.name}
              </span>
              <span className="text-[12px] text-secondary">— {r.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* [3] frames expander */}
      <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-2.5">
        <button
          type="button"
          className="flex items-center gap-1.5 text-[12px] text-secondary transition-colors duration-150 ease-snap hover:text-white"
        >
          <ChevronRight size={13} strokeWidth={2} />
          Backtrace — 7 frames
        </button>
        <CalloutDot n={3} delay={0.3} />
      </div>

      {/* [4] resolution line */}
      <div className="flex items-center justify-between gap-3 border-t border-hairline bg-panel/60 px-4 py-2">
        <span className="text-[11.5px] text-muted">
          <span className="text-success">✓</span> resolved via{' '}
          <span className="text-steel-bright">CONTINUE</span> — evaluation resumed · 3 ms
        </span>
        <CalloutDot n={4} delay={0.45} />
      </div>
    </motion.div>
  )
}

export default function DebuggerSection() {
  return (
    <section id="debugger" className="scroll-mt-20">
      <SectionHeading
        title="Errors you can talk back to."
        lead="When a condition is signaled, ConsCell renders the restart list inline. Choosing a restart resumes evaluation — no re-run required. This is the full ANSI condition system, not a try/catch shim."
      />

      <div className="mt-12 grid items-start gap-10 xl:grid-cols-[1fr_260px]">
        <DebuggerReplica />
        <CalloutList items={CALLOUTS} />
      </div>

      <p className="mt-12 text-[14px] leading-relaxed text-secondary">
        Establish your own restarts with{' '}
        <code className="font-mono text-[12.5px]">
          <ClCode code="restart-case" />
        </code>{' '}
        — paste this into the IDE and divide by zero:
      </p>

      <motion.pre
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.6 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.025 } } }}
        className="mt-4 overflow-x-auto rounded-lg border border-hairline bg-inset p-5 font-mono text-[12.5px] leading-[1.7]"
      >
        <code>
          {CODE_LINES.map((line, i) => (
            <motion.div
              key={i}
              variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
              transition={{ duration: 0.3 }}
            >
              <ClCode code={line} />
            </motion.div>
          ))}
        </code>
      </motion.pre>
    </section>
  )
}
