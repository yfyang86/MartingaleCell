import { motion } from 'framer-motion'
import { SectionHeading, EASE_OUT } from './shared'

const STEPS = [
  {
    title: 'Boot',
    copy: 'Watch the boot log — fetch, instantiate, map core, warm-up. Cached on return visits.',
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

const BOOT_LINES: { ok: boolean; text: string }[] = [
  { ok: false, text: ';; ConsCell runtime boot — ECL (ANSI Common Lisp) compiled to WebAssembly · project WECL' },
  { ok: true, text: 'fetch      ecl.wasm ................ 24.7 MB (Cache API)' },
  { ok: true, text: 'instantiate wasm module ............ 412 ms' },
  { ok: true, text: 'map core image ..................... 208 ms' },
  { ok: true, text: 'warm-up eval ....................... 96 ms' },
  { ok: false, text: ';; ready in 0.9s — self-hosted runtime, no server round-trips' },
]

export default function GettingStarted() {
  return (
    <section id="getting-started" className="scroll-mt-20">
      <SectionHeading
        title="From zero to REPL in four seconds."
        lead="There is nothing to install. Open the IDE; the ECL WebAssembly image downloads once, caches itself, and boots. ECL — Embeddable Common Lisp — is a full ANSI Common Lisp, cross-compiled to wasm32 by the WECL project and self-hosted in a Web Worker."
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
