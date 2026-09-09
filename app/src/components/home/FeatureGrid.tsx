import { motion } from 'framer-motion'
import {
  Cpu,
  LayoutPanelLeft,
  ShieldAlert,
  Braces,
  WifiOff,
  Terminal,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react'

interface Feature {
  icon: LucideIcon
  title: string
  copy: string
}

const FEATURES: Feature[] = [
  {
    icon: Cpu,
    title: 'Real ECL, compiled to WASM',
    copy: 'Not a toy interpreter. ECL — a full ANSI Common Lisp — with its compiler and condition system, running at near-native speed in a Web Worker.',
  },
  {
    icon: LayoutPanelLeft,
    title: 'Notebook-grade session',
    copy: 'Every evaluation lands in a persistent cell: echo, printed output, multiple values, warnings. Copy, re-run, or paste any cell back into the editor.',
  },
  {
    icon: ShieldAlert,
    title: 'True conditions & restarts',
    copy: "Errors aren't dead ends. The debugger lists live restarts — abort, retry, use-value — and clicking one resumes your program, exactly like CL demands.",
  },
  {
    icon: Braces,
    title: 'An editor that speaks S-expr',
    copy: 'Rainbow parens, depth-aware indent, arglist hints, symbol autocomplete, and structural selection. Parentheses stop being scary.',
  },
  {
    icon: FolderOpen,
    title: 'Projects, not just snippets',
    copy: 'Open a real folder (or import a ZIP), edit files with dirty tracking and true saves, then load the whole tree into the runtime — ASDF systems included — and call your code. Loaded symbols flow into autocomplete.',
  },
  {
    icon: WifiOff,
    title: '100% client-side',
    copy: 'No backend, no telemetry. Buffers and history persist in IndexedDB; share links carry code in the URL. Works on a plane.',
  },
  {
    icon: Terminal,
    title: 'Logs that respect you',
    copy: 'A filterable console with levels, sources, timestamps, and a live WASM heap meter. Boot sequences, compiler notes, eval traces — all inspectable.',
  },
]

/** Feature grid (home.md §4): 6 cell-styled cards, stagger in on scroll */
export default function FeatureGrid() {
  return (
    <section id="features" className="relative px-4 py-28 sm:px-6 md:py-36">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-2xl"
        >
          <p className="font-mono text-[11px] font-medium tracking-[0.2em] text-steel">
            WHY CONSCELL
          </p>
          <h2 className="mt-4 font-display text-[clamp(30px,4vw,44px)] font-semibold leading-[1.1] tracking-[-0.02em] text-primary">
            A Lisp machine with a browser address
          </h2>
          <p className="mt-4 text-[17px] leading-[1.65] text-secondary">
            Everything you'd expect from a serious Common Lisp environment — reimagined as a
            single web page.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}
          className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((feature) => (
            <motion.article
              key={feature.title}
              variants={{
                hidden: { opacity: 0, y: 32 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="group relative overflow-hidden rounded-lg border border-hairline bg-raised p-7 transition-all duration-150 ease-snap hover:-translate-y-[3px] hover:border-strong"
            >
              {/* steel glow behind on hover */}
              <div
                className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                style={{ background: 'radial-gradient(circle, rgba(110,168,220,.08) 0%, transparent 70%)' }}
                aria-hidden
              />
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-steel-dim">
                <feature.icon size={18} strokeWidth={1.75} className="text-steel-bright" />
              </div>
              <h3 className="mt-5 font-display text-[18px] font-semibold text-primary">
                {feature.title}
              </h3>
              <p className="mt-2.5 text-[14px] leading-[1.65] text-secondary">{feature.copy}</p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
