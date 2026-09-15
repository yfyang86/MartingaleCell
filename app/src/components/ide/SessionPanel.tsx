/* Session panel — notebook-style result cells with smart autoscroll. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ClipboardCopy, ClipboardPaste, ArrowDownToLine, Trash2, ArrowDown, Download } from 'lucide-react'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { autocompletion, completionKeymap, completionStatus, closeCompletion, startCompletion } from '@codemirror/autocomplete'
import { useWorkspace } from '@/store/workspace'
import { useUi } from '@/store/ui'
import { evaluateCode } from '@/store/evaluate'
import { recallStep, filterEntries, historyEntries } from '@/session/history'
import { runIndexAll } from '@/session/lineage'
import { CellView } from './Cell'
import { copyText, pasteIntoEditor, exportSession } from './actions'
import { clCompletionSource } from './completion'
import { clEditorTheme, clSyntaxExtension } from './cl-language'

/* Compact overrides on top of clEditorTheme: single-purpose prompt look —
 * auto height, no active-line tint, scroll cap instead of 40vh pad. The
 * autocomplete tooltip / rainbow-paren styling comes from clEditorTheme. */
const replTheme = EditorView.theme({
  '&': { height: 'auto', backgroundColor: 'transparent' },
  '.cm-scroller': { overflow: 'auto', maxHeight: '144px', fontFamily: "'JetBrains Mono', ui-monospace, monospace" },
  '.cm-content': { paddingTop: '4px', paddingBottom: '4px', lineHeight: '1.55', minHeight: '22px' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
}, { dark: true })

/** Jupyter-style REPL prompt: type a form, Enter evaluates it as a new cell.
 * Shift+Enter inserts a newline; ↑/↓ walk the input history (kept in the
 * workspace store, so it survives a reload — Sprint 20). Completion is
 * the same source as the editor (CL core + project symbols) — Ctrl+Space
 * forces it, typing activates it. */
const setText = (v: EditorView, text: string) =>
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: text.length } })

