/* Command palette (Ctrl K / Ctrl ⇧ P): fuzzy commands + example loading. */

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWorkspace } from '@/store/workspace'
import { useUi } from '@/store/ui'
import {
  evaluateFormAtPoint, evaluateAllForms,
  newBuffer, saveBuffers, focusEditor, loadExamples, loadExampleIntoBuffer,
  copyText, type ExampleItem,
} from './actions'
import { explorerActions } from '@/project/actions'
import { toast } from 'sonner'

interface Cmd {
  id: string
  group: string
  name: string
  desc?: string
  kbd?: string
  run: () => void
}

function fuzzy(query: string, text: string): boolean {
  let qi = 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++
  return qi === q.length
}

export default function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const setOpen = useUi((s) => s.setPaletteOpen)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [examples, setExamples] = useState<ExampleItem[]>([])

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      void loadExamples().then(setExamples)
    }
  }, [open])

  const commands = useMemo<Cmd[]>(() => {
    const ui = useUi.getState
    const ws = useWorkspace.getState
    const base: Cmd[] = [
      { id: 'eval-form', group: 'Evaluate', name: 'Evaluate form at point', kbd: 'Ctrl↵', run: evaluateFormAtPoint },
      { id: 'eval-all', group: 'Evaluate', name: 'Evaluate all forms', kbd: 'Ctrl⇧↵', run: evaluateAllForms },
      { id: 'interrupt', group: 'Evaluate', name: 'Interrupt evaluation', kbd: 'Ctrl.', run: () => ui().setConfirm('interrupt') },
      { id: 'new-buffer', group: 'Buffer', name: 'New buffer', kbd: 'Ctrl N', run: newBuffer },
      { id: 'close-others', group: 'Buffer', name: 'Close other buffers', run: () => { const s = ws(); if (s.activeBufferId) s.closeOtherBuffers(s.activeBufferId) } },
      { id: 'save', group: 'Buffer', name: 'Save buffers', kbd: 'Ctrl S', run: saveBuffers },
      { id: 'toggle-explorer', group: 'View', name: 'Toggle project explorer', kbd: 'Ctrl B', run: () => ui().toggleExplorer() },
      { id: 'open-folder', group: 'Project', name: 'Open folder as project', run: explorerActions.openFolder },
      { id: 'open-sample', group: 'Project', name: 'Open sample project: cl-plot (MIT)', run: explorerActions.openSample },
      { id: 'export-zip', group: 'Project', name: 'Export project as ZIP', run: explorerActions.exportZip },
      { id: 'save-all', group: 'Project', name: 'Save all project files', kbd: 'Ctrl S', run: saveBuffers },
      { id: 'load-project', group: 'Project', name: 'Load Project into Runtime (recursive, then call it)', run: explorerActions.loadProject },
      { id: 'clear-session', group: 'Session', name: 'Clear session cells', kbd: 'Ctrl⇧L', run: () => ui().setConfirm('clear-session') },
      {
        id: 'copy-all', group: 'Session', name: 'Copy session as transcript', run: () => {
          const cells = ws().cells
          void copyText(cells.map((c) => `${c.pkg}> ${c.input}\n${c.values.map((v) => ';;=> ' + v).join('\n')}`).join('\n\n'), 'Transcript copied')
        },
      },
      { id: 'restart', group: 'Runtime', name: 'Restart Lisp image', run: () => ui().setConfirm('restart') },
      {
        id: 'mem-report', group: 'Runtime', name: 'Memory report', run: () => {
          const perf = performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }
          const msg = perf.memory
            ? `JS heap ${(perf.memory.usedJSHeapSize / 1048576).toFixed(0)} / ${(perf.memory.jsHeapSizeLimit / 1048576).toFixed(0)} MB`
            : 'performance.memory not available in this browser'
          ws().addLog('INFO', 'RUNTIME', msg)
          toast(msg)
        },
      },
      { id: 'focus-editor', group: 'View', name: 'Focus editor', run: focusEditor },
      { id: 'settings', group: 'View', name: 'Open settings', run: () => ui().setSettingsOpen(true) },
      { id: 'shortcuts', group: 'Help', name: 'Keyboard shortcuts', kbd: 'Ctrl/', run: () => ui().setShortcutsOpen(true) },
      { id: 'docs', group: 'Help', name: 'Open docs', run: () => { window.location.href = '/docs' } },
      { id: 'export-ws', group: 'Workspace', name: 'Export workspace (.json)', run: () => {
          const s = ws()
          const blob = new Blob([JSON.stringify({ buffers: s.buffers, cells: s.cells, settings: s.settings }, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = 'conscell-workspace.json'; a.click()
          URL.revokeObjectURL(url)
        } },
    ]
    for (const ex of examples) {
      base.push({
        id: `ex-${ex.slug}`,
        group: 'Examples',
        name: `Load example: ${ex.title}`,
        desc: ex.category,
        run: () => loadExampleIntoBuffer(ex),
      })
    }
    return base
  }, [examples])

  const filtered = useMemo(() => commands.filter((c) => !query || fuzzy(query, c.name) || fuzzy(query, c.group)), [commands, query])

  useEffect(() => { setCursor(0) }, [query])

  const runCmd = (c: Cmd) => {
    setOpen(false)
    c.run()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <div className="absolute inset-0 bg-[rgba(4,5,9,.7)] backdrop-blur-[6px]" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="relative w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-hairline bg-panel shadow-modal"
          >
            <div className="flex items-center gap-2 border-b border-hairline px-4">
              <span className="font-mono text-[15px] text-lisp-purple">λ</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
                  if (e.key === 'Enter' && filtered[cursor]) runCmd(filtered[cursor])
                  if (e.key === 'Escape') setOpen(false)
                }}
                placeholder="Type a command…"
                className="h-12 w-full bg-transparent text-[14px] text-primary placeholder:text-muted focus:outline-none"
              />
            </div>
            <div className="scrollbar-thin max-h-[320px] overflow-y-auto py-1.5">
              {filtered.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-muted">No matching commands</div>}
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-100 ${i === cursor ? 'bg-steel-dim' : 'hover:bg-raised'}`}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => runCmd(c)}
                >
                  <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{c.group}</span>
                  <span className="flex-1 font-mono text-[12.5px] text-primary">{highlight(c.name, query)}</span>
                  {c.desc && <span className="text-[11px] text-muted">{c.desc}</span>}
                  {c.kbd && <span className="cc-kbd">{c.kbd}</span>}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 border-t border-hairline px-4 py-2 font-mono text-[10.5px] text-muted">
              <span>↑↓ navigate</span><span>↵ run</span><span>esc close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function highlight(text: string, query: string) {
  if (!query) return text
  const chars = text.split('')
  let qi = 0
  const q = query.toLowerCase()
  return chars.map((ch, i) => {
    if (qi < q.length && ch.toLowerCase() === q[qi]) {
      qi++
      return <span key={i} className="text-steel-bright">{ch}</span>
    }
    return ch
  })
}
