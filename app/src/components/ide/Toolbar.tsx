/* IDE toolbar (48px): brand, buffers, execution controls, workspace actions,
 * runtime status pill. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play, FastForward, OctagonX, RotateCcw, BookOpen, Link2, Settings2, Command,
  ChevronLeft, ChevronDown, Loader2, PanelLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n/context'
import { useWorkspace } from '@/store/workspace'
import { useUi } from '@/store/ui'
import { useProject } from '@/store/project'
import {
  evaluateFormAtPoint, evaluateAllForms, loadExamples, loadExampleIntoBuffer,
  shareWorkspace, switchPackage, type ExampleItem,
} from './actions'

/* -------- dropdown primitive -------- */

function Dropdown({ trigger, children, align = 'left' }: {
  trigger: React.ReactNode
  children: (close: () => void) => React.ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.12, ease: [0.2, 0.7, 0.3, 1] }}
            className={cn(
              'absolute top-full z-50 mt-1.5 min-w-[180px] rounded-lg border border-hairline bg-raised py-1 shadow-modal',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MenuItem({ label, onClick, href }: { label: string; onClick?: () => void; href?: string }) {
  const cls = 'block w-full px-3 py-1.5 text-left text-[12.5px] text-secondary transition-colors duration-100 hover:bg-panel hover:text-primary'
  if (href) return <Link to={href} className={cls} onClick={onClick}>{label}</Link>
  return <button className={cls} onClick={onClick}>{label}</button>
}

/* -------- engine status pill -------- */

export function EnginePill() {
  const status = useWorkspace((s) => s.engineStatus)
  const label = useWorkspace((s) => s.engineLabel)
  const evaluating = useWorkspace((s) => s.evaluating)
  const { t } = useI18n()

  const content = evaluating
    ? { dot: <Loader2 size={11} className="animate-spin text-steel" />, text: t('evaluating'), cls: 'text-steel' }
    : status === 'booting'
      ? { dot: <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />, text: t('starting runtime…'), cls: 'text-warning' }
      : status === 'ready-ecl'
        ? { dot: <span className="h-2 w-2 rounded-full bg-success" />, text: `ECL · WASM`, cls: 'text-secondary' }
        : status === 'ready-sbcl'
          ? { dot: <span className="h-2 w-2 rounded-full bg-success" />, text: `SBCL · WASM`, cls: 'text-secondary' }
          : status === 'ready-jscl'
          ? { dot: <span className="h-2 w-2 rounded-full bg-warning" />, text: 'JSCL · JS', cls: 'text-secondary' }
          : status === 'ready-mock'
            ? { dot: <span className="h-2 w-2 rounded-full bg-muted" />, text: t('Mock'), cls: 'text-secondary' }
            : { dot: <span className="h-2 w-2 rounded-full bg-error" />, text: t('runtime crashed — restart'), cls: 'text-error' }

  return (
    <div
      className="flex h-7 items-center gap-2 rounded-full border border-hairline bg-raised px-2.5 font-mono text-[11px]"
      title={label || content.text}
    >
      {content.dot}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={content.text}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={content.cls}
        >
          {content.text}
        </motion.span>
      </AnimatePresence>
      {(status === 'ready-ecl' || status === 'ready-sbcl') && label && <span className="hidden text-muted xl:inline">{label}</span>}
    </div>
  )
}

/* -------- package pill -------- */

function PackagePill() {
  const packageName = useWorkspace((s) => s.packageName)
  const buffers = useWorkspace((s) => s.buffers)
  const loadedPackages = useProject((s) => s.loadedPackages)
  const { t } = useI18n()
  /* candidates: the live package, the standard ones, packages a loaded
   * project defined, and every (defpackage …) found in an open buffer */
  const packages = useMemo(() => {
    const found = new Set<string>([packageName, 'CL-USER', 'CL', 'KEYWORD'])
    for (const p of loadedPackages) found.add(p.name.toUpperCase())
    const re = /\(\s*defpackage\s+(?::|#:|")?([\w.-]+)/gi
    for (const b of buffers) {
      let m: RegExpExecArray | null
      while ((m = re.exec(b.content))) found.add(m[1].toUpperCase())
    }
    return [...found]
  }, [buffers, loadedPackages, packageName])
  return (
    <Dropdown
      trigger={
        <button className="flex h-7 items-center gap-1 rounded-full border border-hairline px-2.5 font-mono text-[11px] text-secondary transition-colors duration-100 hover:border-strong hover:text-primary">
          {packageName}
          <ChevronDown size={10} className="text-muted" />
        </button>
      }
    >
      {(close) => (
        <>
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{t('Reader package')}</div>
          {packages.map((p) => (
            <button
              key={p}
              className={cn(
                'block w-full px-3 py-1.5 text-left font-mono text-[12px] transition-colors duration-100 hover:bg-panel',
                p === packageName ? 'text-steel' : 'text-secondary hover:text-primary',
              )}
              onClick={() => {
                close()
                if (p !== packageName) void switchPackage(p)
              }}
            >
              {p}
            </button>
          ))}
        </>
      )}
    </Dropdown>
  )
}

/* -------- examples dropdown -------- */

function ExamplesMenu() {
  const [examples, setExamples] = useState<ExampleItem[]>([])
  const { t } = useI18n()
  useEffect(() => { void loadExamples().then(setExamples) }, [])
  return (
    <Dropdown
      trigger={
        <button className="flex h-7 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-[12.5px] text-secondary transition-all duration-150 hover:border-strong hover:bg-raised hover:text-primary">
          <BookOpen size={13} />
          <span className="hidden lg:inline">{t('Examples')}</span>
        </button>
      }
    >
      {(close) => examples.length === 0 ? (
        <div className="px-3 py-2 text-[12px] text-muted">{t('No examples available')}</div>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          {[...new Set(examples.map((e) => e.category))].map((cat) => (
            <div key={cat}>
              <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{cat}</div>
              {examples.filter((e) => e.category === cat).map((ex) => (
                <button
                  key={ex.slug}
                  className="block w-full px-3 py-1.5 text-left hover:bg-panel"
                  onClick={() => { loadExampleIntoBuffer(ex); close() }}
                >
                  <span className="block font-mono text-[12px] text-primary">{ex.title}</span>
                  <span className="block truncate text-[11px] text-muted">{ex.description}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </Dropdown>
  )
}

/* -------- buffer name inline edit -------- */

function BufferName() {
  const buffer = useWorkspace((s) => s.buffers.find((b) => b.id === s.activeBufferId))
  const renameBuffer = useWorkspace((s) => s.renameBuffer)
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  if (!buffer) return null
  return (
    <div className="hidden items-center gap-1.5 md:flex">
      {editing ? (
        <input
          autoFocus
          defaultValue={buffer.name}
          className="h-6 w-40 rounded-md border border-steel/50 bg-inset px-2 font-mono text-[12.5px] text-primary outline-none"
          onBlur={(e) => { renameBuffer(buffer.id, e.target.value); setEditing(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { renameBuffer(buffer.id, (e.target as HTMLInputElement).value); setEditing(false) }
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <button
          className="rounded-md px-1.5 py-1 font-mono text-[12.5px] text-secondary transition-colors duration-100 hover:bg-raised hover:text-primary"
          onClick={() => setEditing(true)}
          title={t('Click to rename')}
        >
          {buffer.name}
        </button>
      )}
      {buffer.dirty && <span className="h-1.5 w-1.5 rounded-full bg-steel" title={t('unsaved changes')} />}
    </div>
  )
}

/* -------- main toolbar -------- */

function IconButton({ icon, title, onClick, danger }: { icon: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-100 hover:bg-raised hover:text-primary',
        danger ? 'text-error/80 hover:text-error' : 'text-secondary',
      )}
      title={title}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

export default function Toolbar() {
  const evaluating = useWorkspace((s) => s.evaluating)
  const engineStatus = useWorkspace((s) => s.engineStatus)
  const ready = engineStatus === 'ready-ecl' || engineStatus === 'ready-sbcl' || engineStatus === 'ready-jscl' || engineStatus === 'ready-mock'
  const setPaletteOpen = useUi((s) => s.setPaletteOpen)
  const setSettingsOpen = useUi((s) => s.setSettingsOpen)
  const setConfirm = useUi((s) => s.setConfirm)
  const { t } = useI18n()

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-hairline bg-panel px-3">
      {/* left zone */}
      <IconButton
        icon={<PanelLeft size={14} />}
        title={t('Toggle project explorer (Ctrl B)')}
        onClick={() => useUi.getState().toggleExplorer()}
      />
      <Dropdown
        trigger={
          <button className="flex shrink-0 items-center gap-2 rounded-md px-1 py-1 transition-colors duration-100 hover:bg-raised">
            <img src="/logo.svg" alt="MartingaleCell" className="h-[22px] w-[22px]" />
            <span className="font-display text-[14px] font-semibold">
              <span className="text-primary">Martingale</span>
              <span className="text-steel">Cell</span>
            </span>
            <ChevronDown size={11} className="text-muted" />
          </button>
        }
      >
        {() => (
          <>
            <MenuItem label={t('Back to home')} href="/" />
            <MenuItem label={t('Examples')} href="/examples" />
            <MenuItem label={t('Docs')} href="/docs" />
            <MenuItem label={t('About')} onClick={() => useWorkspace.getState().addLog('INFO', 'UI', `MartingaleCell v${__APP_VERSION__} — ANSI Common Lisp in the browser (SBCL or ECL, compiled to WebAssembly)`)} />
          </>
        )}
      </Dropdown>

      <BufferName />
      <PackagePill />

      {/* center zone */}
      <div className="mx-auto flex items-center gap-1.5">
        <motion.button
          key={evaluating ? 'busy' : 'idle'}
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12 }}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-semibold transition-all duration-150 active:scale-[0.97]',
            ready && !evaluating
              ? 'bg-steel text-abyss hover:-translate-y-px hover:bg-steel-bright'
              : 'cursor-not-allowed bg-steel/40 text-abyss/70',
          )}
          onClick={() => ready && !evaluating && evaluateFormAtPoint()}
          title={t('Evaluate form at point')}
        >
          {evaluating ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {evaluating ? t('Evaluating…') : t('Evaluate')}
          <span className="cc-kbd hidden !py-0 text-[10px] sm:inline">Ctrl↵</span>
        </motion.button>
        <button
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md border border-hairline px-2.5 text-[12.5px] text-secondary transition-all duration-150',
            ready && !evaluating ? 'hover:border-strong hover:bg-raised hover:text-primary' : 'cursor-not-allowed opacity-50',
          )}
          onClick={() => ready && !evaluating && evaluateAllForms()}
          title={t('Evaluate all top-level forms')}
        >
          <FastForward size={13} />
          <span className="hidden xl:inline">{t('All')}</span>
          <span className="cc-kbd hidden !py-0 text-[10px] xl:inline">Ctrl⇧↵</span>
        </button>
        <button
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] transition-all duration-150',
            evaluating
              ? 'border-error/40 text-error hover:bg-error/10'
              : 'cursor-not-allowed border-hairline text-muted/50',
          )}
          onClick={() => evaluating && setConfirm('interrupt')}
          title={t('Interrupt evaluation (Ctrl .)')}
        >
          <OctagonX size={13} />
          <span className="hidden xl:inline">{t('Interrupt')}</span>
        </button>
        <IconButton icon={<RotateCcw size={14} />} title={t('Restart Lisp image')} onClick={() => setConfirm('restart')} />
      </div>

      {/* right zone */}
      <div className="flex items-center gap-1">
        <ExamplesMenu />
        <IconButton icon={<Link2 size={14} />} title={t('Share (copies URL)')} onClick={() => void shareWorkspace()} />
        <IconButton icon={<Settings2 size={14} />} title={t('Settings')} onClick={() => setSettingsOpen(true)} />
        <button
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-secondary transition-colors duration-100 hover:bg-raised hover:text-primary"
          title={t('Command palette (Ctrl K)')}
          onClick={() => setPaletteOpen(true)}
        >
          <Command size={14} />
          <span className="cc-kbd hidden !py-0 text-[10px] lg:inline">Ctrl K</span>
        </button>
        <div className="mx-1 hidden h-4 w-px bg-hairline sm:block" />
        <div className="hidden sm:block"><EnginePill /></div>
        <div className="mx-1 hidden h-4 w-px bg-hairline xl:block" />
        <Link to="/" className="hidden items-center gap-0.5 text-[12.5px] text-secondary transition-colors duration-100 hover:text-primary xl:flex">
          <ChevronLeft size={13} />
          {t('Back to site')}
        </Link>
      </div>
    </div>
  )
}
