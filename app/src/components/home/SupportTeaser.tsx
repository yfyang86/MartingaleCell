import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, useMotionValue, useTransform, animate } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useI18n } from '@/i18n/context'

const ROWS = [
  { label: 'Core language (reader, evaluation, CLOS)', pct: 96 },
  { label: 'Condition system & restarts', pct: 92 },
  { label: 'Loop / Format / pretty printer', pct: 88 },
  { label: 'MOP & gray streams', pct: 71 },
]

function StatRow({ label, pct, index }: { label: string; pct: number; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.75 })
  const progress = useMotionValue(0)
  const display = useTransform(progress, (v) => `${Math.round(v)}%`)
  const barScale = useTransform(progress, [0, 100], [0, 1])

  useEffect(() => {
    if (!inView) return
    const controls = animate(progress, pct, {
      duration: 0.9,
      delay: index * 0.1,
      ease: [0.16, 1, 0.3, 1], /* power3.out */
    })
    return () => controls.stop()
  }, [inView, pct, index, progress])

  return (
    <div ref={ref}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[14px] text-secondary">{label}</span>
        <motion.span className="font-mono text-[13px] text-primary">{display}</motion.span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-sm bg-inset">
        <motion.div
          className="h-full origin-left rounded-sm"
          style={{ scaleX: barScale, background: 'var(--brand-gradient)' }}
        />
      </div>
    </div>
  )
}

/** Support matrix teaser (home.md §6) */
export default function SupportTeaser() {
  const { t } = useI18n()
  return (
    <section className="px-4 py-28 sm:px-6 md:py-36">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.7 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="font-mono text-[11px] font-medium tracking-[0.2em] text-steel">{t('COVERAGE')}</p>
          <h2 className="mt-4 font-display text-[clamp(30px,4vw,44px)] font-semibold leading-[1.1] tracking-[-0.02em] text-primary">
            {t('Serious about the standard')}
          </h2>
          <p className="mt-4 max-w-md text-[17px] leading-[1.65] text-secondary">
            {t('Track ANSI Common Lisp support feature by feature.')}
          </p>
          <Link
            to="/docs#features"
            className="group mt-7 inline-flex items-center gap-2 rounded-md border border-hairline px-4 py-2 text-[13.5px] font-medium text-primary transition-all [transition-duration:120ms] ease-snap hover:-translate-y-px hover:border-strong hover:bg-raised"
          >
            {t('See the full matrix')}
            <ArrowRight
              size={14}
              strokeWidth={2}
              className="transition-transform duration-150 ease-snap group-hover:translate-x-[3px]"
            />
          </Link>
        </motion.div>

        <div className="space-y-6">
          {ROWS.map((row, i) => (
            <StatRow key={row.label} label={t(row.label)} pct={row.pct} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
