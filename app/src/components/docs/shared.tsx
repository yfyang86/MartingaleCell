import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { EASE_OUT } from './motion'
import { useI18n } from '@/i18n/context'

/** Section heading: H2 + optional lead, rises on entry. */
export function SectionHeading({
  title,
  lead,
  children,
}: {
  title: string
  lead?: string
  children?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.8 }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
    >
      <h2 className="font-display text-[clamp(26px,3.4vw,36px)] font-semibold leading-[1.1] tracking-[-0.02em] text-primary">
        {t(title)}
      </h2>
      {lead && (
        <p className="mt-3 max-w-xl text-[16px] leading-[1.65] text-secondary">
          {t(lead)}
        </p>
      )}
      {children}
    </motion.div>
  )
}

/** Divider between sections: hairline + decorative `;; ───` mono marker. */
export function SectionDivider() {
  return (
    <div className="my-24 flex items-center gap-4" aria-hidden="true">
      <span className="font-mono text-[12px] text-muted">;;</span>
      <div className="h-px flex-1 bg-hairline" />
      <span className="font-mono text-[12px] tracking-[0.3em] text-muted">───</span>
      <div className="h-px flex-1 bg-hairline" />
    </div>
  )
}

/** Numbered steel callout dot — pops in with a delay. */
export function CalloutDot({ n, delay = 0 }: { n: number; delay?: number }) {
  return (
    <motion.span
      initial={{ scale: 0, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ delay, type: 'spring', stiffness: 380, damping: 22 }}
      className="inline-flex h-[18px] w-[18px] shrink-0 select-none items-center justify-center rounded-full border border-steel/60 bg-steel-dim/60 font-mono text-[10px] font-semibold text-steel-bright"
    >
      {n}
    </motion.span>
  )
}

/** Paired explanation list for annotated replicas, with a connecting line that draws in. */
export function CalloutList({
  items,
  className = '',
}: {
  items: { title: string; body: ReactNode }[]
  className?: string
}) {
  const { t } = useI18n()
  return (
    <div className={`relative pl-1 ${className}`}>
      {/* connecting 1px line drawing top→bottom */}
      <motion.span
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        style={{ transformOrigin: 'top' }}
        className="absolute left-[10px] top-2 bottom-2 w-px bg-hairline"
        aria-hidden="true"
      />
      <ol className="space-y-5">
        {items.map((item, i) => (
          <motion.li
            key={item.title}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ delay: 0.15 * i, duration: 0.35, ease: EASE_OUT }}
            className="relative flex gap-3 pl-0"
          >
            <CalloutDot n={i + 1} delay={0.15 * i} />
            <div>
              <p className="text-[13px] font-semibold text-primary">{t(item.title)}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-secondary">
                {typeof item.body === 'string' ? t(item.body) : item.body}
              </p>
            </div>
          </motion.li>
        ))}
      </ol>
    </div>
  )
}
