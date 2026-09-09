/* Evaluation orchestration: runtime ↔ cells ↔ logs. */

import { runtime } from '@/lisp/runtime'
import { useWorkspace, type Cell } from './workspace'
import { autoDownloadSavedPlots } from '@/plot/download'

/** Engine protocol markers (`;;=>` values, `;;WARNING:`/`;;ERROR:`, and the
 * `;;PLOT64` gnuplot capture channel) have their own dedicated cell UI —
 * they must never appear in the OUT well. */
export const OUT_MARKER_RE = /^;;(?:=>|WARNING:|ERROR:|PLOT64)/

/** Drop engine protocol marker lines from captured stdout. */
export function stripOutMarkers(stdout: string): string {
  if (!stdout) return ''
  return stdout
    .split('\n')
    .filter((l) => !OUT_MARKER_RE.test(l.trimStart()))
    .join('\n')
}

/** Evaluate a code string; appends a cell and mirrors warnings/errors into the log. */
export function evaluateCode(code: string, bufferName?: string): Promise<Cell> {
  const store = useWorkspace.getState()
  const trimmed = code.trim()
  const cell = store.addCell({
    input: trimmed,
    pkg: store.packageName,
    bufferName,
    status: 'queued',
    stdout: '',
    values: [],
    warnings: [],
    durationMs: 0,
    startedAt: Date.now(),
    restartsUsed: 0,
  })
  const pending = useWorkspace.getState().cells.some((c) => c.id !== cell.id && (c.status === 'running' || c.status === 'queued'))
  if (pending) store.updateCell(cell.id, { status: 'queued' })

  useWorkspace.getState().setEvaluating(true)

  return runtime
    .eval(trimmed, {
      onStart: () => {
        const s = useWorkspace.getState()
        s.updateCell(cell.id, { status: 'running', startedAt: Date.now() })
        s.setEvaluating(true)
      },
      onStream: (chunk) => {
        const kept = chunk.split('\n').filter((l) => !OUT_MARKER_RE.test(l.trimStart()))
        if (kept.length > 0) useWorkspace.getState().appendCellStdout(cell.id, kept.join('\n'))
      },
      onPlot: (plot) => {
        /* stream gnuplot captures into the cell live, while it runs */
        const s = useWorkspace.getState()
        const cur = s.cells.find((c) => c.id === cell.id)
        s.updateCell(cell.id, { plots: [...(cur?.plots ?? []), plot] })
        s.addLog('INFO', 'EVAL', `gnuplot intercepted — plot rendered in cell [${cell.n}]`, { cellRef: cell.n })
      },
    })
    .then((result) => {
      const s = useWorkspace.getState()
      if (result.plots && result.plots.length > 0) {
        /* cl-plot (save fig "name.png" …) — honor `set output` with an
         * automatic PNG download, still inside the user's click window */
        autoDownloadSavedPlots(result.plots, (msg) => s.addLog('WARN', 'EVAL', msg, { cellRef: cell.n }))
      }
      if (result.aborted) {
        s.updateCell(cell.id, { status: 'aborted', durationMs: result.durationMs, stdout: mergeStdout(cell.id, result.stdout), ...(result.plots ? { plots: result.plots } : {}) })
        s.addLog('WARN', 'EVAL', `Evaluation #${cell.n} aborted (worker restarted)`, { cellRef: cell.n })
      } else if (result.error) {
        s.updateCell(cell.id, {
          status: 'error',
          error: result.error,
          errorType: result.errorType,
          warnings: result.warnings,
          values: result.values,
          durationMs: result.durationMs,
          stdout: mergeStdout(cell.id, result.stdout),
          ...(result.plots ? { plots: result.plots } : {}),
        })
        s.addLog('ERROR', 'EVAL', `${result.errorType ?? 'ERROR'} — ${truncate(result.error, 120)} — see cell [${cell.n}]`, { cellRef: cell.n, details: result.error })
        result.warnings.forEach((w) => s.addLog('WARN', 'EVAL', w, { cellRef: cell.n }))
      } else {
        s.updateCell(cell.id, {
          status: 'done',
          values: result.values,
          warnings: result.warnings,
          durationMs: result.durationMs,
          stdout: mergeStdout(cell.id, result.stdout),
          ...(result.plots ? { plots: result.plots } : {}),
        })
        result.warnings.forEach((w) => s.addLog('WARN', 'EVAL', w, { cellRef: cell.n }))
      }
      s.addLog('DEBUG', 'EVAL', `eval #${cell.n} · ${truncate(firstSymbol(trimmed), 24)} · ${result.durationMs.toFixed(1)}ms`, {
        trace: { ms: result.durationMs, forms: truncate(firstSymbol(trimmed), 24) },
        cellRef: cell.n,
      })
      return useWorkspace.getState().cells.find((c) => c.id === cell.id) ?? cell
    })
    .catch((e: Error) => {
      const s = useWorkspace.getState()
      s.updateCell(cell.id, { status: 'error', error: e.message, errorType: 'RUNTIME-FAULT' })
      s.addLog('ERROR', 'WORKER', e.message, { cellRef: cell.n })
      return useWorkspace.getState().cells.find((c) => c.id === cell.id) ?? cell
    })
    .finally(() => {
      const s = useWorkspace.getState()
      const stillBusy = s.cells.some((c) => c.status === 'running' || c.status === 'queued')
      if (!stillBusy) s.setEvaluating(false)
    })
}

