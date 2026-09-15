/* Workspace search (Sprint 9): open buffers + project Lisp files, results
 * grouped by file, click to jump. Lives at the top of the explorer column. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, CaseSensitive, Regex, WholeWord, Sigma, Replace, ReplaceAll } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/store/workspace'
import { useProject, collectLispFiles } from '@/store/project'
import { useUi } from '@/store/ui'
import { applyReplacements } from '@/search/apply-replace'
import { searchSources, mergeSources, replaceInSources, compileQuery, type SearchOptions, type SearchResults, type SearchFileResult, type SearchMatch } from '@/search/workspace-search'
import { gotoBuffer, gotoLocation, getEditor } from './actions'
import { toast } from 'sonner'

function Toggle({ on, title, onClick, children }: { on: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={cn('flex h-5 w-5 items-center justify-center rounded-sm transition-colors duration-100', on ? 'bg-steel/30 text-primary ring-1 ring-steel' : 'text-muted hover:bg-raised hover:text-primary')}
    >
      {children}
    </button>
  )
}

function MatchRow({ m, onOpen, preview }: { m: SearchMatch; onOpen: () => void; preview?: (hit: string) => string }) {
  const pre = m.lineText.slice(Math.max(0, m.from - 30), m.from)
  const hit = m.lineText.slice(m.from, m.to)
  const post = m.lineText.slice(m.to, m.to + 60)
  const after = preview ? preview(hit) : null
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-baseline gap-1.5 truncate px-2 py-[2px] text-left font-mono text-[11px] hover:bg-raised"
      title={`line ${m.line}, col ${m.col}`}
    >
      <span className="w-7 shrink-0 text-right text-muted">{m.line}</span>
      <span className="truncate text-secondary">
        {m.from > 30 ? '…' : ''}{pre}<mark className={cn('rounded-[2px] px-[1px] text-primary', after !== null ? 'bg-error/20 line-through decoration-error/60' : 'bg-amber-400/25')}>{hit}</mark>{after !== null && <span className="rounded-[2px] bg-steel/25 px-[1px] text-primary">{after}</span>}{post}
      </span>
    </button>
  )
}

export default function SearchPanel() {
  const buffers = useWorkspace((s) => s.buffers)
  const projectKind = useProject((s) => s.kind)
  const projectName = useProject((s) => s.name)
  const files = useProject((s) => s.files)
  const focusTick = useUi((s) => s.searchFocusTick)
  const setSearchOpen = useUi((s) => s.setSearchOpen)
  const query = useUi((s) => s.searchQuery)
  const setQuery = useUi((s) => s.setSearchQuery)
  const opts = useUi((s) => s.searchOpts)
  const setSearchOpts = useUi((s) => s.setSearchOpts)
  const inputRef = useRef<HTMLInputElement>(null)
  const [results, setResults] = useState<(SearchResults & { query: string }) | null>(null)
  const [searching, setSearching] = useState(false)
  /* replace (Sprint 13) */
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [replacement, setReplacement] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [runTick, setRunTick] = useState(0)
  const projectCache = useRef<{ at: number; key: string; files: { path: string; content: string }[] } | null>(null)

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [focusTick])

  const projectFiles = useCallback(async () => {
    if (!projectKind) return []
    /* virtual projects change `files` on every write; FS-Access projects are re-read at most every 5 s */
    const key = projectKind === 'virtual' ? String(Object.keys(files).length) + projectName : projectName ?? ''
    const c = projectCache.current
    if (c && c.key === key && (projectKind === 'virtual' || Date.now() - c.at < 5000)) return c.files
    const fresh = await collectLispFiles()
    projectCache.current = { at: Date.now(), key, files: fresh }
    return fresh
  }, [projectKind, projectName, files])

  /* debounced search over buffers + project files (state is only set from the timer) */
  useEffect(() => {
    if (!query) return
    let cancelled = false
    const t = setTimeout(() => {
      setSearching(true)
      void projectFiles().then((pf) => {
        if (cancelled) return
        setResults({ query, ...searchSources(mergeSources(buffers, pf), query, opts) })
        setSearching(false)
      })
    }, 150)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, opts, buffers, projectFiles, runTick])
  const shown = query && results && results.query === query ? results : null

  const open = useCallback((f: SearchFileResult, m: SearchMatch) => {
    if (f.bufferId) gotoBuffer(f.bufferId, m.line, m.col)
    else gotoLocation(f.path, m.line, m.col)
  }, [])

  const previewFor = useMemo(() => {
    if (!replaceOpen) return undefined
    const re = compileQuery(query, opts)
    if (typeof re === 'string') return undefined
    const single = opts.regex ? new RegExp(`^(?:${re.source})$`, re.flags.replace('g', '')) : null
    return (hit: string) => (single ? hit.replace(single, replacement) : replacement)
  }, [replaceOpen, query, opts, replacement])

  /* Apply (src/search/apply-replace.ts): the active buffer through the editor (one undoable
   * transaction), other open buffers through the store, unopened project files opened as
   * buffers first — nothing touches disk until the user saves. */
  const applyReplace = useCallback(async (only?: SearchFileResult) => {
    const ws = useWorkspace.getState()
    const pf = await projectFiles()
    const sources = mergeSources(ws.buffers, pf).filter((src) => !only || (src.path === only.path && src.bufferId === only.bufferId))
    const r = replaceInSources(sources, query, opts, replacement)
    if (r.error || r.files.length === 0) { setConfirming(false); return }
    const view = getEditor()
    const o = await applyReplacements(r.files, {
      activeBufferId: ws.activeBufferId,
      dispatchActive: view ? (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: 'input.replace' }) : null,
      updateBuffer: (id, text) => useWorkspace.getState().updateBufferContent(id, text),
      openFile: (path) => useProject.getState().openFile(path),
      findBufferByPath: (path) => { const b = useWorkspace.getState().buffers.find((x) => x.origin?.type === 'project' && x.origin.path === path); return b ? { id: b.id, isProject: true } : undefined },
      isProjectBuffer: (id) => useWorkspace.getState().buffers.find((x) => x.id === id)?.origin?.type === 'project',
    })
    const msg = `Replaced ${o.total} occurrence${o.total === 1 ? '' : 's'} of "${query}" in ${o.files} file${o.files === 1 ? '' : 's'}${o.opened ? ` (${o.opened} opened as dirty buffer${o.opened === 1 ? '' : 's'})` : ''}`
    useWorkspace.getState().addLog('INFO', 'UI', msg)
    if (o.dirtyProjectBuffers > 0) {
      /* Sprint 14: project files were dirtied — one click to write them */
      toast(msg, { duration: 10000, action: { label: `Save ${o.dirtyProjectBuffers} file${o.dirtyProjectBuffers === 1 ? '' : 's'}`, onClick: () => void useProject.getState().saveAllDirty() } })
    } else {
      toast(msg)
    }
    setConfirming(false)
    projectCache.current = null
    setRunTick((t) => t + 1)
  }, [projectFiles, query, opts, replacement])

  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(t)
  }, [confirming])

  const summary = useMemo(() => {
    if (!query) return 'open buffers' + (projectKind ? ' + project files' : '')
    if (!shown) return ''
    if (shown.error) return shown.error
    if (shown.totalMatches === 0) return 'no matches'
    return `${shown.totalMatches}${shown.truncated ? '+' : ''} in ${shown.files.length} file${shown.files.length === 1 ? '' : 's'}`
  }, [query, shown, projectKind])

  const flip = (k: keyof SearchOptions) => setSearchOpts({ [k]: !opts[k] })

  return (
    <div className="flex max-h-[55%] shrink-0 flex-col border-b border-hairline" data-testid="search-panel">
      <div className="flex items-center gap-1 px-2 pt-1.5">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); setSearchOpen(false) }
            if (e.key === 'Enter' && shown?.files[0]) { e.preventDefault(); open(shown.files[0], shown.files[0].matches[0]) }
          }}
          placeholder="Search workspace…"
          spellCheck={false}
          aria-label="Search workspace"
          className="h-6 w-full min-w-0 rounded-sm bg-inset px-2 font-mono text-[11.5px] text-primary outline-none ring-1 ring-hairline focus:ring-steel"
        />
        <button type="button" title="Close search (Esc)" onClick={() => setSearchOpen(false)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-raised hover:text-primary">
          <X size={12} />
        </button>
      </div>
      <div className="flex items-center gap-0.5 px-2 py-1">
        <Toggle on={!!opts.caseSensitive} title="Match case" onClick={() => flip('caseSensitive')}><CaseSensitive size={12} /></Toggle>
        <Toggle on={!!opts.wholeWord} title="Whole symbol" onClick={() => flip('wholeWord')}><WholeWord size={12} /></Toggle>
        <Toggle on={!!opts.regex} title="Regular expression" onClick={() => flip('regex')}><Regex size={12} /></Toggle>
        <Toggle on={!!opts.symbolsOnly} title="Code only — skip strings and comments" onClick={() => flip('symbolsOnly')}><Sigma size={12} /></Toggle>
        <Toggle on={replaceOpen} title="Replace…" onClick={() => { setReplaceOpen((v) => !v); setConfirming(false) }}><Replace size={12} /></Toggle>
        <span className={cn('ml-auto truncate font-mono text-[10px]', shown?.error ? 'text-error' : 'text-muted')} title={summary}>
          {searching ? 'searching…' : summary}
        </span>
      </div>
      {replaceOpen && (
        <div className="flex items-center gap-1 px-2 pb-1">
          <input
            value={replacement}
            onChange={(e) => { setReplacement(e.target.value); setConfirming(false) }}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setReplaceOpen(false) } }}
            placeholder={opts.regex ? 'replacement ($1 …)' : 'replacement'}
            spellCheck={false}
            aria-label="Replacement"
            className="h-6 w-full min-w-0 rounded-sm bg-inset px-2 font-mono text-[11.5px] text-primary outline-none ring-1 ring-hairline focus:ring-steel"
          />
          <button
            type="button"
            disabled={!shown || shown.totalMatches === 0 || !!shown.error}
            title={confirming ? `Confirm: replace ${shown?.totalMatches ?? 0} in ${shown?.files.length ?? 0} file(s)` : `Replace all (${shown?.totalMatches ?? 0} in ${shown?.files.length ?? 0} file(s))`}
            onClick={() => (confirming ? void applyReplace() : setConfirming(true))}
            className={cn('flex h-6 shrink-0 items-center gap-1 rounded-sm px-2 font-mono text-[10.5px] transition-colors duration-100 disabled:opacity-40', confirming ? 'bg-error/20 text-primary ring-1 ring-error/60' : 'text-secondary ring-1 ring-hairline hover:bg-raised hover:text-primary')}
          >
            <ReplaceAll size={12} />{confirming ? 'confirm?' : 'all'}
          </button>
        </div>
      )}
      <div className="min-h-0 overflow-y-auto pb-1">
        {shown?.files.map((f) => (
          <div key={(f.bufferId ?? '') + f.path}>
            <div className="sticky top-0 flex items-center gap-1 bg-panel px-2 py-[2px] font-mono text-[10.5px] text-secondary">
              <span className="truncate" title={f.path}>{f.path}</span>
              {f.kind === 'buffer' && <span className="text-muted">· buffer</span>}
              <span className="ml-auto text-muted">{f.matches.length}</span>
              {replaceOpen && (
                <button type="button" title={`Replace ${f.matches.length} in ${f.path}`} onClick={() => void applyReplace(f)} className="flex h-4 w-4 items-center justify-center rounded-sm text-muted hover:bg-raised hover:text-primary">
                  <Replace size={11} />
                </button>
              )}
            </div>
            {f.matches.map((m, i) => <MatchRow key={i} m={m} onOpen={() => open(f, m)} preview={previewFor} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
