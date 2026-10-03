/* Status bar (28px): engine, package, buffer, cursor, paren depth, font size,
 * worker status, autosave state, offline chip. */

import { useEffect, useState } from 'react'
import { Github } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n/context'
import { useWorkspace } from '@/store/workspace'
import { useEditorMeta } from '@/store/editor-meta'
import { parenBalance } from './lisp-utils'

function DepthDiagram({ depth }: { depth: number }) {
  const { t } = useI18n()
  // (•(•)) mini-diagram: 6 slots, current depth highlighted
  const max = Math.min(6, Math.max(3, depth + 1))
  return (
    <span className="flex items-center gap-1 font-mono text-[11.5px] text-muted" title={`sexp depth ${depth}`}>
      <span className="hidden sm:inline">{t('depth')} {depth}</span>
      <span className="hidden md:inline-flex items-center">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className="flex items-center">
            <span className={cn(i + 1 <= depth && 'tok-paren-' + (((i) % 6) + 1), i + 1 > depth && 'text-muted/40')}>{'('}</span>
            {i === depth - 1 && <span className={cn('tok-paren-' + (((i) % 6) + 1))}>•</span>}
          </span>
        ))}
        <span className="text-muted/40">{')'.repeat(Math.max(0, Math.min(depth, max)))}</span>
      </span>
    </span>
  )
}

export default function StatusBar() {
  const { t } = useI18n()
  const engineStatus = useWorkspace((s) => s.engineStatus)
  const engineLabel = useWorkspace((s) => s.engineLabel)
  const bootProgress = useWorkspace((s) => s.bootProgress)
  const packageName = useWorkspace((s) => s.packageName)
  const buffer = useWorkspace((s) => s.buffers.find((b) => b.id === s.activeBufferId))
  const fontSize = useWorkspace((s) => s.settings.fontSize)
  const saveState = useWorkspace((s) => s.saveState)
  const evaluating = useWorkspace((s) => s.evaluating)
  const evalMode = useWorkspace((s) => s.settings.evalMode)
  const setSettings = useWorkspace((s) => s.setSettings)
  const cells = useWorkspace((s) => s.cells)
  const { line, col, depth } = useEditorMeta()
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const lastMs = [...cells].reverse().find((c) => c.status === 'done' || c.status === 'error')?.durationMs
  const balance = buffer ? parenBalance(buffer.content) : 0
  const ready = engineStatus === 'ready-ecl' || engineStatus === 'ready-sbcl' || engineStatus === 'ready-jscl' || engineStatus === 'ready-mock'

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-hairline bg-panel px-3 font-mono text-[11.5px] text-secondary">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex items-center gap-1.5" title={engineLabel || engineStatus}>
          <span className={cn(
            'h-1.5 w-1.5 rounded-full',
            engineStatus === 'ready-ecl' || engineStatus === 'ready-sbcl' ? 'bg-success' : engineStatus === 'ready-jscl' ? 'bg-warning' : engineStatus === 'ready-mock' ? 'bg-muted' : engineStatus === 'booting' ? 'animate-pulse bg-warning' : 'bg-error',
          )} />
          <span className="hidden sm:inline" data-testid="status-engine">{engineLabel || (bootProgress ? `booting · ${bootProgress.file} ${(bootProgress.loaded / 1e6).toFixed(1)}${bootProgress.total ? ` / ${(bootProgress.total / 1e6).toFixed(1)}` : ''} MB` : 'booting')}</span>
        </span>
        <span className="text-muted">{packageName}</span>
        <button
          className="text-muted transition-colors hover:text-steel"
          title={t('Evaluator mode (click to toggle eval/compile)')}
          onClick={() => setSettings({ evalMode: evalMode === 'eval' ? 'compile' : 'eval' })}
        >
          {evalMode}
        </button>
        <span className="hidden truncate text-muted md:inline">{buffer?.name ?? '—'}</span>
        <span className="hidden whitespace-nowrap sm:inline">Ln {line}, Col {col}</span>
        <DepthDiagram depth={depth} />
        <span
          className={cn('hidden whitespace-nowrap lg:inline', balance !== 0 ? 'text-error' : 'text-muted')}
          title={balance === 0 ? t('Parens balanced') : balance > 0 ? `${balance} ${t('unclosed open paren(s)')}` : `${-balance} ${t('unmatched close paren(s)')}`}
        >
          {balance === 0 ? '() ✓' : balance > 0 ? `( ×${balance}` : `) ×${-balance}`}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {!online && <span className="rounded-sm bg-raised px-1.5 py-px text-muted">{t('offline')}</span>}
        <span className="hidden text-muted md:inline">{t('worker:')} {evaluating ? t('busy') : ready ? t('idle') : engineStatus}</span>
        {lastMs != null && <span className="hidden text-muted lg:inline">{lastMs < 1 ? '<1' : lastMs.toFixed(0)} ms</span>}
        <span className={cn('hidden sm:inline', saveState === 'saving' ? 'text-muted' : 'text-success/80')}>
          {saveState === 'saving' ? t('saving…') : t('saved ✓')}
        </span>
        <span className="hidden text-muted xl:inline">{fontSize}px</span>
        <span className="hidden text-muted xl:inline">UTF-8</span>
        <span className="hidden text-muted sm:inline">Common Lisp</span>
        <a href="https://github.com" target="_blank" rel="noreferrer" className="text-muted transition-colors hover:text-primary" title="GitHub">
          <Github size={12} />
        </a>
      </div>
    </footer>
  )
}
