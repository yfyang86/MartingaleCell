import { useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import ParenField from '@/components/home/ParenField'
import MiniRepl from '@/components/home/MiniRepl'

gsap.registerPlugin(SplitText)

export default function Hero() {
  const rootRef = useRef<HTMLElement>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const gradientSpanRef = useRef<HTMLSpanElement>(null)

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) return

      const split = new SplitText(headlineRef.current, { type: 'chars' })

      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
      tl.fromTo(
        '.hero-eyebrow',
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.5 },
        0.1
      )
        .from(
          split.chars,
          { opacity: 0, y: 24, rotation: 30, duration: 0.7, stagger: 0.018 },
          0.25
        )
        /* gradient span wipes in via background-position after the last char */
        .fromTo(
          gradientSpanRef.current,
          { backgroundPosition: '100% 0%' },
          { backgroundPosition: '0% 0%', duration: 0.8, ease: 'power3.out' },
          '>-0.2'
        )
        .fromTo(
          '.hero-subhead',
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.6 },
          '>-0.1'
        )
        .fromTo(
          '.hero-cta',
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 },
          '>-0.15'
        )
        .fromTo(
          '.hero-trust',
          { opacity: 0 },
          { opacity: 1, duration: 0.5 },
          '>-0.1'
        )
        .fromTo(
          '.hero-repl',
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 0.7 },
          '>-0.2'
        )

      return () => {
        split.revert()
      }
    },
    { scope: rootRef }
  )

  return (
    <section
      ref={rootRef}
      className="relative -mt-16 flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-abyss px-4 pb-24 pt-32"
    >
      {/* Layer 1: dot grid */}
      <div className="absolute inset-0 bg-dot-grid" aria-hidden />
      {/* Layer 2: noise overlay at 2.5% */}
      <div className="bg-noise absolute inset-0 opacity-[0.025]" aria-hidden />
      {/* Layer 3: paren particle field (canvas) */}
      <ParenField />
      {/* CSS fallback parens for reduced motion */}
      <div
        className="pointer-events-none absolute inset-0 hidden select-none motion-reduce:block"
        aria-hidden
      >
        <span className="absolute left-[8%] top-[20%] font-mono text-[280px] leading-none text-white/[0.03]">(</span>
        <span className="absolute bottom-[12%] right-[8%] font-mono text-[280px] leading-none text-white/[0.03]">)</span>
      </div>
      {/* Layer 4: corner glows */}
      <div
        className="pointer-events-none absolute -left-40 -top-40 h-[900px] w-[900px] rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #6EA8DC 0%, transparent 60%)' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 h-[900px] w-[900px] rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #7C5CE0 0%, transparent 60%)' }}
        aria-hidden
      />

      {/* Content */}
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center text-center">
        <span className="hero-eyebrow rounded-full border border-hairline bg-panel/60 px-3 py-1 font-mono text-[11px] tracking-wider text-steel opacity-0">
          ECL · WebAssembly · zero install
        </span>

        <h1
          ref={headlineRef}
          className="mt-7 font-display text-[clamp(44px,6vw,76px)] font-bold leading-[1.02] tracking-[-0.03em] text-primary"
        >
          Common Lisp,
          <br />
          running on nothing
          <br />
          but your{' '}
          <span
            ref={gradientSpanRef}
            className="text-brand-gradient"
            style={{ backgroundSize: '220% 100%' }}
          >
            browser.
          </span>
        </h1>

        <p className="hero-subhead mt-6 max-w-2xl text-[18px] leading-[1.65] text-secondary opacity-0">
          ConsCell compiles ECL (Embeddable Common Lisp) to WebAssembly and wraps it in a notebook-style IDE —
          syntax-highlighted editor, persistent result cells, a real condition system with
          restarts. No servers. No setup. Your code never leaves the tab.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/ide"
            className="hero-cta group flex items-center gap-2 rounded-md px-7 py-3.5 text-[15px] font-semibold text-abyss opacity-0 animate-glow-pulse transition-transform [transition-duration:120ms] ease-snap hover:-translate-y-px active:scale-[0.97]"
            style={{ background: 'var(--brand-gradient)' }}
          >
            Launch the IDE
            <ArrowRight
              size={16}
              strokeWidth={2}
              className="transition-transform duration-150 ease-snap group-hover:translate-x-[3px]"
            />
          </Link>
          <Link
            to="/examples"
            className="hero-cta rounded-md border border-hairline px-7 py-3.5 text-[15px] font-medium text-primary opacity-0 transition-all [transition-duration:120ms] ease-snap hover:-translate-y-px hover:border-strong hover:bg-raised active:scale-[0.97]"
          >
            Browse examples
          </Link>
        </div>

        <p className="hero-trust mt-5 font-mono text-[11.5px] text-muted opacity-0">
          ( loads in ~4s · works offline · MIT licensed )
        </p>

        <div className="hero-repl mt-12 flex w-full justify-center opacity-0">
          <MiniRepl />
        </div>
      </div>

      {/* Scroll cue */}
      <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-center">
        <p className="font-mono text-[11px] tracking-widest text-muted">scroll</p>
        <ChevronDown size={16} className="mx-auto mt-1 animate-chevron-drop text-muted" />
      </div>
    </section>
  )
}
