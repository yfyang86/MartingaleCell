/* Evaluation orchestration: runtime ↔ cells ↔ logs. */

import { runtime } from '@/lisp/runtime'
import { useProject } from '@/store/project'
import { registerProjectDefinitions } from '@/components/ide/completion'
import { useWorkspace, type Cell } from './workspace'
import { autoDownloadSavedPlots } from '@/plot/download'

/** Engine protocol markers (`;;=>` values, `;;WARNING:`/`;;ERROR:`, the
 * `;;PLOT64` gnuplot capture channel and the `;;PACKAGE:` reader-package
 * report) have their own dedicated UI — they must never appear in the OUT well. */
export const OUT_MARKER_RE = /^;;(?:=>|WARNING:|ERROR:|ERRTYPE:|DETAIL:|FRAME:|PLOT64|PACKAGE:|DEF:)/

/** Drop engine protocol marker lines from captured stdout. */
export function stripOutMarkers(stdout: string): string {
  if (!stdout) return ''
  return stdout
    .split('\n')
    .filter((l) => !OUT_MARKER_RE.test(l.trimStart()))
    .join('\n')
}

/** A cell that still occupies the (serialized) runtime: queued, running, or paused in the debugger. */
export function isBusy(c: Cell): boolean {
  return c.status === 'running' || c.status === 'queued' || c.status === 'paused' || c.status === 'input'
}

/** Evaluate a code string; appends a cell and mirrors warnings/errors into the log. */
/** Where a piece of code came from, so evaluated definitions get buffer positions. */
export interface EvalOrigin {
  /** the buffer the code came from; empty for the session box */
  bufferId: string
  /** character offset of `code` within the buffer */
  from: number
  /** the code was typed into the session box — definitions point at the cell */
  session?: boolean
}

/** byte offset (UTF-8) within `text` → character index */
export function byteToCharOffset(text: string, byteOffset: number): number {
  let bytes = 0, i = 0
  for (const ch of text) {
    if (bytes >= byteOffset) break
    const cp = ch.codePointAt(0) ?? 0
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
    i += ch.length
  }
  return i
}

export function charOffsetToLineCol(content: string, offset: number): { line: number; col: number } {
  let line = 1, col = 1
  const end = Math.min(offset, content.length)
  for (let i = 0; i < end; i++) {
    if (content[i] === '\n') { line++; col = 1 } else col++
  }
  return { line, col }
}