function ReplInput() {
  const packageName = useWorkspace((s) => s.packageName)
  const fontSize = useWorkspace((s) => s.settings.fontSize)
  const ligatures = useWorkspace((s) => s.settings.ligatures)
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeComp = useRef(new Compartment())
  const histIdx = useRef(-1)
  /* Ctrl+R: search the persisted history (Sprint 21) */
  const [search, setSearch] = useState<{ query: string; sel: number } | null>(null)
  const sessionHistory = useWorkspace((s) => s.sessionHistory)
  const sessionCells = useWorkspace((s) => s.cells)
  /* Sprint 31: the list also carries the session's cell inputs, with their cell numbers */
  const entries = useMemo(() => historyEntries(sessionHistory, sessionCells), [sessionHistory, sessionCells])
  const matches = useMemo(() => (search ? filterEntries(entries, search.query) : []), [search, entries])
  const closeSearch = useCallback((recall?: string) => {
    setSearch(null)
    const v = viewRef.current
    if (!v) return
    if (recall !== undefined) { setText(v, recall); histIdx.current = -1 }
    v.focus()
  }, [])

  const submit = useCallback(() => {
    const v = viewRef.current
    if (!v) return
    const text = v.state.doc.toString().trim()
    if (!text) return
    useWorkspace.getState().pushSessionHistory(text)
    histIdx.current = -1
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '' } })
    void evaluateCode(text, undefined, { bufferId: '', from: 0, session: true })
  }, [])

  const recall = (dir: 1 | -1): boolean => {
    const v = viewRef.current
    if (!v || completionStatus(v.state) !== null) return false
    const step = recallStep(useWorkspace.getState().sessionHistory, {
      idx: histIdx.current,
      text: v.state.doc.toString(),
      atStart: v.state.selection.main.head === 0 && v.state.selection.main.anchor === 0,
    }, dir)
    if (!step) return false
    histIdx.current = step.idx
    setText(v, step.text)
    return true
  }

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: '',
        extensions: [
          clSyntaxExtension,
          autocompletion({ override: [clCompletionSource], maxRenderedOptions: 8, icons: true }),
          themeComp.current.of(clEditorTheme(fontSize, ligatures)),
          replTheme,
          placeholder('; type a form — Enter evaluates, ⇧Enter newline, ↑ history, Ctrl+Space complete'),
          keymap.of([
            {
              key: 'Enter',
              run: (v) => {
                const st = completionStatus(v.state)
                if (st === 'active') return false /* completion keymap accepts */
                if (st === 'pending') closeCompletion(v) /* Enter right after typing: evaluate, do not wait for the popup */
                submit()
                return true
              },
            },
            {
              key: 'Escape',
              run: (v) => {
                if (completionStatus(v.state) !== null) { closeCompletion(v); return true }
                if (v.state.doc.length === 0) return false
                setText(v, '')
                histIdx.current = -1
                return true
              },
            },
            { key: 'ArrowUp', run: () => recall(1) },
            { key: 'ArrowDown', run: () => recall(-1) },
            { key: 'Ctrl-r', run: () => { setSearch({ query: '', sel: 0 }); return true } },
            { key: 'Ctrl-Space', run: (v) => (completionStatus(v.state) !== null ? false : (startCompletion(v), true)) },
          ]),
          /* after ours → higher precedence: Enter accepts a completion when
           * one is open; otherwise falls through to the submit handler above */
          keymap.of(completionKeymap),
        ],
      }),
    })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submit])

  // live settings reconfiguration (font size / ligatures)
  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeComp.current.reconfigure(clEditorTheme(fontSize, ligatures)) })
  }, [fontSize, ligatures])

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!search) return
    const move = (d: number) => setSearch({ ...search, sel: matches.length ? (search.sel + d + matches.length) % matches.length : 0 })
    if (e.key === 'ArrowDown' || (e.key === 'r' && e.ctrlKey)) { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Enter') { e.preventDefault(); closeSearch(matches[search.sel]?.text) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSearch() }
  }

  return (
    <div className="relative shrink-0 border-t border-hairline bg-panel px-3 py-2">
      {search && (
        <div data-testid="session-history-search" className="absolute inset-x-3 bottom-full z-20 mb-1 rounded-md border border-hairline bg-raised p-1.5 shadow-modal">
          <div className="flex items-center gap-2 px-1 pb-1">
            <span className="select-none font-mono text-[10.5px] uppercase tracking-wide text-muted">history</span>
            <input
              autoFocus
              value={search.query}
              onChange={(e) => setSearch({ query: e.target.value, sel: 0 })}
              onKeyDown={onSearchKey}
              onBlur={() => closeSearch()}
              placeholder="type to search — ↑↓ or Ctrl R move, Enter recalls, Esc closes"
              aria-label="Search session history"
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-primary outline-none placeholder:text-muted"
            />
          </div>
          {matches.length === 0 ? (
            <div className="px-1 py-1 font-mono text-[11px] text-muted">{entries.length ? 'no match' : 'no history yet'}</div>
          ) : (
            <ul className="max-h-48 overflow-y-auto">
              {matches.map((m, i) => (
                <li key={`${i}-${m.text}`}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-sm px-1.5 py-0.5 text-left font-mono text-[11.5px] ${i === search.sel ? 'bg-steel-dim text-primary' : 'text-secondary hover:text-primary'}`}
                    onMouseDown={(e) => { e.preventDefault(); closeSearch(m.text) }}
                    title={m.text}
                  >
                    <span data-testid="history-entry" className="min-w-0 flex-1 truncate">{m.text.split('\n')[0]}{m.text.includes('\n') ? ' …' : ''}</span>
                    {m.cell !== undefined && (
                      <span data-testid="history-cell" className="shrink-0 rounded-sm border border-hairline px-1 text-[10px] text-muted">In [{m.cell}]</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex items-start gap-2 rounded-md border border-hairline bg-inset px-2.5 py-0.5 transition-colors duration-150 focus-within:border-steel/50">
        <span className="mt-px select-none whitespace-nowrap py-1 font-mono text-[12px] text-steel">{packageName}&gt;</span>
        <div ref={hostRef} data-testid="session-input" className="min-w-0 flex-1 [&_.cm-editor]:bg-transparent" />
      </div>
    </div>
  )
}

function EmptySession() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <motion.span
        className="select-none font-mono text-[48px] leading-none"
        animate={{ y: [0, -4, 0, 4, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="tok-paren-1">(</span>
        <span className="tok-paren-2">)</span>
      </motion.span>
      <p className="text-[13px] text-secondary">Evaluate something.</p>
      <p className="flex items-center gap-2 text-[11.5px] text-muted">
        <span className="cc-kbd">Ctrl↵</span> evaluate form
        <span className="cc-kbd">Ctrl⇧↵</span> evaluate all
      </p>
    </div>
  )
}

export default function SessionPanel() {
  const cells = useWorkspace((s) => s.cells)
  const packageName = useWorkspace((s) => s.packageName)
  const engineStatus = useWorkspace((s) => s.engineStatus)
  const historyTrimmed = useWorkspace((s) => s.historyTrimmed)
  const setConfirm = useUi((s) => s.setConfirm)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [flashCell, setFlashCell] = useState<number | null>(null)
  /* "run k/N" per cell, one pass per cells change (Sprint 21) */
  const runs = useMemo(() => runIndexAll(cells), [cells])

  const warningCount = cells.reduce((n, c) => n + c.warnings.length, 0)

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // smart autoscroll
  useEffect(() => {
    if (atBottom) scrollToBottom()
  }, [cells.length, atBottom, scrollToBottom])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
  }

  const copyAll = () => {
    const text = cells
      .map((c) => {
        const parts = [`${c.pkg}> ${c.input}`]
        if (c.stdout) parts.push(';; OUT  ' + c.stdout.replace(/\n/g, '\n;; OUT  '))
        c.warnings.forEach((w) => parts.push(';; WARNING  ' + w))
        if (c.error) parts.push(`;; ERROR  ${c.error}`)
        else c.values.forEach((v) => parts.push(';;=> ' + v))
        if (c.status === 'aborted') parts.push('; Evaluation aborted')
        return parts.join('\n')
      })
      .join('\n\n')
    void copyText(text, `Copied ${cells.length} cells as transcript`)
  }

  // expose scroll-to-cell for log cross-links
  useEffect(() => {
    const handler = (ev: Event) => {
      const n = (ev as CustomEvent<number>).detail
      const el = document.getElementById(`cell-${n}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setFlashCell(n)
        setTimeout(() => setFlashCell(null), 1200)
      }
    }
    window.addEventListener('conscell:goto-cell', handler)
    return () => window.removeEventListener('conscell:goto-cell', handler)
  }, [])

  return (
    <section className="relative flex h-full min-h-0 flex-col bg-panel">
      {/* header */}
      <header className="flex h-8 shrink-0 items-center justify-between border-b border-hairline px-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Session</span>
          <span className="font-mono text-[11px] text-steel">{packageName}&gt;</span>
          <span className="text-[11px] text-muted">{cells.length} {cells.length === 1 ? 'cell' : 'cells'}</span>
          {warningCount > 0 && (
            <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-px font-mono text-[10px] text-warning">
              {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
            </span>
          )}
          {historyTrimmed && (
            <span className="rounded-full border border-hairline px-2 py-px font-mono text-[10px] text-muted">
              history trimmed to last 1,000 cells
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors duration-100 hover:bg-raised hover:text-primary" title="Copy all as transcript" onClick={copyAll}>
            <ClipboardCopy size={14} />
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors duration-100 hover:bg-raised hover:text-primary" title="Export session as Markdown (⇧click: .lisp transcript)" onClick={(e) => void exportSession(e.shiftKey ? 'lisp' : 'md')}>
            <Download size={14} />
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors duration-100 hover:bg-raised hover:text-primary" title="Paste into editor" onClick={() => void pasteIntoEditor()}>
            <ClipboardPaste size={14} />
          </button>
          {!atBottom && (
            <button className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors duration-100 hover:bg-raised hover:text-primary" title="Scroll to bottom" onClick={() => scrollToBottom()}>
              <ArrowDownToLine size={14} />
            </button>
          )}
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors duration-100 hover:bg-raised hover:text-error"
            title="Clear session (Ctrl⇧L)"
            onClick={() => setConfirm('clear-session')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </header>
      {/* fallback rungs (Sprint 5 decision): keep them, but say what they cannot do */}
      {(engineStatus === 'ready-jscl' || engineStatus === 'ready-mock') && (
        <div className="flex shrink-0 items-start gap-2 border-b border-warning/30 bg-warning/[0.07] px-3 py-1.5 text-[11.5px] leading-snug text-secondary">
          <span className="mt-px shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-warning">
            {engineStatus === 'ready-jscl' ? 'JSCL fallback' : 'demo runtime'}
          </span>
          <span>
            ECL could not be loaded. This rung has no debugger, no standard input, no packages and only a subset of ANSI Common Lisp.
            Restart the runtime once the network is back to get the real image.
          </span>
        </div>
      )}

      {/* cells */}
      <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
        {cells.length === 0 ? (
          <EmptySession />
        ) : (
          cells.map((c) => <CellView key={c.id} cell={c} flash={flashCell === c.n} run={runs.get(c.id)} />)
        )}
      </div>

      {/* REPL input */}
      <ReplInput />

      {/* jump-to-latest pill */}
      <AnimatePresence>
        {!atBottom && cells.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 8, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 8, x: '-50%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="absolute bottom-4 left-1/2 z-10 flex items-center gap-1.5 rounded-full border border-steel/40 bg-raised px-3 py-1.5 text-[12px] text-steel shadow-modal hover:bg-steel-dim"
            onClick={() => scrollToBottom()}
          >
            <ArrowDown size={12} />
            New result — jump to latest
          </motion.button>
        )}
      </AnimatePresence>
    </section>
  )
}
