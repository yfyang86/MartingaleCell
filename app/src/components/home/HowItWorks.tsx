import { useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

gsap.registerPlugin(ScrollTrigger)

const STEP1_CODE = '(defun greet (name) (format t "Hello, ~A" name))'

const STEPS = [
  {
    n: '01',
    title: 'Write',
    copy: 'A real editor — highlighting, completion, structural editing.',
  },
  {
    n: '02',
    title: 'Evaluate',
    copy: 'One keystroke sends the form at point to ECL — values, output, and timing come back as a cell.',
  },
  {
    n: '03',
    title: 'Inspect',
    copy: 'Conditions surface as interactive restarts. The log records everything. Nothing is swallowed.',
  },
]

/** Fully-highlighted step-1 form (shown once typing completes) */
function GreetFormHighlighted() {
  return (
    <span className="font-mono text-[13px] leading-[1.7]">
      <span className="tok-paren-1">(</span>
      <span className="tok-keyword">defun</span> <span className="tok-symbol">greet</span>{' '}
      <span className="tok-paren-2">(</span>
      <span className="tok-symbol">name</span>
      <span className="tok-paren-2">)</span>{' '}
      <span className="tok-paren-2">(</span>
      <span className="tok-keyword">format</span> <span className="tok-constant">t</span>{' '}
      <span className="tok-string">"Hello, ~A"</span> <span className="tok-symbol">name</span>
      <span className="tok-paren-2">)</span>
      <span className="tok-paren-1">)</span>
    </span>
  )
}

function PanelWrite({ typedChars }: { typedChars: number }) {
  const done = typedChars >= STEP1_CODE.length
  return (
    <div className="p-4">
      <p className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Editor — scratch.lisp
      </p>
      <div className="rounded-md border border-hairline bg-editor p-4">
        {done ? (
          <GreetFormHighlighted />
        ) : (
          <span className="font-mono text-[13px] leading-[1.7] text-primary">
            {STEP1_CODE.slice(0, typedChars)}
            <span className="ml-0.5 inline-block h-[15px] w-[7px] translate-y-[2px] animate-caret-blink bg-steel" />
          </span>
        )}
      </div>
    </div>
  )
}

function PanelEvaluate({ resolved }: { resolved: boolean }) {
  return (
    <div className="p-4">
      <p className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Session — CL-USER
      </p>
      <div className="cc-cell cc-cell-input p-3.5 pl-5">
        <span className="font-mono text-[12px] text-muted">CL-USER&gt; </span>
        <GreetFormHighlighted />
      </div>
      <div className="cc-cell cc-cell-result mt-3 p-3.5 pl-5">
        {!resolved ? (
          <span className="flex items-center gap-2 font-mono text-[12px] text-secondary">
            <Loader2 size={13} className="animate-spin text-steel" />
            Evaluating…
          </span>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[12px] text-muted">;; OUT</span>
              <span className="font-mono text-[13px] text-primary">Hello, world</span>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[12px] text-muted">;;=&gt;</span>
                <span className="tok-constant font-mono text-[13px]">NIL</span>
              </div>
              <span className="font-mono text-[11px] text-muted">3 ms</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PanelInspect({ phase }: { phase: 'warn' | 'error' | 'resolved' }) {
  return (
    <div className="p-4">
      <p className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Session — debugger
      </p>
      <div className="cc-cell cc-cell-warning p-3 pl-5">
        <span className="font-mono text-[12px] text-warning">;;! </span>
        <span className="font-mono text-[12.5px] text-secondary">
          STYLE-WARNING: redefining <span className="tok-symbol">GREET</span>
        </span>
      </div>
      {(phase === 'error' || phase === 'resolved') && (
        <div className="cc-cell cc-cell-error mt-3 p-3.5 pl-5">
          <p className="font-mono text-[12.5px] text-error">
            UNBOUND-VARIABLE: the variable <span className="tok-constant">NAEM</span> is unbound.
          </p>
          <div className="mt-3 space-y-1">
            {['[0] ABORT — return to top level', '[1] RETRY — re-evaluate the form'].map((r) => (
              <p key={r} className="font-mono text-[12px] text-secondary">
                {r}
              </p>
            ))}
            <p
              className={cn(
                'rounded px-1 py-0.5 font-mono text-[12px] transition-colors duration-150',
                phase === 'resolved' ? 'bg-steel-dim text-steel-bright' : 'text-secondary'
              )}
            >
              [2] USE-VALUE — supply a value to use
            </p>
          </div>
          {phase === 'resolved' && (
            <p className="mt-3 font-mono text-[12px] text-success">;; resumed</p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * "How it works" (home.md §5): GSAP ScrollTrigger pins the section for 180vh;
 * the right code panel morphs through write → evaluate → inspect scenes,
 * driven by scroll progress. Discrete scene state — no per-frame re-renders.
 */
export default function HowItWorks() {
  const rootRef = useRef<HTMLElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState(0)

  useGSAP(
    () => {
      const st = ScrollTrigger.create({
        trigger: rootRef.current,
        start: 'top top',
        end: '+=180%',
        pin: true,
        scrub: 0.3,
        onUpdate: (self) => {
          const next = Math.min(6, Math.floor(self.progress * 7))
          setScene((prev) => (prev === next ? prev : next))
          if (progressRef.current) {
            progressRef.current.style.transform = `scaleY(${self.progress})`
          }
        },
      })
      return () => st.kill()
    },
    { scope: rootRef }
  )

  const step = scene <= 1 ? 0 : scene <= 3 ? 1 : 2

  return (
    <section ref={rootRef} className="relative flex min-h-[100dvh] items-center overflow-hidden px-4 py-24 sm:px-6">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
        {/* Left: sticky step list with progress line */}
        <div className="relative pl-8">
          <div className="absolute bottom-2 left-0 top-2 w-px bg-hairline" aria-hidden>
            <div
              ref={progressRef}
              className="h-full w-full origin-top"
              style={{ background: 'var(--brand-gradient)', transform: 'scaleY(0)' }}
            />
          </div>
          <p className="font-mono text-[11px] font-medium tracking-[0.2em] text-steel">
            HOW IT WORKS
          </p>
          <div className="mt-8 space-y-10">
            {STEPS.map((s, i) => (
              <div
                key={s.n}
                className={cn(
                  'relative border-l-2 pl-6 transition-all duration-200 ease-snap',
                  step === i
                    ? 'border-steel opacity-100'
                    : 'border-transparent opacity-40'
                )}
              >
                <span
                  className="font-display text-[56px] font-bold leading-none text-transparent"
                  style={{ WebkitTextStroke: '1px var(--border-strong)' }}
                >
                  {s.n}
                </span>
                <h3
                  className={cn(
                    'mt-2 font-display text-[22px] font-semibold',
                    step === i ? 'text-white' : 'text-secondary'
                  )}
                >
                  {s.title}
                </h3>
                <p className="mt-2 max-w-sm text-[14px] leading-[1.65] text-secondary">{s.copy}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: persistent code panel, content morphs per step */}
        <div className="cc-panel min-h-[340px] shadow-modal">
          <div key={scene} className="animate-in fade-in slide-in-from-bottom-2 duration-200">
            {step === 0 && (
              <PanelWrite typedChars={scene === 0 ? Math.floor(STEP1_CODE.length * 0.6) : STEP1_CODE.length} />
            )}
            {step === 1 && <PanelEvaluate resolved={scene >= 3} />}
            {step === 2 && (
              <PanelInspect phase={scene === 4 ? 'warn' : scene === 5 ? 'error' : 'resolved'} />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
