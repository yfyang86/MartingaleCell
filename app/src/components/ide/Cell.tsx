/* A single session cell: input echo, streamed OUT block, values, warnings,
 * error mini-debugger with restarts, running/queued states. */

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { Copy, RotateCw, CornerDownLeft, ChevronDown, X, OctagonX, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Cell } from '@/store/workspace'
import { useWorkspace } from '@/store/workspace'
import { LispCode } from './LispCode'
import { copyText, getEditor, jumpToPosition } from './actions'
import { evaluateCode } from '@/store/evaluate'
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

const RESTARTS = [
  { name: 'ABORT', desc: 'Return to top level', available: true },
  { name: 'RETRY', desc: 'Retry the evaluation', available: true },
  { name: 'USE-VALUE', desc: 'Enter a value to use instead', available: false },
  { name: 'CONTINUE', desc: 'Ignore and continue', available: false },
]

function CellComponent({ cell, flash }: { cell: Cell; flash?: boolean }) {
  const updateCell = useWorkspace((s) => s.updateCell)
  const removeCell = useWorkspace((s) => s.removeCell)
  const [collapsed, setCollapsed] = useState(false)
  const [inputExpanded, setInputExpanded] = useState(false)
  const [resumed, setResumed] = useState<string | null>(cell.resumedVia ?? null)
  const running = cell.status === 'running'
  const isProject = cell.kind === 'project'
  const elapsed = useElapsed(running, cell.startedAt)
  const inputLines = cell.input.split('\n')
  const longInput = inputLines.length > 12
  const shownInput = longInput && !inputExpanded ? inputLines.slice(0, 6).join('\n') : cell.input
  // values/warnings/errors have dedicated UI — never show their markers in the OUT well
  const outText = useMemo(() => stripOutMarkers(cell.stdout).replace(/\n+$/, ''), [cell.stdout])

  const chooseRestart = useCallback((name: string) => {
    if (name === 'RETRY') {
      setResumed('RETRY')
      updateCell(cell.id, { restartsUsed: cell.restartsUsed + 1, resumedVia: 'RETRY' })
      void evaluateCode(cell.input, cell.bufferName)
    } else if (name === 'ABORT') {
      setResumed('ABORT')
      updateCell(cell.id, { restartsUsed: cell.restartsUsed + 1, resumedVia: 'ABORT' })
      useWorkspace.getState().addLog('DEBUG', 'EVAL', `cell [${cell.n}] resumed via ABORT`, { cellRef: cell.n })
    }
  }, [cell.id, cell.restartsUsed, cell.input, cell.bufferName, cell.n, updateCell])

  // number-key restart selection while an error cell is shown
  useEffect(() => {
    if (cell.status !== 'error' || isProject) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const idx = ['0', '1'].indexOf(e.key)
      if (idx >= 0) chooseRestart(RESTARTS[idx].name)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cell.status, isProject, chooseRestart])

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
  const accent = isError ? 'cc-cell-error' : cell.warnings.length > 0 ? 'cc-cell-warning' : cell.status === 'done' ? 'cc-cell-result' : 'cc-cell-input'

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
        <span className="rounded-sm bg-steel-dim px-1.5 py-0.5 font-mono text-[10.5px] text-steel-bright">In [{cell.n}]</span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
          <button className="rounded-sm p-1 text-muted hover:bg-panel hover:text-primary" title="Copy cell" onClick={() => void copyText(cellText, 'Cell copied')}>
            <Copy size={12} />
          </button>
          <button
            className="rounded-sm p-1 text-muted hover:bg-panel hover:text-primary"
            title={isProject ? 'Reload project' : 'Re-run'}
            onClick={() => (isProject ? void loadProjectIntoRuntime() : void evaluateCode(cell.input, cell.bufferName))}
          >
            <RotateCw size={12} />
          </button>
          <button className="rounded-sm p-1 text-muted hover:bg-panel hover:text-primary" title="Paste into editor" onClick={pasteToEditor}>
            <CornerDownLeft size={12} />
          </button>
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
              <div className="border-t border-error/15 py-1">
                {RESTARTS.map((r, i) => (
                  <button
                    key={r.name}
                    disabled={!r.available}
                    className={cn(
                      'flex w-full items-baseline gap-3 px-3 py-1 text-left font-mono text-[12px] transition-colors',
                      r.available ? 'text-secondary hover:bg-raised hover:text-primary' : 'cursor-not-allowed text-muted/50',
                    )}
                    onClick={() => chooseRestart(r.name)}
                    title={r.available ? undefined : 'Requires a live debugger connection — unavailable after handler-case capture'}
                  >
                    <span className="text-muted">[{i}]</span>
                    <span className={cn('w-24 shrink-0 font-semibold', r.available ? 'text-steel' : '')}>{r.name}</span>
                    <span className="text-[11px]">{r.desc}</span>
                  </button>
                ))}
              </div>
              {resumed && (
                <div className="px-3 pb-2 font-mono text-[11px] text-muted">;; resumed via {resumed}</div>
              )}
            </div>
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
                  onClick={() => (isProject ? void loadProjectIntoRuntime() : void evaluateCode(cell.input, cell.bufferName))}
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
