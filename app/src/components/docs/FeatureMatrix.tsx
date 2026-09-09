import { motion } from 'framer-motion'
import { CheckCircle2, CircleDashed, Clock } from 'lucide-react'
import { SectionHeading, EASE_OUT } from './shared'
import { ClCode } from './cl-highlight'

type Status = 'full' | 'partial' | 'planned'

interface Row {
  area: string
  status: Status
  notes: string
}

const ROWS: Row[] = [
  { area: 'Reader & printer', status: 'full', notes: 'All standard readmacros; *print-circle*, *print-readably*' },
  { area: 'Evaluation & compilation', status: 'full', notes: 'eval, compile, compile-file (in-memory FS), disassemble' },
  { area: 'CLOS', status: 'full', notes: 'Full class system, method combinations, change-class' },
  { area: 'Condition system', status: 'full', notes: 'handler-bind/case, restart-case, interactive debugger with clickable restarts' },
  { area: 'Numbers', status: 'full', notes: 'Bignums, ratios, complex; floats are IEEE doubles' },
  { area: 'Sequences, arrays, hash tables', status: 'full', notes: 'Including displaced & adjustable arrays' },
  { area: 'LOOP / FORMAT / pretty printer', status: 'full', notes: 'format via gray streams into the OUT block' },
  { area: 'Packages & symbols', status: 'full', notes: 'defpackage, reader integration in the IDE package pill' },
  { area: 'MOP', status: 'partial', notes: 'slot-value-using-class etc.; ensure-generic-function edge cases pending' },
  { area: 'Gray streams', status: 'partial', notes: 'Core protocol; stream-advance-to-column unimplemented' },
  { area: 'Pathnames & files', status: 'partial', notes: 'In-memory FS persisted to IndexedDB; no host filesystem access' },
  { area: 'FFI / foreign calls', status: 'planned', notes: 'Not meaningful under WASM; WASI experiments planned' },
  { area: 'Threads (bordeaux-threads)', status: 'planned', notes: 'Blocked on WASM threads + shared-memory COOP/COEP headers' },
]

const PILL: Record<Status, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  full: {
    label: 'Full',
    className: 'border-success/30 bg-success/10 text-success',
    Icon: CheckCircle2,
  },
  partial: {
    label: 'Partial',
    className: 'border-warning/30 bg-warning/10 text-warning',
    Icon: CircleDashed,
  },
  planned: {
    label: 'Planned',
    className: 'border-error/30 bg-error/10 text-error',
    Icon: Clock,
  },
}

function StatusPill({ status, delay }: { status: Status; delay: number }) {
  const { label, className, Icon } = PILL[status]
  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ delay, type: 'spring', stiffness: 380, damping: 24 }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] ${className}`}
    >
      <Icon size={12} strokeWidth={2} />
      {label}
    </motion.span>
  )
}

/** Render inline `code` fragments inside the notes column with the CL theme. */
function Notes({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*|\b(?:eval|compile|compile-file|disassemble|change-class|handler-bind|restart-case|format|defpackage|slot-value-using-class|ensure-generic-function|stream-advance-to-column|bordeaux-threads)\b)/g)
  return (
    <span>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code key={i} className="font-mono text-[12px]">
            <ClCode code={p} />
          </code>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  )
}

export default function FeatureMatrix() {
  return (
    <section id="features" className="scroll-mt-20">
      <SectionHeading
        title="ANSI Common Lisp, feature by feature."
        lead="What the ECL→WASM build supports today. Updated per release; target: full ANSI conformance."
      />

      {/* Coverage banner */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="cc-panel mt-10 p-6"
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="text-brand-gradient font-display text-[48px] font-bold leading-none tracking-tight">
              89%
            </span>
            <p className="mt-2 text-[12px] font-medium uppercase tracking-[0.12em] text-muted">
              of the ANSI specification covered
            </p>
          </div>
          <p className="hidden max-w-[220px] text-right text-[12px] leading-relaxed text-secondary sm:block">
            Full condition system, CLOS, and the LOOP/FORMAT trio — in a browser tab.
          </p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-inset">
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 0.89 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ duration: 1.2, ease: EASE_OUT }}
            style={{ transformOrigin: 'left', background: 'var(--brand-gradient)' }}
            className="h-full w-full rounded-full"
          />
        </div>
      </motion.div>

      {/* Matrix table */}
      <div className="mt-6 overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline bg-panel">
              <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                Area
              </th>
              <th className="w-28 px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                Status
              </th>
              <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, i) => (
              <motion.tr
                key={row.area}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ delay: (i % 4) * 0.06, duration: 0.4, ease: EASE_OUT }}
                className="border-b border-hairline transition-colors duration-150 ease-snap last:border-b-0 hover:bg-raised"
              >
                <td className="px-4 py-3 text-[13px] font-medium text-primary">
                  {row.area}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={row.status} delay={(i % 4) * 0.06 + 0.1} />
                </td>
                <td className="px-4 py-3 text-[13px] leading-relaxed text-secondary">
                  <Notes text={row.notes} />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[12px] text-muted">
        Run{' '}
        <code className="font-mono text-[11.5px]">
          <ClCode code="(lisp-implementation-version)" />
        </code>{' '}
        in the IDE for the exact ECL build.
      </p>
    </section>
  )
}
