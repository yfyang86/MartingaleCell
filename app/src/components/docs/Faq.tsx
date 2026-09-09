import { motion } from 'framer-motion'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { SectionHeading, EASE_OUT } from './shared'

const FAQS = [
  {
    q: 'Is this real Common Lisp?',
    a: 'Yes — the runtime is ECL (Embeddable Common Lisp), a full ANSI Common Lisp implementation, cross-compiled to WebAssembly by the WECL project and self-hosted in a Web Worker. If the WASM image ever fails to load, ConsCell falls back to JSCL, then to a small mock evaluator — both speak the same session protocol.',
  },
  {
    q: 'How big is the download?',
    a: '≈25 MB on first visit, cached aggressively afterwards. Boots in ~1s warm.',
  },
  {
    q: 'Can I load Quicklisp libraries?',
    a: 'Pure-Lisp systems marked :wasm-compatible can be pasted or fetched; FFI-dependent systems are unsupported (see the support matrix above).',
  },
  {
    q: 'Where is my code stored?',
    a: 'IndexedDB in your browser profile. Clearing site data deletes it; export your workspace from Settings first.',
  },
  {
    q: 'Does it work offline?',
    a: 'Fully, after first load. A service worker keeps the runtime and app shell available.',
  },
  {
    q: 'Which browsers?',
    a: 'Latest Chrome, Firefox, Edge, Safari 17+. WASM GC/threads features are progressive enhancements.',
  },
  {
    q: 'Can I use it on mobile?',
    a: 'It runs, but the interface is keyboard-first; the tabbed fallback layout works best on tablets.',
  },
]

export default function Faq() {
  return (
    <section id="faq" className="scroll-mt-20">
      <SectionHeading title="Frequently asked." />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="mt-8"
      >
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((faq, i) => (
            <motion.div
              key={faq.q}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ delay: 0.06 * i, duration: 0.35, ease: EASE_OUT }}
            >
              <AccordionItem value={`faq-${i}`} className="border-hairline">
                <AccordionTrigger className="py-4 text-[15px] font-semibold text-primary hover:no-underline hover:text-steel-bright [&[data-state=open]>svg]:text-steel">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-[14px] leading-relaxed text-secondary">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            </motion.div>
          ))}
        </Accordion>
      </motion.div>
    </section>
  )
}
