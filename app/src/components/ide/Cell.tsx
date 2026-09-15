/* A single session cell: input echo, streamed OUT block, values, warnings,
 * error mini-debugger with restarts, running/queued states. */

import { Fragment, memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { Copy, RotateCw, CornerDownLeft, ChevronDown, X, OctagonX, Loader2, FilePlus2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Cell } from '@/store/workspace'
import { useWorkspace } from '@/store/workspace'
import { useUi } from '@/store/ui'
import { lineageOf } from '@/session/lineage'
import { LispCode } from './LispCode'
import { copyText, getEditor, jumpToPosition, chooseRestart, provideInput, openCellAsBuffer, rerunCell } from './actions'
import type { ConditionDetail, DebugRestart } from '@/lisp/types'
import { findSymbolPosition } from './lisp-utils'
import { firstSymbol, stripOutMarkers } from '@/store/evaluate'
import { ProjectLoadBody } from './ProjectLoadCell'
import { loadProjectIntoRuntime } from '@/project/load'
import { CellPlots } from '@/plot/SvgPlot'

function useElapsed(running: boolean, startedAt: number): number {
  const [ms, setMs] = useState(0)
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setMs(Date.now() - startedAt), 100)
    return () => clearInterval(t)
  }, [running, startedAt])
  return ms
}

function ValueLine({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = value.length > 60 || value.split('\n').length > 20
  const shown = expanded || !long ? value : value.slice(0, 60) + ' …'
  const isList = shown.startsWith('(')
  const isObj = shown.startsWith('#<')
  const isStr = shown.startsWith('"')
  const isNum = /^[+-]?[\d./]/.test(shown)
  return (
    <div className="flex items-start gap-2">
      <span className="select-none font-mono text-[12.5px] font-bold text-success">;;=&gt;</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12.5px]">
        {isList ? (
          <LispCode code={shown} />
        ) : (
          <span className={cn(isObj ? 'tok-comment' : isStr ? 'tok-string' : isNum ? 'tok-number' : 'tok-symbol')}>{shown}</span>
        )}
        {long && (
          <button
            className="ml-2 rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] text-muted transition-colors hover:border-strong hover:text-secondary"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? 'collapse' : 'expand'}
          </button>
        )}
      </span>
    </div>
  )
}

function WarningRow({ msg, bufferName, input, onDismiss }: { msg: string; bufferName?: string; input: string; onDismiss: () => void }) {
  const jump = () => {
    const m = msg.match(/redefining\s+(?:[\w.-]+:)?([\w*+/<>=!?$%&.-]+)/i)
    const symbol = m?.[1] ?? firstSymbol(input)
    const s = useWorkspace.getState()
    const buf = s.buffers.find((b) => b.name === bufferName) ?? s.buffers.find((b) => b.id === s.activeBufferId)
    if (!buf) return
    if (buf.id !== s.activeBufferId) s.setActiveBuffer(buf.id)
    const pos = findSymbolPosition(buf.content, symbol)
    setTimeout(() => jumpToPosition(pos?.line ?? 1, pos?.col ?? 1), 30)
  }
  const s = useWorkspace.getState()
  const buf = s.buffers.find((b) => b.name === bufferName)
  const m = msg.match(/redefining\s+(?:[\w.-]+:)?([\w*+/<>=!?$%&.-]+)/i)
  const pos = buf ? findSymbolPosition(buf.content, m?.[1] ?? firstSymbol(input)) : null
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="select-none font-mono text-[11px] font-bold text-warning">;; WARNING</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-secondary" title={msg}>{msg}</span>
      {bufferName && (
        <button
          className="shrink-0 rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] text-steel transition-colors hover:border-strong hover:bg-raised"
          onClick={jump}
          title="Jump to source"
        >
          {bufferName}{pos ? `:${pos.line}:${pos.col}` : ''}
        </button>
      )}
      <button className="shrink-0 text-muted hover:text-primary" onClick={onDismiss} aria-label="Dismiss warning">
        <X size={12} />
      </button>
    </div>
  )
}

