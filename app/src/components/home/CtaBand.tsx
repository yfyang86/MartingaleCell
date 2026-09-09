import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

/** CTA band (home.md §7) */
export default function CtaBand() {
  return (
    <section className="relative overflow-hidden border-t border-hairline bg-panel px-4 py-32 sm:px-6">
      {/* noise overlay */}
      <div className="bg-noise absolute inset-0 opacity-[0.025]" aria-hidden />
      {/* central purple/steel conic glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/2 opacity-20"
        style={{
          background: 'conic-gradient(from 180deg, #7C5CE0, #6EA8DC, #7C5CE0)',
          filter: 'blur(120px)',
        }}
        aria-hidden
      />
      {/* oversized decorative parens, drift apart on scroll parallax */}
      <motion.span
        initial={{ x: 0 }}
        whileInView={{ x: -30 }}
        viewport={{ once: false, amount: 0.6 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute left-[12%] top-1/2 -translate-y-1/2 select-none font-mono text-[96px] leading-none text-[#8FC3EE]/10"
        aria-hidden
      >
        (
      </motion.span>
      <motion.span
        initial={{ y: '-50%' }}
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 select-none font-mono text-[96px] leading-none text-[#A78BFA]/10"
        aria-hidden
      >
        λ
      </motion.span>
      <motion.span
        initial={{ x: 0 }}
        whileInView={{ x: 30 }}
        viewport={{ once: false, amount: 0.6 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute right-[12%] top-1/2 -translate-y-1/2 select-none font-mono text-[96px] leading-none text-[#F472B6]/10"
        aria-hidden
      >
        )
      </motion.span>

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.7 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-[clamp(30px,4vw,44px)] font-semibold leading-[1.1] tracking-[-0.02em] text-primary"
        >
          Your next REPL session is one click away.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.7 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 text-[17px] leading-[1.65] text-secondary"
        >
          Open the IDE, press <kbd className="cc-kbd">Ctrl</kbd> + <kbd className="cc-kbd">Enter</kbd>,
          and you're programming Common Lisp.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.7 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-9"
        >
          <Link
            to="/ide"
            className="group inline-flex items-center gap-2 rounded-md px-7 py-3.5 text-[15px] font-semibold text-abyss animate-glow-pulse transition-transform [transition-duration:120ms] ease-snap hover:-translate-y-px active:scale-[0.97]"
            style={{ background: 'var(--brand-gradient)' }}
          >
            Launch ConsCell
            <ArrowRight
              size={16}
              strokeWidth={2}
              className="transition-transform duration-150 ease-snap group-hover:translate-x-[3px]"
            />
          </Link>
          <p className="mt-4 font-mono text-[11.5px] text-muted">
            no account · no install · no kidding
          </p>
        </motion.div>
      </div>
    </section>
  )
}
