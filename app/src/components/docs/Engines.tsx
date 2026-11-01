import { motion } from 'framer-motion'
import { Cpu, LifeBuoy, SlidersHorizontal, GitCompareArrows } from 'lucide-react'
import { SectionHeading } from './shared'
import { EASE_OUT } from './motion'
import { useI18n } from '@/i18n/context'

/* Sprint 30: the engine story the IDE itself follows (src/lisp/engine-pref.ts) */
const CARDS = [
  {
    Icon: Cpu,
    title: 'SBCL — the default',
    body: 'Steel Bank Common Lisp 2.4.8 compiled to wasm32-wasip1. About 19 MB of gzip-compressed artifacts, downloaded once and kept by the service worker, inflated to ~125 MB in the worker; a REPL in 4–6 s on a laptop.',
  },
  {
    Icon: LifeBuoy,
    title: 'ECL — the fallback',
    body: 'Embeddable Common Lisp, cross-compiled to WebAssembly by the WECL project. About 9.5 MB, up in about a second. Boots automatically when SBCL cannot (artifacts missing, no isolation headers).',
  },
  {
    Icon: SlidersHorizontal,
    title: 'Switching',
    body: 'Settings → Lisp implementation: auto (SBCL, then ECL), ecl, or sbcl. The choice is kept per browser; Restart Lisp image brings the other engine up with its download in the status bar.',
  },
  {
    Icon: GitCompareArrows,
    title: 'Same session either way',
    body: 'Cells, projects, packages, the debugger, standard input and gnuplot capture work on both. The session protocol is the same; only the image behind it changes.',
  },
]

const ROWS: [string, string, string][] = [
  ['Standard', 'SBCL 2.4.8, wasm32-wasip1', 'ANSI CL via WECL'],
  ['Boot', '~4–6 s (19 MB .gz, 125 MB inflated)', '~1 s (9.5 MB)'],
  ['Compiler', 'native SBCL compiler in the image', 'bytecode compiler per form'],
  ['Threads', 'no sb-thread in the wasm image', 'none'],
  ['Subprocesses', 'ext:shell intercepted (gnuplot → SVG) or a clean error', 'same'],
  ['Licence', 'public domain + MIT/BSD-style parts', 'LGPL-2.1+, shipped unmodified'],
]

export default function Engines() {
  const { t } = useI18n()
  return (
    <section id="engines" className="scroll-mt-20">
      <SectionHeading
        title="Two engines, one session."
        lead="MartingaleCell boots SBCL by default and falls back to ECL when SBCL cannot come up. Both are real ANSI Common Lisp implementations compiled to WebAssembly and run in a Web Worker; JSCL and a small demo interpreter sit further down the ladder for pages where neither wasm image loads."
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {CARDS.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ delay: 0.1 * i, duration: 0.45, ease: EASE_OUT }}
            className="cc-cell cc-cell-input p-6 transition-all [transition-duration:160ms] ease-snap hover:-translate-y-[3px] hover:border-strong hover:shadow-[0_8px_32px_rgba(110,168,220,0.08)]"
          >
            <card.Icon size={18} strokeWidth={1.75} className="text-steel" />
            <p className="mt-3 text-[14px] font-semibold text-primary">{t(card.title)}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">{t(card.body)}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="mt-8 overflow-x-auto rounded-lg border border-hairline"
      >
        <table className="w-full text-left text-[13px]" data-testid="engine-table">
          <thead className="bg-inset text-[11px] uppercase tracking-[0.12em] text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">&nbsp;</th>
              <th className="px-4 py-2.5 font-medium">{t('SBCL (default)')}</th>
              <th className="px-4 py-2.5 font-medium">{t('ECL (fallback)')}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([k, a, b]) => (
              <tr key={k} className="border-t border-hairline">
                <td className="px-4 py-2.5 font-semibold text-primary">{t(k)}</td>
                <td className="px-4 py-2.5 text-secondary">{t(a)}</td>
                <td className="px-4 py-2.5 text-secondary">{t(b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>

      <p className="mt-4 text-[12px] text-muted">
        {t('The status bar names the running engine; the boot log shows which one came up and why.')}
      </p>
    </section>
  )
}
