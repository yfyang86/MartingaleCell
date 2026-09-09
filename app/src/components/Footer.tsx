import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

const COLUMNS: { title: string; links: { label: string; to: string; external?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'IDE', to: '/ide' },
      { label: 'Examples', to: '/examples' },
      { label: 'Docs', to: '/docs' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { label: 'Common Lisp', to: 'https://common-lisp.net', external: true },
      { label: 'HyperSpec', to: 'http://www.lispworks.com/documentation/HyperSpec/Front/', external: true },
      { label: 'ECL', to: 'https://ecl.common-lisp.dev', external: true },
    ],
  },
  {
    title: 'Project',
    links: [
      { label: 'GitHub', to: 'https://github.com', external: true },
      { label: 'Changelog', to: '/docs' },
      { label: 'License — MIT', to: 'https://opensource.org/licenses/MIT', external: true },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="border-t border-hairline bg-panel">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.9 }}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.08 } },
        }}
        className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 md:grid-cols-4"
      >
        <motion.div
          variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="" width={24} height={24} className="h-6 w-6" />
            <span className="font-display text-[16px] font-semibold tracking-tight">
              <span className="text-primary">Cons</span>
              <span className="text-steel">Cell</span>
            </span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-secondary">
            The browser is the Lisp machine.
          </p>
        </motion.div>

        {COLUMNS.map((col) => (
          <motion.div
            key={col.title}
            variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <h4 className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              {col.title}
            </h4>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  {link.external ? (
                    <a
                      href={link.to}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[13px] text-secondary transition-colors duration-150 ease-snap hover:text-white"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      to={link.to}
                      className="text-[13px] text-secondary transition-colors duration-150 ease-snap hover:text-white"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </motion.div>

      <div className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-5 sm:flex-row sm:justify-between sm:px-6">
          <p className="font-mono text-[11px] text-muted">
            © 2025 ConsCell — runs 100% client-side. No code ever leaves your machine.
          </p>
          <p className="font-mono text-[11px] text-muted" aria-hidden>
            ((()))<span className="text-lisp">λ</span>((()))
          </p>
        </div>
      </div>
    </footer>
  )
}