/** The cell's stdout may already contain streamed chunks — merge without duplicating. */
function mergeStdout(cellId: string, finalStdout: string): string {
  const cell = useWorkspace.getState().cells.find((c) => c.id === cellId)
  const streamed = cell?.stdout ?? ''
  if (!finalStdout) return streamed
  if (!streamed) return finalStdout
  if (finalStdout.startsWith(streamed)) return finalStdout
  return streamed // streaming already captured more (e.g. markers interleaved)
}

/** Evaluate every top-level form in a buffer, sequentially (one cell per form). */
export function evaluateAll(code: string, bufferName?: string): void {
  const forms = splitTopLevelForms(code)
  if (forms.length === 0) return
  for (const f of forms) void evaluateCode(f, bufferName)
}

/** Split source into top-level forms (strings/comments aware). */
export function splitTopLevelForms(src: string): string[] {
  const forms: string[] = []
  let depth = 0, start = -1, inStr = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === '"') inStr = false
      continue
    }
    if (c === ';') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '"') { inStr = true; if (depth === 0 && start < 0) start = i; continue }
    if (c === '#') {
      if (src[i + 1] === '|') { let d = 1; i += 2; while (i < src.length && d > 0) { if (src[i] === '#' && src[i + 1] === '|') { d++; i++ } else if (src[i] === '|' && src[i + 1] === '#') { d--; i++ } i++ } continue }
      if (src[i + 1] === '\\') {
        const tokStart = i
        i += 2
        if (i < src.length && /[A-Za-z0-9]/.test(src[i])) { while (i < src.length && /[A-Za-z0-9-]/.test(src[i])) i++; i-- }
        /* single-char literal like #\( : i points at it; loop advances past */
        if (depth === 0) forms.push(src.slice(tokStart, i + 1))
        continue
      }
    }
    if (c === '(') { if (depth === 0) start = i; depth++ }
    else if (c === ')') {
      depth--
      if (depth === 0 && start >= 0) { forms.push(src.slice(start, i + 1)); start = -1 }
    } else if (depth === 0 && !/\s/.test(c) && start < 0) {
      // atom at top level (e.g. a bare symbol or number)
      let j = i
      while (j < src.length && !/[\s()]/.test(src[j])) j++
      forms.push(src.slice(i, j))
      i = j - 1
    }
  }
  if (depth > 0 && start >= 0) forms.push(src.slice(start)) // unbalanced tail — send anyway, engine will complain
  return forms.filter((f) => f.trim().length > 0)
}

export function firstSymbol(code: string): string {
  const m = code.match(/^\s*\(\s*(?:[\w*+/<>=!?$%&.-]+:)?([\w*+/<>=!?$%&.-]+)/i)
  if (m) return m[1]
  return code.trim().slice(0, 24)
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
