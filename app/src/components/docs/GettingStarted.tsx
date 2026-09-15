import { motion } from 'framer-motion'
import { SectionHeading } from './shared'
import { EASE_OUT } from './motion'

const STEPS = [
  {
    title: 'Boot',
    copy: 'Watch the boot log — the .gz artifacts download and inflate, the runtime instantiates, the image comes up. A service worker keeps the compressed artifacts, so return visits skip the download and work offline.',
  },
  {
    title: 'Write',
    copy: 'The scratch buffer loads a Fibonacci demo. Rainbow parens show your nesting depth at the caret.',
  },
  {
    title: 'Evaluate',
    copy: 'Ctrl+Enter evaluates the top-level form at point into a session cell.',
  },
  {
    title: 'Iterate',
    copy: 'Re-run cells, resume errors via restarts, and read the log to see what the compiler is thinking.',
  },
]

/* what the SBCL worker actually prints (public/sbcl-worker.js), figures from a laptop boot */
const BOOT_LINES: { ok: boolean; text: string }[] = [
  { ok: false, text: 'SBCL/wasm host boot — fetching /sbcl/{sbcl.wasm,sbcl.core,sbcl-core.wasm} (.gz copies first, ~19 MB; ~124 MB inflated)' },
  { ok: true, text: '  sbcl.wasm: 1.4 MB inflated, 0.0 s so far' },
  { ok: true, text: '  sbcl.core: 78.8 MB inflated, 1.0 s so far' },
  { ok: true, text: '  sbcl-core.wasm: 44.4 MB inflated, 1.2 s so far' },
  { ok: true, text: 'artifacts loaded (124.7 MB in 1.2 s) — instantiating the runtime' },
  { ok: false, text: 'ready — happy hacking (SBCL, wasm32-wasip1)   ;; about 4–6 s from the click, ~1 s on ECL' },
]

export default function GettingStarted() {
  return (
    <section id="getting-started" className="scroll-mt-20">
      <SectionHeading
        title="From zero to REPL in a few seconds."
        lead="There is nothing to install. Open the IDE; the SBCL WebAssembly artifacts (about 19 MB, gzip-compressed) download once, inflate in a Web Worker and boot a full ANSI Common Lisp. ECL, cross-compiled to wasm32 by the WECL project, takes over when SBCL cannot boot or when you choose it in Settings → Lisp implementation."
      />

      <ol className="mt-12 space-y-5">
        {STEPS.map((step, i) => (
          <motion.li
            key={step.title}
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ delay: 0.1 * i, duration: 0.5, ease: EASE_OUT }}
            className="flex items-start gap-5"
          >
            <span
              className="font-display text-[40px] font-bold leading-none tracking-tight text-transparent"
              style={{ WebkitTextStroke: '1.5px var(--steel-dim)' }}
              aria-hidden="true"
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="pt-1">
              <p className="text-[15px] font-semibold text-primary">{step.title}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-secondary">
                {step.copy}
              </p>
            </div>
          </motion.li>
        ))}
      </ol>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="mt-10 overflow-x-auto rounded-lg border border-hairline bg-inset p-5 font-mono text-[12.5px] leading-[1.9]"
      >
        {BOOT_LINES.map((line, i) => (
          <div key={i} className="flex items-baseline gap-2 whitespace-pre">
            {line.ok && <span className="text-success">✓</span>}
            <span className={line.ok ? 'text-secondary' : 'text-muted'}>
              {line.text}
            </span>
          </div>
        ))}
      </motion.div>
    </section>
  )
}
