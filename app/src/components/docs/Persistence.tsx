import { motion } from 'framer-motion'
import { HardDrive, Link2, EyeOff } from 'lucide-react'
import { SectionHeading } from './shared'
import { EASE_OUT } from './motion'

const CARDS = [
  {
    Icon: HardDrive,
    title: 'Local first',
    body: 'Buffers, cells, settings, and the WASM image live in IndexedDB & the Cache API.',
  },
  {
    Icon: Link2,
    title: 'Share via URL',
    body: 'Share links compress your buffers into the hash. There is no server to receive anything.',
  },
  {
    Icon: EyeOff,
    title: 'No telemetry',
    body: 'No analytics, no beacons. The network panel stays quiet after the first load.',
  },
]

export default function Persistence() {
  return (
    <section id="persistence" className="scroll-mt-20">
      <SectionHeading
        title="Your code never leaves the tab."
        lead="ConsCell runs 100% client-side. The ECL runtime executes in a Web Worker inside your browser; evaluation, compilation, and persistence are all local."
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
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
            <p className="mt-3 text-[14px] font-semibold text-primary">{card.title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">
              {card.body}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
