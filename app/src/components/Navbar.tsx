import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Github, Menu, X, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { label: 'Features', to: '/#features' },
  { label: 'Examples', to: '/examples' },
  { label: 'Docs', to: '/docs' },
]

function Wordmark() {
  return (
    <span className="font-display text-[17px] font-semibold tracking-tight">
      <span className="text-primary">Cons</span>
      <span className="text-steel">Cell</span>
    </span>
  )
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(() => window.scrollY > 24)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const close = () => setOpen(false)

  return (
    <motion.header
      initial={{ y: -64 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
      className={cn(
        'fixed inset-x-0 top-0 z-50 h-16 border-b transition-colors duration-150 ease-snap',
        scrolled
          ? 'border-hairline bg-[#07080D]/80 backdrop-blur-xl'
          : 'border-transparent bg-transparent'
      )}
    >
      <nav className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Left: logo + wordmark + WASM badge */}
        <Link to="/" className="flex items-center gap-2.5" aria-label="ConsCell home">
          <img src="/logo.svg" alt="" width={26} height={26} className="h-[26px] w-[26px]" />
          <Wordmark />
          <span className="rounded-sm border border-steel/50 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-widest text-steel">
            WASM
          </span>
        </Link>

        {/* Center links */}
        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) =>
            link.to.startsWith('/#') ? (
              <Link
                key={link.label}
                to={link.to}
                className="group relative text-[13.5px] font-medium text-secondary transition-colors duration-150 ease-snap hover:text-white"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-steel transition-all duration-150 ease-snap group-hover:w-full" />
              </Link>
            ) : (
              <NavLink
                key={link.label}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'group relative text-[13.5px] font-medium transition-colors duration-150 ease-snap hover:text-white',
                    isActive ? 'text-white' : 'text-secondary'
                  )
                }
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-steel transition-all duration-150 ease-snap group-hover:w-full" />
              </NavLink>
            )
          )}
        </div>

        {/* Right: GitHub + Launch IDE */}
        <div className="hidden items-center gap-3 md:flex">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="flex h-8 w-8 items-center justify-center rounded-md text-secondary transition-colors duration-150 ease-snap hover:bg-raised hover:text-white"
          >
            <Github size={17} strokeWidth={1.75} />
          </a>
          <Link
            to="/ide"
            className="group flex items-center gap-1.5 rounded-md bg-steel px-4 py-2 text-[13px] font-semibold text-abyss transition-all [transition-duration:120ms] ease-snap hover:-translate-y-px hover:bg-steel-bright active:scale-[0.97]"
          >
            Launch IDE
            <ArrowRight
              size={14}
              strokeWidth={2}
              className="transition-transform duration-150 ease-snap group-hover:translate-x-[3px]"
            />
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-md text-secondary hover:bg-raised hover:text-white md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X size={20} strokeWidth={1.75} /> : <Menu size={20} strokeWidth={1.75} />}
        </button>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: 320 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 320 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="fixed inset-y-0 right-0 top-16 z-40 flex w-full max-w-xs flex-col gap-1 border-l border-hairline bg-panel p-6 md:hidden"
          >
            {NAV_LINKS.map((link, i) => (
              <motion.div
                key={link.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 * i, duration: 0.25 }}
              >
                <Link
                  to={link.to}
                  onClick={close}
                  className="block rounded-md px-3 py-2.5 text-[15px] font-medium text-secondary hover:bg-raised hover:text-white"
                >
                  {link.label}
                </Link>
              </motion.div>
            ))}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * NAV_LINKS.length, duration: 0.25 }}
              className="mt-4"
            >
              <Link
                to="/ide"
                onClick={close}
                className="flex items-center justify-center gap-1.5 rounded-md bg-steel px-4 py-2.5 text-[14px] font-semibold text-abyss hover:bg-steel-bright"
              >
                Launch IDE
                <ArrowRight size={15} strokeWidth={2} />
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