export function evaluateCode(code: string, bufferName?: string, origin?: EvalOrigin): Promise<Cell> {
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
  const pending = useWorkspace.getState().cells.some((c) => c.id !== cell.id && isBusy(c))
  if (pending) store.updateCell(cell.id, { status: 'queued' })

  useWorkspace.getState().setEvaluating(true)

  return runtime
    .eval(trimmed, {
      onStart: () => {
        const s = useWorkspace.getState()
        s.updateCell(cell.id, { status: 'running', startedAt: Date.now() })
        s.setEvaluating(true)
      },
      onStream: (chunk, isErr) => {
        const kept = chunk.split('\n').filter((l) => !OUT_MARKER_RE.test(l.trimStart()))
        if (kept.length > 0) useWorkspace.getState().appendCellStdout(cell.id, kept.join('\n'))
        /* verbosity "verbose": mirror engine stderr noise into the log too */
        if (isErr && kept.length > 0 && useWorkspace.getState().settings.verbosity === 'verbose') {
          useWorkspace.getState().addLog('DEBUG', 'RUNTIME', kept.join(' '), { cellRef: cell.n })
        }
      },
      onPlot: (plot) => {
        /* stream gnuplot captures into the cell live, while it runs */
        const s = useWorkspace.getState()
        const cur = s.cells.find((c) => c.id === cell.id)
        s.updateCell(cell.id, { plots: [...(cur?.plots ?? []), plot] })
        s.addLog('INFO', 'EVAL', `gnuplot intercepted — plot rendered in cell [${cell.n}]`, { cellRef: cell.n })
      },
      onDebug: (pause) => {
        /* the image is suspended inside the handler — show the live restarts */
        const s = useWorkspace.getState()
        s.updateCell(cell.id, { status: 'paused', debug: pause, errorType: pause.errorType, frames: pause.frames })
        s.addLog('WARN', 'EVAL', `${pause.errorType ?? 'ERROR'} — paused in debugger — ${truncate(pause.condition, 100)} — cell [${cell.n}]`, {
          cellRef: cell.n,
          details: `${pause.condition}\n\nrestarts:\n  ${pause.restarts.map((r) => `[${r.index}] ${r.name} — ${r.report}`).join('\n  ')}`,
        })
      },
      onDebugNote: (message) => {
        const s = useWorkspace.getState()
        s.appendCellStdout(cell.id, `; debugger: ${message}`)
        s.addLog('WARN', 'EVAL', `debugger: ${message}`, { cellRef: cell.n })
      },
      onInputRequest: (req) => {
        /* (read-line) & co.: the image is suspended until the cell answers */
        const s = useWorkspace.getState()
        s.updateCell(cell.id, { status: 'input', inputRequest: req })
        s.addLog('INFO', 'EVAL', `cell [${cell.n}] is waiting for standard input`, { cellRef: cell.n })
      },
      onDefinition: (d) => {
        /* ;;DEF: path|offset|NAME|kind — offset is a byte offset into `trimmed` */
        if (!origin) return
        const ws = useWorkspace.getState()
        if (origin.session) {
          useProject.getState().recordBufferDefinition({ name: d.name, kind: d.defKind, bufferId: '', bufferName: 'session', line: cell.n, col: 1, cellN: cell.n })
          registerProjectDefinitions(useProject.getState().definitionsForCompletion())
          return
        }
        if (!bufferName) return
        const buf = ws.buffers.find((b) => b.id === origin.bufferId)
        if (!buf) return
        const charOff = origin.from + code.indexOf(trimmed) + byteToCharOffset(trimmed, d.offset)
        const { line, col } = charOffsetToLineCol(buf.content, charOff)
        useProject.getState().recordBufferDefinition({ name: d.name, kind: d.defKind, bufferId: buf.id, bufferName: buf.name, line, col })
        registerProjectDefinitions(useProject.getState().definitionsForCompletion())
      },
    }, { compile: store.settings.evalMode === 'compile', debug: store.settings.debugOnError, ...(origin?.session ? { path: 'session' } : origin && bufferName ? { path: bufferName } : {}) })
    .then((result) => {
      const s = useWorkspace.getState()
      /* the resolution line: which restart brought the job back */
      if (result.restartUsed) {
        const cur = s.cells.find((c) => c.id === cell.id)
        s.updateCell(cell.id, { resumedVia: result.restartUsed, restartsUsed: (cur?.restartsUsed ?? 0) + 1, debug: undefined })
      }
      /* (in-package …) persists in the image — mirror it into the pill/prompt */
      if (result.package && result.package !== s.packageName) {
        s.setPackageName(result.package)
        s.addLog('DEBUG', 'EVAL', `reader package → ${result.package}`, { cellRef: cell.n })
      }
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
          frames: result.frames,
          details: result.details,
          warnings: result.warnings,
          values: result.values,
          durationMs: result.durationMs,
          stdout: mergeStdout(cell.id, result.stdout),
          ...(result.plots ? { plots: result.plots } : {}),
        })
        s.addLog('ERROR', 'EVAL', `${result.errorType ?? 'ERROR'} — ${truncate(result.error, 120)} — see cell [${cell.n}]`, {
          cellRef: cell.n,
          details: result.frames?.length ? `${result.error}\n\nframes (innermost first):\n  ${result.frames.join('\n  ')}` : result.error,
        })
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
      if (!s.cells.some(isBusy)) s.setEvaluating(false)
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
export function evaluateAll(code: string, bufferName?: string, origin?: EvalOrigin): void {
  const forms = splitTopLevelForms(code)
  if (forms.length === 0) return
  let cursor = 0
  for (const f of forms) {
    const at = code.indexOf(f, cursor)
    const from = at === -1 ? cursor : at
    cursor = from + f.length
    void evaluateCode(f, bufferName, origin ? { bufferId: origin.bufferId, from: origin.from + from } : undefined)
  }
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
