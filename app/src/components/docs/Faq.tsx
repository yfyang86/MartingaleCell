import { motion } from 'framer-motion'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { SectionHeading } from './shared'
import { EASE_OUT } from './motion'

const FAQS = [
  {
    q: 'Is this real Common Lisp?',
    a: 'Yes — two full ANSI Common Lisp implementations compiled to WebAssembly and self-hosted in a Web Worker: SBCL (the default, wasm32-wasip1) and ECL (cross-compiled by the WECL project, the fallback). If neither wasm image loads, ConsCell falls back to JSCL, then to a small demo evaluator — every engine speaks the same session protocol.',
  },
  {
    q: 'How big is the download?',
    a: 'SBCL: about 19 MB of gzip-compressed artifacts, inflated to ~125 MB in memory, a REPL in 4–6 s. ECL: about 9.5 MB, up in about a second. Return visits are quicker because the browser keeps the compressed files in its HTTP cache.',
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
    a: 'Yes, after the first load. A service worker keeps the app shell and the engine artifacts of the version you loaded, so the IDE opens and boots without a network; a new version downloads its artifacts once and replaces the old cache.',
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
