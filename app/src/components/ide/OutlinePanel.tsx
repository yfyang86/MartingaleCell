/* Definition outline (Sprint 11): what the active buffer defines (scanned
 * from its text, ticked when the image has evaluated it), the project's
 * definitions from the last load, and definitions typed into the session
 * box. Every row jumps. Lives in the explorer column next to search. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n/context'
import { useWorkspace } from '@/store/workspace'
import { useProject, collectLispFiles } from '@/store/project'
import { useUi } from '@/store/ui'
import { scanDefinitions, mergeProjectOutline, type OutlineEntry, type ProjectOutlineFile } from '@/outline/outline'
import { gotoBuffer, gotoLocation, jumpToPosition } from './actions'

const KIND_SHORT: Record<string, string> = {
  defun: 'fn', defmacro: 'mac', defvar: 'var', defparameter: 'par', defconstant: 'const', defclass: 'class',
  defstruct: 'struct', defgeneric: 'gen', defmethod: 'meth', deftype: 'type', 'define-condition': 'cond',
  defpackage: 'pkg', defsetf: 'setf', 'define-symbol-macro': 'smac',
}

function Row({ kind, label, where, ticked, onClick }: { kind: string; label: string; where?: string; ticked?: boolean; onClick: () => void }) {
  const { t } = useI18n()
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-1.5 truncate px-2 py-[2px] text-left font-mono text-[11px] hover:bg-raised" title={where}>
      <span className="w-9 shrink-0 text-[10px] text-muted">{KIND_SHORT[kind] ?? kind}</span>
      <span className="truncate text-secondary">{label}</span>
      {ticked && <Check size={11} className="ml-auto shrink-0 text-steel" aria-label={t('evaluated')} />}
      {!ticked && where && <span className="ml-auto shrink-0 text-[10px] text-muted">{where}</span>}
    </button>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null
  return (
    <div>
      <div className="sticky top-0 flex items-center gap-1 bg-panel px-2 py-[2px] font-mono text-[10.5px] text-secondary">
        <span className="truncate">{title}</span>
        <span className="ml-auto text-muted">{count}</span>
      </div>
      {children}
    </div>
  )
}

export default function OutlinePanel() {
  const { t } = useI18n()
  const buffers = useWorkspace((s) => s.buffers)
  const activeBufferId = useWorkspace((s) => s.activeBufferId)
  const definitions = useProject((s) => s.definitions)
  const bufferDefinitions = useProject((s) => s.bufferDefinitions)
  const projectKind = useProject((s) => s.kind)
  const projectName = useProject((s) => s.name)
  const projectFiles = useProject((s) => s.files)
  const setOutlineOpen = useUi((s) => s.setOutlineOpen)
  const [filter, setFilter] = useState('')
  /* Sprint 12: the project's Lisp files are scanned (same cache rule as the search panel), loaded definitions ticked */
  const [scannedFiles, setScannedFiles] = useState<{ path: string; content: string }[]>([])
  const scanCache = useRef<{ at: number; key: string } | null>(null)
  useEffect(() => {
    if (!projectKind) { scanCache.current = null; return }
    const key = (projectKind === 'virtual' ? String(Object.keys(projectFiles).length) : '') + (projectName ?? '')
    const c = scanCache.current
    if (c && c.key === key && (projectKind === 'virtual' || Date.now() - c.at < 5000)) return
    let cancelled = false
    void collectLispFiles().then((files) => {
      if (cancelled) return
      scanCache.current = { at: Date.now(), key }
      setScannedFiles(files)
    })
    return () => { cancelled = true }
  }, [projectKind, projectName, projectFiles])

  const active = buffers.find((b) => b.id === activeBufferId) ?? null
  const scanned = useMemo<OutlineEntry[]>(() => (active ? scanDefinitions(active.content) : []), [active])
  const f = filter.trim().toLowerCase()
  const matches = (name: string) => !f || name.toLowerCase().includes(f)

  const evaluated = useMemo(() => {
    const set = new Set<string>()
    if (!active) return set
    for (const d of bufferDefinitions) if (d.bufferId === active.id) set.add(d.name)
    if (active.origin?.type === 'project') for (const d of definitions) if (d.path === active.origin.path) set.add(d.name)
    return set
  }, [active, bufferDefinitions, definitions])

  const projectOutline = useMemo<ProjectOutlineFile[]>(
    () => mergeProjectOutline(projectKind ? scannedFiles : [], definitions)
      .map((pf) => ({ ...pf, entries: pf.entries.filter((e) => matches(e.name)) }))
      .filter((pf) => pf.entries.length > 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [scannedFiles, definitions, projectKind, f])
  const sessionDefs = bufferDefinitions.filter((d) => d.cellN != null && matches(d.name))
  const bufferRows = scanned.filter((e) => matches(e.name))
  const total = bufferRows.length + projectOutline.reduce((n, pf) => n + pf.entries.length, 0) + sessionDefs.length

  return (
    <div className="flex max-h-[55%] shrink-0 flex-col border-b border-hairline" data-testid="outline-panel">
      <div className="flex items-center gap-1 px-2 pt-1.5">
        <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{t('Outline')}</span>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setOutlineOpen(false) } }}
          placeholder={t('filter…')}
          spellCheck={false}
          aria-label={t('Filter outline')}
          className="h-6 w-full min-w-0 rounded-sm bg-inset px-2 font-mono text-[11.5px] text-primary outline-none ring-1 ring-hairline focus:ring-steel"
        />
        <button type="button" title={t('Close outline (Ctrl⇧O)')} onClick={() => setOutlineOpen(false)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-raised hover:text-primary">
          <X size={12} />
        </button>
      </div>
      <div className={cn('px-2 py-1 font-mono text-[10px] text-muted', total === 0 && 'pb-2')}>
        {total === 0 ? (active ? t('no definitions') : t('no buffer')) : `${total} ${total === 1 ? t('definition') : t('definitions')} · ${t('✓ = evaluated / loaded')}`}
      </div>
      <div className="min-h-0 overflow-y-auto pb-1">
        <Section title={active ? active.name : t('buffer')} count={bufferRows.length}>
          {bufferRows.map((e) => (
            <Row key={e.offset} kind={e.kind} label={e.label} ticked={evaluated.has(e.name)} onClick={() => jumpToPosition(e.line, e.col)} />
          ))}
        </Section>
        {projectOutline.map((pf) => (
          <Section key={pf.path} title={pf.path} count={pf.entries.length}>
            {pf.entries.map((e) => (
              <Row key={`${pf.path}:${e.offset}:${e.name}`} kind={e.kind} label={e.label} where={`:${e.line}`} ticked={e.loaded} onClick={() => gotoLocation(pf.path, e.line, e.col)} />
            ))}
          </Section>
        ))}
        <Section title={t('session box')} count={sessionDefs.length}>
          {sessionDefs.map((d) => (
            <Row key={`cell:${d.name}`} kind={d.kind} label={d.name.toLowerCase()} where={`[${d.cellN}]`} onClick={() => { if (d.cellN != null) window.dispatchEvent(new CustomEvent('martingalecell:goto-cell', { detail: d.cellN })) }} />
          ))}
        </Section>
        {bufferDefinitions.some((d) => d.cellN == null && d.bufferId !== active?.id && matches(d.name)) && (
          <Section title={t('other buffers (evaluated)')} count={bufferDefinitions.filter((d) => d.cellN == null && d.bufferId !== active?.id && matches(d.name)).length}>
            {bufferDefinitions.filter((d) => d.cellN == null && d.bufferId !== active?.id && matches(d.name)).map((d) => (
              <Row key={`b:${d.bufferId}:${d.name}`} kind={d.kind} label={d.name.toLowerCase()} where={`${d.bufferName}:${d.line}`} onClick={() => gotoBuffer(d.bufferId, d.line, d.col)} />
            ))}
          </Section>
        )}
      </div>
    </div>
  )
}
