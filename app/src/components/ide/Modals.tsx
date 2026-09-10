/* Overlays: confirmation modal (restart/interrupt/clear/reset), share modal,
 * keyboard shortcuts reference (Ctrl /), cell run history (Sprint 21). */

import { useEffect, useMemo, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, X, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '@/store/workspace'
import { useUi, type ConfirmKind } from '@/store/ui'
import { useProject } from '@/store/project'
import { interruptEvaluation, restartRuntime, clearSession, copyText, pendingImportCount, pendingImportPreview, applyPendingImport, rerunCell, gotoCell } from './actions'
import { runsOf, compareRuns } from '@/session/lineage'
import { diffLines } from '@/session/diff'

function ModalShell({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
    >
      <div className="absolute inset-0 bg-[rgba(4,5,9,.7)] backdrop-blur-[6px]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 4 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className={`relative rounded-xl border border-hairline bg-panel shadow-modal ${wide ? 'w-[640px]' : 'w-[420px]'} max-w-[92vw]`}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

const CONFIRMS: Record<Exclude<ConfirmKind, null>, { title: string; body: () => ReactNode; confirm: string; danger?: boolean; run: () => void }> = {
  restart: {
    title: 'Restart Lisp image?',
    body: () => 'This clears all definitions. Session cells are kept.',
    confirm: 'Restart',
    danger: true,
    run: () => void restartRuntime(),
  },
  interrupt: {
    title: 'Interrupt evaluation?',
    body: () => 'WebAssembly cannot be preempted — the runtime worker will be restarted. The current evaluation resolves as aborted; definitions are lost.',
    confirm: 'Interrupt & restart worker',
    danger: true,
    run: () => void interruptEvaluation(),
  },
  'clear-session': {
    title: 'Clear session cells?',
    body: () => `Clear ${useWorkspace.getState().cells.length} cells? This cannot be undone.`,
    confirm: 'Clear session',
    danger: true,
    run: clearSession,
  },
  'import-replace': {
    title: 'Replace the session with the transcript?',
    body: () => {
      const cur = useWorkspace.getState().cells.length
      const n = pendingImportCount()
      const preview = pendingImportPreview()
      return (
        <>
          {cur} current cell{cur === 1 ? '' : 's'} will be cleared, then {n} imported cell{n === 1 ? '' : 's'} appended. This cannot be undone.
          {preview.length > 0 && (
            <ul className="mt-2 space-y-0.5 font-mono text-[11.5px] text-muted">
              {preview.map((line, i) => <li key={i} className="truncate">In [{i + 1}] {line}</li>)}
              {n > preview.length && <li>… {n - preview.length} more</li>}
            </ul>
          )}
        </>
      )
    },
    confirm: 'Replace session',
    danger: true,
    run: () => void applyPendingImport(),
  },
  'reset-workspace': {
    title: 'Reset workspace?',
    body: () => 'All buffers, cells and settings will be wiped and restored to defaults. Export first if you care about the contents.',
    confirm: 'Reset everything',
    danger: true,
    run: () => { useWorkspace.getState().resetWorkspace(); toast('Workspace reset') },
  },
}

function ConfirmModal() {
  const confirm = useUi((s) => s.confirm)
  const setConfirm = useUi((s) => s.setConfirm)
  const spec = confirm ? CONFIRMS[confirm] : null
  return (
    <AnimatePresence>
      {spec && (
        <ModalShell onClose={() => setConfirm(null)}>
          <div className="px-5 py-4">
            <h2 className="text-[15px] font-semibold text-primary">{spec.title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">{spec.body()}</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">
            <button
              className="rounded-md border border-hairline px-4 py-2 text-[12.5px] text-secondary transition-all duration-150 hover:border-strong hover:bg-raised hover:text-primary"
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              className="rounded-md border border-error/40 px-4 py-2 text-[12.5px] font-semibold text-error transition-all duration-150 hover:bg-error/10 active:scale-[0.97]"
              onClick={() => { setConfirm(null); spec.run() }}
            >
              {spec.confirm}
            </button>
          </div>
        </ModalShell>
      )}
    </AnimatePresence>
  )
}

function ShareModal() {
  const shareUrl = useUi((s) => s.shareUrl)
  const setShareUrl = useUi((s) => s.setShareUrl)
  return (
    <AnimatePresence>
      {shareUrl && (
        <ModalShell onClose={() => setShareUrl(null)}>
          <div className="px-5 py-4">
            <h2 className="text-[15px] font-semibold text-primary">Share this buffer</h2>
            <p className="mt-1.5 text-[12.5px] text-secondary">Contains your buffer, compressed. No server involved.</p>
            <div className="mt-3 flex items-center gap-2 rounded-md border border-hairline bg-inset px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-steel">{shareUrl}</code>
              <button
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-secondary hover:bg-raised hover:text-primary"
                onClick={() => void copyText(shareUrl, 'Share link copied')}
                title="Copy"
              >
                <Copy size={13} />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <img src="/logo.svg" alt="" className="h-8 w-8 opacity-70" />
              <p className="font-mono text-[10.5px] text-muted">anyone opening the link gets the exact same editor state</p>
            </div>
          </div>
        </ModalShell>
      )}
    </AnimatePresence>
  )
}

function CloseBufferModal() {
  const id = useUi((s) => s.confirmCloseBufferId)
  const setId = useUi((s) => s.setConfirmCloseBuffer)
  const buf = useWorkspace((s) => s.buffers.find((b) => b.id === id))
  const close = () => setId(null)
  return (
    <AnimatePresence>
      {id && buf && (
        <ModalShell onClose={close}>
          <div className="px-5 py-4">
            <h2 className="text-[15px] font-semibold text-primary">Unsaved changes in {buf.name}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-secondary">
              This project file has unsaved changes. Save it before closing?
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">
            <button
              className="rounded-md border border-hairline px-4 py-2 text-[12.5px] text-secondary transition-all duration-150 hover:border-strong hover:bg-raised hover:text-primary"
              onClick={close}
            >
              Cancel
            </button>
            <button
              className="rounded-md border border-error/40 px-4 py-2 text-[12.5px] font-semibold text-error transition-all duration-150 hover:bg-error/10 active:scale-[0.97]"
              onClick={() => { close(); useWorkspace.getState().closeBuffer(id) }}
            >
              Close without saving
            </button>
            <button
              className="rounded-md bg-steel px-4 py-2 text-[12.5px] font-semibold text-abyss transition-all duration-150 hover:bg-steel-bright active:scale-[0.97]"
              onClick={() => {
                close()
                void useProject.getState().saveBuffer(id).then(() => useWorkspace.getState().closeBuffer(id))
              }}
            >
              Save &amp; close
            </button>
          </div>
        </ModalShell>
      )}
    </AnimatePresence>
  )
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl/Cmd + Enter', 'Evaluate top-level form at point'],
  ['Ctrl/Cmd + Shift + Enter', 'Evaluate all top-level forms'],
  ['Ctrl/Cmd + .', 'Interrupt evaluation'],
  ['Ctrl/Cmd + K', 'Command palette'],
  ['Ctrl/Cmd + B', 'Toggle project explorer'],
  ['Ctrl/Cmd + N', 'New buffer'],
  ['Ctrl/Cmd + S', 'Save buffers (project files + flush)'],
  ['Ctrl/Cmd + Shift + L', 'Clear session cells'],
  ['Ctrl/Cmd + /', 'This reference'],
  ['Ctrl-Space', 'Autocomplete / symbol doc'],
  ['Ctrl/Cmd + Shift + ↑', 'Select enclosing s-expression'],
  ['Alt + ↑ / ↓', 'Move between top-level forms'],
  ['0–4', 'Choose restart (in a debugger cell)'],
]

function ShortcutsModal() {
  const open = useUi((s) => s.shortcutsOpen)
  const setOpen = useUi((s) => s.setShortcutsOpen)
  return (
    <AnimatePresence>
      {open && (
        <ModalShell onClose={() => setOpen(false)} wide>
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="text-[15px] font-semibold text-primary">Keyboard shortcuts</h2>
            <button className="flex h-7 w-7 items-center justify-center rounded-md text-secondary hover:bg-raised hover:text-primary" onClick={() => setOpen(false)}>
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-x-8 px-5 py-4 sm:grid-cols-2">
            {SHORTCUTS.map(([kbd, desc]) => (
              <div key={kbd} className="flex items-center justify-between gap-4 border-b border-hairline/50 py-2">
                <span className="text-[12.5px] text-secondary">{desc}</span>
                <span className="cc-kbd shrink-0">{kbd}</span>
              </div>
            ))}
          </div>
        </ModalShell>
      )}
    </AnimatePresence>
  )
}

/* the runs of a re-evaluated cell side by side, values compared with the run before (Sprint 21) */
function CellHistoryModal() {
  const lineage = useUi((s) => s.cellHistory)
  const setCellHistory = useUi((s) => s.setCellHistory)
  const cells = useWorkspace((s) => s.cells)
  const runs = useMemo(() => (lineage ? runsOf(cells, lineage) : []), [cells, lineage])
  const cmp = useMemo(() => runs.map((r, i) => compareRuns(runs[i - 1], r)), [runs])
  const close = () => setCellHistory(null)
  const valueRows = Math.max(0, ...runs.map((r) => r.values.length))
  const latest = runs[runs.length - 1]
  const when = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const th = 'sticky top-0 bg-panel px-2 py-1 text-left font-mono text-[10.5px] font-normal uppercase tracking-wide text-muted'
  const td = 'align-top px-2 py-1 font-mono text-[11.5px]'
  return (
    <AnimatePresence>
      {lineage && (
        <ModalShell onClose={close} wide>
          <div data-testid="cell-history" className="flex max-h-[80vh] flex-col">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <div>
                <h2 className="text-[13px] font-medium text-primary">Run history</h2>
                <p className="text-[11.5px] text-muted">{runs.length} run{runs.length === 1 ? '' : 's'} of cell [{runs[0]?.n ?? '?'}] — a value is marked when it differs from the run before</p>
              </div>
              <div className="flex items-center gap-1">
                {latest && (
                  <button className="cc-btn" onClick={() => { rerunCell(latest); close() }} title="Re-run the latest run again">
                    <RotateCw className="size-3.5" /> Re-run
                  </button>
                )}
                <button className="rounded-sm p-1 text-muted hover:bg-raised hover:text-primary" onClick={close} aria-label="Close"><X className="size-4" /></button>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th}>&nbsp;</th>
                    {runs.map((r) => (
                      <th key={r.id} className={th}>
                        <button
                          type="button"
                          className="rounded-sm bg-steel-dim px-1.5 py-0.5 font-mono text-[10.5px] text-steel-bright hover:text-primary"
                          title="Go to this cell"
                          onClick={() => { close(); gotoCell(r.n) }}
                        >
                          In [{r.n}]
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-hairline">
                    <td className={`${td} text-muted`}>when</td>
                    {runs.map((r) => <td key={r.id} className={`${td} text-secondary`}>{when(r.startedAt)}</td>)}
                  </tr>
                  <tr>
                    <td className={`${td} text-muted`}>status</td>
                    {runs.map((r, i) => (
                      <td key={r.id} className={`${td} ${r.status === 'error' || r.status === 'aborted' ? 'text-error' : 'text-secondary'}`}>
                        {r.status}{cmp[i].statusChanged && <span className="ml-1 text-[10px] text-warning" data-testid="run-status-changed">changed</span>}
                        {r.durationMs > 0 && <span className="ml-1 text-muted">· {r.durationMs < 1 ? '<1' : r.durationMs.toFixed(0)} ms</span>}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-hairline">
                    <td className={`${td} text-muted`}>input</td>
                    {runs.map((r, i) => (
                      <td key={r.id} className={`${td} text-secondary`}>
                        {i > 0 && !cmp[i].inputChanged ? (
                          <span className="text-muted">same as [{runs[i - 1].n}]</span>
                        ) : cmp[i].inputChanged ? (
                          /* Sprint 22: what changed since the run before, line by line */
                          <pre data-testid="run-input-diff" className="max-h-40 max-w-[260px] overflow-auto whitespace-pre-wrap break-words">
                            {diffLines(runs[i - 1].input, r.input).map((l, li) => (
                              <span key={li} data-diff={l.kind} className={`block ${l.kind === 'add' ? 'bg-success/10 text-success' : l.kind === 'del' ? 'bg-error/10 text-error line-through decoration-error/50' : 'text-muted'}`}>
                                {l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  '}{l.text}
                              </span>
                            ))}
                          </pre>
                        ) : (
                          <pre className="max-h-32 max-w-[260px] overflow-auto whitespace-pre-wrap break-words">{r.input}</pre>
                        )}
                        {cmp[i].inputChanged && <span className="ml-1 text-[10px] text-warning" data-testid="run-input-changed">changed vs [{runs[i - 1].n}]</span>}
                      </td>
                    ))}
                  </tr>
                  {Array.from({ length: valueRows }, (_, vi) => (
                    <tr key={vi} className={vi === 0 ? 'border-t border-hairline' : ''}>
                      <td className={`${td} text-muted`}>{vi === 0 ? 'values' : ''}</td>
                      {runs.map((r, i) => {
                        const v = r.values[vi]
                        const changed = v !== undefined && cmp[i].valueChanged[vi]
                        return (
                          <td key={r.id} className={`${td} ${changed ? 'text-warning' : 'text-primary'}`}>
                            {v === undefined ? <span className="text-muted">—</span> : <span className="whitespace-pre-wrap break-words" data-testid={changed ? 'run-value-changed' : 'run-value'}>{v}</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {runs.some((r) => r.error) && (
                    <tr className="border-t border-hairline">
                      <td className={`${td} text-muted`}>error</td>
                      {runs.map((r) => <td key={r.id} className={`${td} text-error`}>{r.error ? <span className="whitespace-pre-wrap break-words">{r.error}</span> : <span className="text-muted">—</span>}</td>)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </ModalShell>
      )}
    </AnimatePresence>
  )
}

export default function Modals() {
  return (
    <>
      <ConfirmModal />
      <ShareModal />
      <ShortcutsModal />
      <CloseBufferModal />
      <CellHistoryModal />
    </>
  )
}
