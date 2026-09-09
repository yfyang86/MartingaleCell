/* Workspace search (Sprint 9): open buffers + project Lisp files, results
 * grouped by file, click to jump. Lives at the top of the explorer column. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, CaseSensitive, Regex, WholeWord, Sigma } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/store/workspace'
import { useProject, collectLispFiles } from '@/store/project'
import { useUi } from '@/store/ui'
import { searchSources, mergeSources, type SearchOptions, type SearchResults, type SearchFileResult, type SearchMatch } from '@/search/workspace-search'
import { gotoBuffer, gotoLocation } from './actions'

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

function MatchRow({ m, onOpen }: { m: SearchMatch; onOpen: () => void }) {
  const pre = m.lineText.slice(Math.max(0, m.from - 30), m.from)
  const hit = m.lineText.slice(m.from, m.to)
  const post = m.lineText.slice(m.to, m.to + 60)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-baseline gap-1.5 truncate px-2 py-[2px] text-left font-mono text-[11px] hover:bg-raised"
      title={`line ${m.line}, col ${m.col}`}
    >
      <span className="w-7 shrink-0 text-right text-muted">{m.line}</span>
      <span className="truncate text-secondary">
        {m.from > 30 ? '…' : ''}{pre}<mark className="rounded-[2px] bg-amber-400/25 px-[1px] text-primary">{hit}</mark>{post}
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
  }, [query, opts, buffers, projectFiles])
  const shown = query && results && results.query === query ? results : null

  const open = useCallback((f: SearchFileResult, m: SearchMatch) => {
    if (f.bufferId) gotoBuffer(f.bufferId, m.line, m.col)
    else gotoLocation(f.path, m.line, m.col)
  }, [])

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
        <span className={cn('ml-auto truncate font-mono text-[10px]', shown?.error ? 'text-error' : 'text-muted')} title={summary}>
          {searching ? 'searching…' : summary}
        </span>
      </div>
      <div className="min-h-0 overflow-y-auto pb-1">
        {shown?.files.map((f) => (
          <div key={(f.bufferId ?? '') + f.path}>
            <div className="sticky top-0 flex items-center gap-1 bg-panel px-2 py-[2px] font-mono text-[10.5px] text-secondary">
              <span className="truncate" title={f.path}>{f.path}</span>
              {f.kind === 'buffer' && <span className="text-muted">· buffer</span>}
              <span className="ml-auto text-muted">{f.matches.length}</span>
            </div>
            {f.matches.map((m, i) => <MatchRow key={i} m={m} onOpen={() => open(f, m)} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
