import { motion } from 'framer-motion'

const FORMS = [
  '(defmacro once-only …)',
  '(loop for x below 10 collect …)',
  '(handler-case …)',
  '(format t "~R" 42)',
  "(make-instance '…)",
  '(restart-case …)',
  '(values 1 2 3)',
]

function TickerItems() {
  return (
    <>
      {FORMS.map((form, i) => (
        <span key={i} className="flex shrink-0 items-center">
          <span className={i % 2 === 0 ? 'text-muted' : 'text-steel'}>{form}</span>
          <span className="mx-6 text-lisp">λ</span>
        </span>
      ))}
    </>
  )
}

/** Feature ticker (home.md §3): infinite marquee of CL forms, pause on hover */
export default function FeatureTicker() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.85 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="border-y border-hairline bg-panel"
      aria-hidden
    >
      <div className="group flex h-10 items-center overflow-hidden">
        <div className="flex w-max animate-marquee font-mono text-[12.5px] group-hover:pause-animation">
          <TickerItems />
          <TickerItems />
        </div>
      </div>
    </motion.section>
  )
}