/** Frames captured at signal time (innermost first) — ECL only. */
/** "↗ cell-7.lisp" when the cell was opened as a buffer that still exists (Sprint 17) */
function LinkedBufferChip({ bufferId }: { bufferId: string }) {
  const name = useWorkspace((s) => s.buffers.find((b) => b.id === bufferId)?.name)
  const setActiveBuffer = useWorkspace((s) => s.setActiveBuffer)
  if (!name) return null
  return (
    <button type="button" className="rounded-sm border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-muted hover:text-primary" title={`Linked buffer — re-run evaluates its current text (${name})`} onClick={() => setActiveBuffer(bufferId)}>
      ↗ {name}
    </button>
  )
}

function FramesDetails({ frames, tone }: { frames: string[]; tone: 'error' | 'warning' }) {
  if (frames.length === 0) return null
  return (
    <details className={cn('px-3 py-1', tone === 'error' ? 'border-t border-error/15' : 'border-t border-warning/20')}>
      <summary className="cursor-pointer select-none font-mono text-[11px] text-muted transition-colors hover:text-secondary">
        frames ({frames.length})
      </summary>
      <ol className="mt-1 space-y-0.5 pb-1 font-mono text-[11.5px]">
        {frames.map((f, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-5 shrink-0 text-right text-muted">{i}</span>
            <span className={i === 0 ? (tone === 'error' ? 'text-error' : 'text-warning') : 'text-secondary'}>{f}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}

/** Condition slots (datum / expected / name / operands …) captured at signal time. */
function DetailsList({ details }: { details: ConditionDetail[] }) {
  if (details.length === 0) return null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-3 pb-1.5 font-mono text-[11.5px]">
      {details.map((d, i) => (
        <Fragment key={i}>
          <dt className="text-muted">{d.key}</dt>
          <dd className="min-w-0 break-all text-secondary">{d.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

/** Restarts that take an argument get a value-form input before they fire. */
function restartNeedsValue(r: DebugRestart): boolean {
  if (/^(RETRY|ABORT|CONTINUE|MUFFLE-WARNING)$/i.test(r.name)) return false
  return /USE-VALUE|STORE-VALUE|DEFINE-FUNCTION/i.test(r.name) || /\bvalue\b/i.test(r.report)
}

/** The cell is blocked on (read-line) & co.: one line in, Enter sends, EOF ends. */
function InputBlock({ cell }: { cell: Cell }) {
  const [text, setText] = useState('')
  const send = () => { provideInput(cell.id, text); setText('') }
  return (
    <div className="mt-2 rounded-md border border-steel/40 bg-steel-dim/30">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="shrink-0 font-mono text-[11px] font-bold text-steel">stdin ←</span>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); send() }
            if (e.key === 'd' && e.ctrlKey) { e.preventDefault(); provideInput(cell.id, null) }
          }}
          placeholder="the program is reading a line — type it and press Enter"
          className="h-7 min-w-0 flex-1 rounded-md border border-hairline bg-inset px-2 font-mono text-[12px] text-primary placeholder:text-muted focus:border-strong focus:outline-none"
        />
        <button
          className="shrink-0 rounded-full border border-steel/40 px-2.5 py-0.5 font-mono text-[11px] text-steel transition-colors hover:bg-steel-dim"
          onClick={send}
          title="Send this line"
        >
          send ↵
        </button>
        <button
          className="shrink-0 font-mono text-[10.5px] text-muted hover:text-primary"
          onClick={() => provideInput(cell.id, null)}
          title="End of file (Ctrl+D)"
        >
          EOF
        </button>
      </div>
    </div>
  )
}

/** The live debugger: the image is suspended inside the handler and waits
 * for one of these restarts. Number keys pick a row; a restart that takes a
 * value opens an inline form input (read in the cell's package). */
function DebuggerBlock({ cell }: { cell: Cell }) {
  const pause = cell.debug
  const [value, setValue] = useState('')
  const [valueFor, setValueFor] = useState<number | null>(null)
  const restarts = useMemo(() => pause?.restarts ?? [], [pause])

  const pick = useCallback((r: DebugRestart) => {
    if (restartNeedsValue(r)) { setValueFor(r.index); return }
    chooseRestart(cell.id, r.index)
  }, [cell.id])

  const submitValue = () => {
    if (valueFor == null || !value.trim()) return
    chooseRestart(cell.id, valueFor, value)
  }

  // number keys pick a restart while this cell is paused (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (!/^[0-9]$/.test(e.key)) return
      const r = restarts.find((x) => x.index === Number(e.key))
      if (r) { e.preventDefault(); pick(r) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [restarts, pick])

  if (!pause) return null
  const pending = valueFor != null ? restarts.find((r) => r.index === valueFor) : undefined
  return (
    <div className="mt-2 rounded-md border border-warning/40 bg-warning/[0.06]">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <OctagonX size={13} className="shrink-0 text-warning" />
        <span className="font-mono text-[12px] font-bold text-warning">;; DEBUGGER — {pause.errorType ?? 'ERROR'}</span>
        <span className="ml-auto font-mono text-[10.5px] text-muted">image paused · pick a restart</span>
      </div>
      <div className="whitespace-pre-wrap break-words px-3 pb-1.5 font-mono text-[12.5px] leading-relaxed text-primary/90">
        {pause.condition}
      </div>
      <DetailsList details={pause.details} />
      <FramesDetails frames={pause.frames} tone="warning" />
      <div className="border-t border-warning/20 py-1">
        {restarts.map((r) => (
          <button
            key={r.index}
            className={cn(
              'flex w-full items-baseline gap-3 px-3 py-1 text-left font-mono text-[12px] text-secondary transition-colors hover:bg-raised hover:text-primary',
              valueFor === r.index && 'bg-raised text-primary',
            )}
            onClick={() => pick(r)}
            title={restartNeedsValue(r) ? 'Takes a value — you will be asked for a form' : undefined}
          >
            <span className="text-muted">[{r.index}]</span>
            <span className="w-28 shrink-0 font-semibold text-warning">{r.name}</span>
            <span className="min-w-0 flex-1 truncate text-[11px]" title={r.report}>{r.report}</span>
            {restartNeedsValue(r) && <span className="text-[10px] text-muted">value…</span>}
          </button>
        ))}
        {restarts.length === 0 && (
          <div className="px-3 py-1 font-mono text-[11.5px] text-muted">; no restarts offered — decline to report the error</div>
        )}
      </div>
      {pending && (
        <div className="flex items-center gap-2 border-t border-warning/20 px-3 py-1.5">
          <span className="shrink-0 font-mono text-[11px] text-muted">{pending.name} ←</span>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitValue(); if (e.key === 'Escape') setValueFor(null) }}
            placeholder={`a form, evaluated in ${cell.pkg} — e.g. 42 or (list 1 2)`}
            className="h-7 min-w-0 flex-1 rounded-md border border-hairline bg-inset px-2 font-mono text-[12px] text-primary placeholder:text-muted focus:border-strong focus:outline-none"
          />
          <button
            className="shrink-0 rounded-full border border-warning/40 px-2.5 py-0.5 font-mono text-[11px] text-warning transition-colors hover:bg-warning/10 disabled:opacity-40"
            disabled={!value.trim()}
            onClick={submitValue}
          >
            use ↵
          </button>
        </div>
      )}
      <div className="flex items-center gap-3 border-t border-warning/20 px-3 py-1 font-mono text-[10.5px] text-muted">
        <button className="hover:text-primary" onClick={() => chooseRestart(cell.id, -1)} title="Leave the debugger; the condition is reported as an error">
          report as error
        </button>
        <span>·</span>
        <span>keys 0–{Math.max(0, restarts.length - 1)} pick a restart</span>
        <span className="ml-auto">stuck? <span className="cc-kbd">Ctrl .</span> interrupts</span>
      </div>
    </div>
  )
}

/** "run k of N" for a re-evaluated cell; opens the run history (Sprint 21) */
function RunChip({ cell, run }: { cell: Cell; run: string }) {
  const setCellHistory = useUi((s) => s.setCellHistory)
  const [k, total] = run.split('/')
  return (
    <button
      type="button"
      data-testid="run-chip"
      className="rounded-sm border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-muted hover:text-primary"
      title={`Run ${k} of ${total} — click to compare the runs`}
      onClick={() => setCellHistory(lineageOf(cell))}
    >
      run {k}/{total}
    </button>
  )
}

function CellComponent({ cell, flash, run }: { cell: Cell; flash?: boolean; run?: string }) {
  const updateCell = useWorkspace((s) => s.updateCell)
  const removeCell = useWorkspace((s) => s.removeCell)
  /* (updateCell: warning dismissal) */
  const [collapsed, setCollapsed] = useState(false)
  const [inputExpanded, setInputExpanded] = useState(false)
  const running = cell.status === 'running'
  const paused = cell.status === 'paused'
  const isProject = cell.kind === 'project'
  const elapsed = useElapsed(running, cell.startedAt)
  const inputLines = cell.input.split('\n')
  const longInput = inputLines.length > 12
  const shownInput = longInput && !inputExpanded ? inputLines.slice(0, 6).join('\n') : cell.input
  // values/warnings/errors have dedicated UI — never show their markers in the OUT well
  const outText = useMemo(() => stripOutMarkers(cell.stdout).replace(/\n+$/, ''), [cell.stdout])

  const cellText = useMemo(() => {
    const parts = [`${cell.pkg}> ${cell.input}`]
    if (outText) parts.push(';; OUT  ' + outText.replace(/\n/g, '\n;; OUT  '))
    cell.warnings.forEach((w) => parts.push(';; WARNING  ' + w))
    if (cell.error) parts.push(';; ERROR  ' + cell.error)
    else cell.values.forEach((v) => parts.push(';;=> ' + v))
    return parts.join('\n')
  }, [cell, outText])

  const pasteToEditor = () => {
    const view = getEditor()
    if (!view) return
    const pos = view.state.selection.main.head
    view.dispatch({ changes: { from: pos, insert: cell.input }, selection: { anchor: pos + cell.input.length } })
    view.focus()
  }

  const isError = cell.status === 'error'
  const accent = isError ? 'cc-cell-error' : paused || cell.warnings.length > 0 ? 'cc-cell-warning' : cell.status === 'done' ? 'cc-cell-result' : 'cc-cell-input'
  /* the OUT well must stay visible while the program waits for a line
   * (prompts like "Name? " are printed right before the read) */

  return (
    <motion.div
      id={`cell-${cell.n}`}
      initial={{ opacity: 0, y: 12 }}
      animate={isError ? { opacity: 1, y: 0, x: [0, -4, 4, -2, 2, 0] } : { opacity: 1, y: 0 }}
      transition={isError
        ? { opacity: { duration: 0.18 }, y: { duration: 0.18 }, x: { duration: 0.2 } }
        : { duration: 0.18, ease: [0.2, 0.7, 0.3, 1] }}
      className={cn(
        'cc-cell group mb-2 scroll-mt-2 transition-shadow duration-700',
        accent,
        cell.status === 'queued' && 'opacity-50',
        flash && 'ring-2 ring-steel',
      )}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 120px' } as CSSProperties}
    >
      {/* scan wipe on completion */}
      {(cell.status === 'done' || isError) && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left animate-scan-x bg-steel" />
      )}
      {isError && (
        <motion.span
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px]"
          initial={{ boxShadow: '0 0 12px rgba(248,113,113,.55)' }}
          animate={{ boxShadow: '0 0 0px rgba(248,113,113,0)' }}
          transition={{ duration: 0.6 }}
          style={{ background: 'var(--error)' }}
        />
      )}

      {/* gutter header */}
      <div className="flex h-6 items-center justify-between px-3 pt-1.5">
        <span className="flex items-center gap-1.5">
          <span className="rounded-sm bg-steel-dim px-1.5 py-0.5 font-mono text-[10.5px] text-steel-bright">In [{cell.n}]</span>
          {cell.imported && <span className="rounded-sm border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-muted" title="Appended from a transcript — not evaluated in this session">imported</span>}
          {cell.bufferId && <LinkedBufferChip bufferId={cell.bufferId} />}
          {run && !run.endsWith('/1') && <RunChip cell={cell} run={run} />}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
          <button className="rounded-sm p-1 text-muted hover:bg-panel hover:text-primary" title="Copy cell" onClick={() => void copyText(cellText, 'Cell copied')}>
            <Copy size={12} />
          </button>
          <button
            className="rounded-sm p-1 text-muted hover:bg-panel hover:text-primary"
            title={isProject ? 'Reload project' : 'Re-run'}
            onClick={() => (isProject ? void loadProjectIntoRuntime() : rerunCell(cell))}
          >
            <RotateCw size={12} />
          </button>
          <button className="rounded-sm p-1 text-muted hover:bg-panel hover:text-primary" title="Paste into editor" onClick={pasteToEditor}>
            <CornerDownLeft size={12} />
          </button>
          {!isProject && (
            <button className="rounded-sm p-1 text-muted hover:bg-panel hover:text-primary" title="Open as buffer" onClick={() => openCellAsBuffer(cell)}>
              <FilePlus2 size={12} />
            </button>
          )}
          <button className="rounded-sm p-1 text-muted hover:bg-panel hover:text-primary" title="Collapse" onClick={() => setCollapsed((c) => !c)}>
            <ChevronDown size={12} className={cn('transition-transform duration-150', collapsed && '-rotate-90')} />
          </button>
          <button className="rounded-sm p-1 text-muted hover:bg-panel hover:text-error" title="Delete" onClick={() => removeCell(cell.id)}>
            <X size={12} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 pb-2">
          {/* input echo */}
          <div className="mt-1 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.55]">
            <span className="select-none font-medium text-steel">{cell.pkg}&gt; </span>
            <LispCode code={shownInput} />
            {longInput && (
              <button className="ml-2 text-[11px] text-muted underline decoration-dotted hover:text-secondary" onClick={() => setInputExpanded((e) => !e)}>
                {inputExpanded ? '… show less' : `… show all (${inputLines.length} lines)`}
              </button>
            )}
          </div>

          {/* queued / running */}
          {cell.status === 'queued' && (
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] text-muted">queued</span>
              <div className="h-3 w-2/3 animate-pulse rounded-sm bg-raised" />
            </div>
          )}
          {running && (
            <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-steel">
              <Loader2 size={12} className="animate-spin" />
              <span>{(elapsed / 1000).toFixed(1)}s</span>
              {elapsed > 5000 && <span className="text-muted">Taking long? Interrupt with <span className="cc-kbd">Ctrl .</span></span>}
            </div>
          )}

          {/* paused in the debugger — live restarts (eval cells and project loads alike) */}
          {paused && <DebuggerBlock cell={cell} />}
          {/* blocked on standard input */}
          {cell.status === 'input' && <InputBlock cell={cell} />}

          {/* stdout — hidden when nothing but marker lines were captured */}
          {outText && (
            <div className="mt-2 rounded-md border border-hairline bg-inset px-3 py-1.5">
              {outText.split('\n').map((line, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }} className="flex gap-2 whitespace-pre-wrap break-words">
                  <span className="select-none font-mono text-[11px] text-muted">;; OUT</span>
                  <span className="font-mono text-[11.5px] text-secondary">{line}</span>
                </motion.div>
              ))}
            </div>
          )}

          {/* warnings */}
          {cell.warnings.length > 0 && (
            <div className="mt-2 rounded-md border border-warning/20 bg-warning/[0.06] py-0.5">
              {cell.warnings.map((w, i) => (
                <WarningRow
                  key={i}
                  msg={w}
                  bufferName={cell.bufferName}
                  input={cell.input}
                  onDismiss={() => updateCell(cell.id, { warnings: cell.warnings.filter((_, j) => j !== i) })}
                />
              ))}
            </div>
          )}

          {/* project load body */}
          {isProject && <ProjectLoadBody cell={cell} running={running} />}

          {/* error / debugger (project cells get a plain condition line — no restarts) */}
          {isError && isProject && (
            <div className="mt-2 rounded-md border border-error/25 bg-error/[0.06] px-3 py-1.5">
              <span className="font-mono text-[12px] font-bold text-error">;; ERROR — {cell.errorType ?? 'CONDITION'}</span>
              <div className="whitespace-pre-wrap break-words font-mono text-[12px] text-primary/90">{cell.error}</div>
            </div>
          )}
          {isError && !isProject && (
            <div className="mt-2 rounded-md border border-error/25 bg-error/[0.06]">
              <div className="flex items-center gap-2 px-3 py-1.5">
                <OctagonX size={13} className="shrink-0 text-error" />
                <span className="font-mono text-[12px] font-bold text-error">;; ERROR — {cell.errorType ?? 'CONDITION'}</span>
              </div>
              <div className="whitespace-pre-wrap break-words px-3 pb-1.5 font-mono text-[12.5px] leading-relaxed text-primary/90">
                {cell.error}
              </div>
              <DetailsList details={cell.details ?? []} />
              <FramesDetails frames={cell.frames ?? []} tone="error" />
              <div className="flex items-center gap-3 border-t border-error/15 px-3 py-1 font-mono text-[11px] text-muted">
                {cell.resumedVia
                  ? <span>;; resolved via {cell.resumedVia}</span>
                  : <span>;; reported without pausing{cell.errorType === 'READER-ERROR' ? ' (reader error)' : ''}</span>}
                <button className="ml-auto hover:text-primary" onClick={() => rerunCell(cell)}>re-run</button>
              </div>
            </div>
          )}

          {/* resolution line on a cell that came back from the debugger with values */}
          {cell.status === 'done' && cell.resumedVia && (
            <div className="mt-2 font-mono text-[11px] text-muted">;; resumed via {cell.resumedVia}</div>
          )}

          {/* aborted */}
          {cell.status === 'aborted' && (
            <div className="mt-2 font-mono text-[11.5px] italic text-muted">; Evaluation aborted</div>
          )}

          {/* values */}
          {!isProject && cell.values.length > 0 && !isError && (
            <div className="mt-2 space-y-1">
              {cell.values.map((v, i) => <ValueLine key={i} value={v} />)}
            </div>
          )}
          {!isProject && cell.status === 'done' && cell.values.length === 0 && (
            <div className="mt-2 flex items-start gap-2">
              <span className="select-none font-mono text-[12.5px] font-bold text-success">;;=&gt;</span>
              <span className="font-mono text-[12px] text-muted">; no values</span>
            </div>
          )}

          {/* gnuplot captures — rendered in-browser as SVG (project cells
           * render their plots inside ProjectLoadBody instead) */}
          {!isProject && cell.plots && cell.plots.length > 0 && <CellPlots plots={cell.plots} />}

          {/* meta footer */}
          {(cell.status === 'done' || isError || cell.status === 'aborted') && (
            <div className="mt-2 flex h-[22px] items-center gap-3 font-mono text-[10.5px] text-muted">
              <span title="engine round-trip">{cell.durationMs < 1 ? '<1' : cell.durationMs.toFixed(0)} ms</span>
              <span>restarts used: {cell.restartsUsed}</span>
              <span className="ml-auto flex gap-2 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
                <button className="hover:text-primary" onClick={() => void copyText(cellText, 'Cell copied')}>copy</button>
                <button
                  className="hover:text-primary"
                  onClick={() => (isProject ? void loadProjectIntoRuntime() : rerunCell(cell))}
                >
                  re-run
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

export const CellView = memo(CellComponent)
