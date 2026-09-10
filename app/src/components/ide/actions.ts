/* Global IDE actions shared by toolbar, palette, context menu and shortcuts. */

import type { EditorView } from '@codemirror/view'
import { toast } from 'sonner'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { useWorkspace } from '@/store/workspace'
import { useUi } from '@/store/ui'
import { useProject } from '@/store/project'
import { evaluateCode, evaluateAll, splitTopLevelForms, firstSymbol } from '@/store/evaluate'
import { runtime } from '@/lisp/runtime'
import { topLevelFormAt, innermostFormAt, findSymbolPosition } from './lisp-utils'
import { scanDefinitions } from '@/outline/outline'

/* ---- editor registry (set by EditorPanel) ---- */

let editorView: EditorView | null = null
export function registerEditor(view: EditorView | null) { editorView = view }
export function getEditor(): EditorView | null { return editorView }

function activeBuffer() {
  const s = useWorkspace.getState()
  return s.buffers.find((b) => b.id === s.activeBufferId) ?? null
}

/* ---- evaluation ---- */

export function evaluateFormAtPoint() {
  const view = editorView
  const buf = activeBuffer()
  if (!view || !buf) return
  const doc = view.state.doc.toString()
  const pos = view.state.selection.main.head
  const form = topLevelFormAt(doc, pos)
  const code = form ? doc.slice(form.from, form.to) : doc
  if (!code.trim()) return
  void evaluateCode(code, buf.name, { bufferId: buf.id, from: form ? form.from : 0 })
}

export function evaluateRegion() {
  const view = editorView
  const buf = activeBuffer()
  if (!view || !buf) return
  const sel = view.state.selection.main
  if (sel.empty) return evaluateFormAtPoint()
  const code = view.state.doc.sliceString(sel.from, sel.to)
  if (code.trim()) void evaluateCode(code, buf.name, { bufferId: buf.id, from: sel.from })
}

export function evaluateAllForms() {
  const buf = activeBuffer()
  if (!buf) return
  evaluateAll(buf.content, buf.name, { bufferId: buf.id, from: 0 })
}

export function macroexpandAtPoint() {
  const view = editorView
  const buf = activeBuffer()
  if (!view || !buf) return
  const doc = view.state.doc.toString()
  const pos = view.state.selection.main.head
  const form = innermostFormAt(doc, pos)
  if (!form) return
  const code = `(macroexpand-1 '${doc.slice(form.from, form.to)})`
  void evaluateCode(code, buf.name)
}

export async function interruptEvaluation() {
  const s = useWorkspace.getState()
  s.addLog('WARN', 'WORKER', 'Interrupt requested — restarting runtime worker')
  await runtime.interrupt()
  useWorkspace.getState().addLog('INFO', 'WORKER', 'Worker restarted after interrupt; pending evals aborted')
  offerReplay('Interrupted — the image was restarted, definitions are gone')
}

export async function restartRuntime() {
  const s = useWorkspace.getState()
  s.addLog('INFO', 'RUNTIME', 'Restarting Lisp image…')
  await runtime.restart()
  const st = useWorkspace.getState()
  st.addLog('INFO', 'RUNTIME', `Runtime restarted (${st.engineLabel}) — definitions cleared`)
  offerReplay('Runtime restarted — definitions cleared')
}

/* ---- debugger ---- */

/** Answer a paused cell: invoke restart `index`, optionally with a value form. */
export function chooseRestart(cellId: string, index: number, value?: string) {
  const ws = useWorkspace.getState()
  const cell = ws.cells.find((c) => c.id === cellId)
  if (!cell || cell.status !== 'paused' || !cell.debug) return
  const restart = cell.debug.restarts.find((r) => r.index === index)
  const name = index < 0 ? 'DECLINE' : (restart?.name ?? `#${index}`)
  if (!runtime.chooseRestart(cell.debug.jobId, index, value)) {
    toast('The paused job is gone — the runtime was restarted')
    return
  }
  ws.updateCell(cellId, { status: 'running', startedAt: Date.now(), debug: undefined })
  ws.addLog('INFO', 'EVAL', `cell [${cell.n}] → ${name}${value?.trim() ? ` ${value.trim()}` : ''}`, { cellRef: cell.n })
}

/** Answer a cell blocked on standard input with one line (null = end of file).
 * The line is echoed into the cell's OUT well, like a terminal would. */
export function provideInput(cellId: string, text: string | null) {
  const ws = useWorkspace.getState()
  const cell = ws.cells.find((c) => c.id === cellId)
  if (!cell || cell.status !== 'input' || !cell.inputRequest) return
  if (!runtime.provideInput(cell.inputRequest.jobId, text)) {
    toast('The waiting job is gone — the runtime was restarted')
    return
  }
  ws.updateCell(cellId, { status: 'running', inputRequest: undefined })
  ws.appendCellStdout(cellId, text == null ? '^D' : text)
  ws.addLog('DEBUG', 'EVAL', `cell [${cell.n}] stdin ← ${text == null ? 'end of file' : JSON.stringify(text)}`, { cellRef: cell.n })
}

/* ---- session replay ---- */

const DEFINING_HEAD = /^(def[\w-]*|in-package|declaim|proclaim|require|use-package|import|export)$/i

/** The defining forms of the session, in order: what a fresh image needs
 * to get back to where the user was after an interrupt/restart. */
export function definingForms(): { code: string; bufferName?: string }[] {
  const out: { code: string; bufferName?: string }[] = []
  for (const cell of useWorkspace.getState().cells) {
    if (cell.kind === 'project' || cell.status !== 'done') continue
    for (const form of splitTopLevelForms(cell.input)) {
      if (DEFINING_HEAD.test(firstSymbol(form))) out.push({ code: form, bufferName: cell.bufferName })
    }
  }
  return out
}

/** Re-evaluate every defining form from the session cells, in order. */
export function replayDefinitions() {
  const forms = definingForms()
  if (forms.length === 0) { toast('Nothing to replay — no defining forms in this session'); return }
  useWorkspace.getState().addLog('INFO', 'EVAL', `Replaying ${forms.length} defining form${forms.length === 1 ? '' : 's'} from the session`)
  for (const f of forms) void evaluateCode(f.code, f.bufferName)
  toast(`Replaying ${forms.length} definition${forms.length === 1 ? '' : 's'}`)
}

function offerReplay(message: string) {
  const n = definingForms().length
  if (n === 0) { toast(message); return }
  toast(message, {
    duration: 8000,
    action: { label: `Replay ${n} definition${n === 1 ? '' : 's'}`, onClick: replayDefinitions },
  })
}

/** Toolbar package pill: switch the reader package of the live image. */
export async function switchPackage(name: string) {
  const ws = useWorkspace.getState()
  const result = await runtime.setPackage(name)
  const s = useWorkspace.getState()
  if (result.error) {
    s.addLog('WARN', 'EVAL', `Cannot switch reader package to ${name}: ${result.error}`)
    toast(`Package ${name} does not exist in the image — (defpackage …) it first`)
  }
  /* the image reports the package actually in effect; trust it over the click */
  const effective = result.package ?? ws.packageName
  if (effective !== ws.packageName) {
    s.setPackageName(effective)
    s.addLog('DEBUG', 'UI', `Reader package → ${effective}`)
  }
}

/* ---- buffers ---- */

export function newBuffer() {
  useWorkspace.getState().newBuffer()
}

/** Ctrl+S: write dirty project buffers to disk / virtual FS, then flush
 * the workspace (scratch buffers) to IndexedDB — Save All. With the
 * "auto-eval on save" setting, every form of the active buffer is then
 * evaluated (one cell per form). */
export function saveBuffers() {
  void useProject.getState().saveAllDirty().then(() => {
    useWorkspace.getState().markSaved()
  })
  const ws = useWorkspace.getState()
  ws.addLog('DEBUG', 'STORAGE', 'Buffers saved (project files + IndexedDB flush)')
  if (ws.settings.autoEvalOnSave) {
    const buf = activeBuffer()
    if (buf && buf.content.trim()) {
      ws.addLog('DEBUG', 'EVAL', `auto-eval on save — ${buf.name}`)
      evaluateAll(buf.content, buf.name)
    }
  }
}

/** Close a buffer; dirty project buffers get a save/discard confirmation. */
export function requestCloseBuffer(id: string) {
  const ws = useWorkspace.getState()
  const buf = ws.buffers.find((b) => b.id === id)
  if (buf?.dirty && buf.origin?.type === 'project') {
    useUi.getState().setConfirmCloseBuffer(id)
    return
  }
  ws.closeBuffer(id)
}

export function clearSession() {
  useWorkspace.getState().clearCells()
  useWorkspace.getState().addLog('INFO', 'UI', 'Session cells cleared')
}

/* ---- sharing ---- */

export function buildShareUrl(): string {
  const buf = activeBuffer()
  const payload = JSON.stringify({ name: buf?.name ?? 'untitled.lisp', code: buf?.content ?? '' })
  return `${window.location.origin}/ide#s=${compressToEncodedURIComponent(payload)}`
}

export function decodeShareHash(hash: string): { name: string; code: string } | null {
  const m = hash.match(/#s=(.+)$/)
  if (!m) return null
  try {
    const json = decompressFromEncodedURIComponent(m[1])
    if (!json) return null
    const parsed = JSON.parse(json)
    if (typeof parsed.code === 'string') return { name: String(parsed.name ?? 'shared.lisp'), code: parsed.code }
  } catch { /* fallthrough */ }
  return null
}

export async function shareWorkspace() {
  const url = buildShareUrl()
  useUi.getState().setShareUrl(url)
  try {
    await navigator.clipboard.writeText(url)
    toast('Share link copied — code travels in the URL, nothing is uploaded.')
  } catch {
    toast('Clipboard blocked by browser — copy the link from the dialog')
  }
}

/* ---- clipboard helpers ---- */

export async function copyText(text: string, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
    toast(what)
  } catch {
    toast('Clipboard blocked by browser — use Ctrl+C')
  }
}

export async function pasteIntoEditor() {
  const view = editorView
  if (!view) return
  try {
    const text = await navigator.clipboard.readText()
    if (!text) { toast('Clipboard is empty'); return }
    const pos = view.state.selection.main.head
    view.dispatch({
      changes: { from: pos, insert: (pos > 0 && view.state.doc.sliceString(pos - 1, pos) !== '\n' ? '\n' : '') + text },
      selection: { anchor: pos + text.length + 1 },
    })
    view.focus()
    toast('Pasted into editor')
  } catch {
    toast('Clipboard blocked by browser — use Ctrl+V in the editor')
  }
}

/* ---- examples (data owned by another agent; imported dynamically) ---- */

export interface ExampleItem {
  slug: string
  title: string
  category: string
  difficulty: 1 | 2 | 3
  description: string
  code: string
  expectedOutput?: string
}

let examplesCache: ExampleItem[] | null = null

export async function loadExamples(): Promise<ExampleItem[]> {
  if (examplesCache) return examplesCache
  try {
    /* src/data/examples is owned by another agent. import.meta.glob keeps this
     * branch compiling standalone (empty map when the file is absent) and picks
     * the module up automatically in the merged build. */
    const loaders = Object.values(import.meta.glob<{ EXAMPLES?: unknown }>('@/data/examples.ts'))
    const mod = loaders.length ? await loaders[0]() : null
    const list = mod?.EXAMPLES
    examplesCache = Array.isArray(list) ? (list as ExampleItem[]) : []
  } catch {
    examplesCache = []
  }
  return examplesCache
}

export function loadExampleIntoBuffer(ex: ExampleItem) {
  const s = useWorkspace.getState()
  const existing = s.buffers.find((b) => b.name === `${ex.slug}.lisp`)
  if (existing) s.setActiveBuffer(existing.id)
  else s.newBuffer(`${ex.slug}.lisp`, ex.code)
  toast(`Loaded example: ${ex.slug}`)
}

/** Focus helper for palette commands. */
export function focusEditor() {
  editorView?.focus()
}

/* ---- caret navigation (used by session cells, context menu, keymap) ---- */

/** Jump the editor caret to a 1-based line/col and flash the line. */
export function jumpToPosition(line: number, col: number) {
  const v = editorView
  if (!v) return
  const l = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines)))
  const pos = Math.min(l.from + Math.max(0, col - 1), l.to)
  v.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
  v.focus()
  requestAnimationFrame(() => {
    const el = v.dom.querySelector('.cm-activeLine') as HTMLElement | null
    if (el) {
      el.style.transition = 'none'
      el.style.backgroundColor = 'rgba(110,168,220,0.28)'
      requestAnimationFrame(() => {
        el.style.transition = 'background-color 600ms ease'
        el.style.backgroundColor = ''
      })
    }
  })
}

/* ---- go to definition (Sprint 6) ---- */

const SYMBOL_CHAR = /[\w*+/<>=!?$%&.:-]/

/** The symbol under `pos` in `doc` (package prefix and quote stripped), or null. */
export function symbolAtOffset(doc: string, pos: number): string | null {
  let a = pos, b = pos
  while (a > 0 && SYMBOL_CHAR.test(doc[a - 1])) a--
  while (b < doc.length && SYMBOL_CHAR.test(doc[b])) b++
  const raw = doc.slice(a, b).replace(/^[#']+/, '')
  if (!raw || /^[\d.+-]+$/.test(raw) || raw.startsWith(':')) return null
  return raw.replace(/^[^:]+::?/, '')
}

/** The symbol under the editor caret, or null. */
export function symbolAtPoint(): string | null {
  const v = editorView
  if (!v) return null
  return symbolAtOffset(v.state.doc.toString(), v.state.selection.main.head)
}

/** Open a project file and put the caret on line/col (flashing the line). */
export function gotoLocation(path: string, line: number, col = 1) {
  const ws = useWorkspace.getState()
  const already = ws.buffers.find((b) => b.origin?.type === 'project' && b.origin.path === path)
  const jump = () => setTimeout(() => jumpToPosition(line, col), already && already.id === ws.activeBufferId ? 0 : 40)
  if (already) { ws.setActiveBuffer(already.id); jump(); return }
  void useProject.getState().openFile(path).then(jump)
}

/**
 * Jump to where `name` (default: the symbol at point) is defined: project
 * definitions reported by the last Load Project first, then a defining
 * form in any open buffer, else a toast.
 */
/** Activate an open buffer and put the caret at line/col. */
export function gotoBuffer(bufferId: string, line: number, col = 1) {
  const ws = useWorkspace.getState()
  if (!ws.buffers.some((b) => b.id === bufferId)) return
  const switching = bufferId !== ws.activeBufferId
  if (switching) ws.setActiveBuffer(bufferId)
  setTimeout(() => jumpToPosition(line, col), switching ? 40 : 0)
}

export function gotoDefinition(name?: string) {
  const sym = name ?? symbolAtPoint()
  if (!sym) { toast('No symbol at point'); return }
  const key = sym.toUpperCase()
  const ws = useWorkspace.getState()
  /* most recent evaluation of the name wins over the last project load */
  const bdef = useProject.getState().bufferDefinitions.find((d) => d.name === key && (d.cellN != null ? ws.cells.some((c) => c.n === d.cellN) : ws.buffers.some((b) => b.id === d.bufferId)))
  if (bdef) {
    if (bdef.cellN != null) {
      ws.addLog('DEBUG', 'UI', `go to definition: ${sym} → session cell [${bdef.cellN}] (${bdef.kind}, evaluated)`)
      window.dispatchEvent(new CustomEvent('conscell:goto-cell', { detail: bdef.cellN }))
      return
    }
    /* freshness (Sprint 12): the entry says where the name was evaluated; the buffer may have moved on */
    const home = ws.buffers.find((b) => b.id === bdef.bufferId)
    const fresh = home ? scanDefinitions(home.content).find((e) => e.name === key) : undefined
    if (fresh) {
      const moved = fresh.line !== bdef.line || fresh.col !== bdef.col
      if (moved) useProject.getState().recordBufferDefinition({ ...bdef, line: fresh.line, col: fresh.col })
      ws.addLog('DEBUG', 'UI', `go to definition: ${sym} → ${bdef.bufferName}:${fresh.line} (${bdef.kind}, evaluated${moved ? `, was line ${bdef.line}` : ''})`)
      gotoBuffer(bdef.bufferId, fresh.line, fresh.col)
      return
    }
    /* gone from that buffer: forget the entry and fall through to the project index and the text scan */
    useProject.getState().forgetBufferDefinition(bdef.name)
  }
  const def = useProject.getState().definitions.find((d) => d.name === key)
  if (def) {
    ws.addLog('DEBUG', 'UI', `go to definition: ${sym} → ${def.path}:${def.line} (${def.kind})`)
    gotoLocation(def.path, def.line, def.col)
    return
  }
  /* open buffers: the active one first */
  const ordered = [...ws.buffers].sort((a, b) => (a.id === ws.activeBufferId ? -1 : b.id === ws.activeBufferId ? 1 : 0))
  for (const b of ordered) {
    const pos = findSymbolPosition(b.content, sym)
    if (pos) {
      if (b.id !== ws.activeBufferId) ws.setActiveBuffer(b.id)
      setTimeout(() => jumpToPosition(pos.line, pos.col), b.id === ws.activeBufferId ? 0 : 40)
      ws.addLog('DEBUG', 'UI', `go to definition: ${sym} → ${b.name}:${pos.line}`)
      return
    }
  }
  toast(`No definition of ${sym} in the loaded project or open buffers`)
}

/** Select the innermost form around the caret; repeat to grow outwards. */
export function selectEnclosingForm() {
  const v = editorView
  if (!v) return
  const doc = v.state.doc.toString()
  const sel = v.state.selection.main
  // grow: if a form is already fully selected, expand around it
  const probe = sel.empty ? sel.head : Math.max(0, sel.from - 1)
  const form = innermostFormAt(doc, probe)
  if (form) v.dispatch({ selection: { anchor: form.from, head: form.to } })
}

/* ---- session export (Sprint 8) ---- */

function downloadText(text: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function engineLabel(): string | undefined {
  switch (useWorkspace.getState().engineStatus) {
    case 'ready-ecl': return 'ECL 24.5 (WECL, in-browser)'
    case 'ready-jscl': return 'JSCL (fallback)'
    case 'ready-mock': return 'mock interpreter (fallback)'
    default: return undefined
  }
}

/** Download the session as a Markdown notebook (plots inline as SVG) or a `.lisp` transcript that evaluates as is. */
export async function exportSession(format: 'md' | 'lisp') {
  const cells = useWorkspace.getState().cells
  if (!cells.length) { toast('Nothing to export — the session is empty'); return }
  const { buildMarkdownTranscript, buildLispTranscript, transcriptFileName } = await import('@/session/transcript')
  const meta = { engine: engineLabel(), exportedAt: new Date(), valueLimit: useWorkspace.getState().settings.transcriptValueLimit || 0 }
  const text = format === 'md' ? buildMarkdownTranscript(cells, meta) : buildLispTranscript(cells, meta)
  const name = transcriptFileName(format, meta.exportedAt)
  downloadText(text, name, format === 'md' ? 'text/markdown;charset=utf-8' : 'text/x-common-lisp;charset=utf-8')
  const plots = cells.reduce((n, c) => n + (c.plots?.length ?? 0), 0)
  useWorkspace.getState().addLog('INFO', 'UI', `Exported ${cells.length} cells${plots ? ` and ${plots} plot${plots === 1 ? '' : 's'}` : ''} to ${name}`)
  toast(`Saved ${name}`)
}

/* ---- find references (Sprint 10) ---- */

/** Shift+F12: search the workspace for the symbol at point — whole symbol, code only. */
export function findReferences(name?: string) {
  const sym = name ?? symbolAtPoint()
  if (!sym) { toast('No symbol at point'); return }
  useUi.getState().openSearch({ query: sym, opts: { wholeWord: true, symbolsOnly: true, regex: false, caseSensitive: false } })
  useWorkspace.getState().addLog('DEBUG', 'UI', `find references: ${sym}`)
}

/* ---- transcript import (Sprint 10) ---- */

/** cells parsed for a "replace session" import, waiting for the confirm modal (Sprint 16) */
let pendingImport: { name: string; cells: import('@/session/transcript').ImportedCell[] } | null = null
export function pendingImportCount(): number { return pendingImport?.cells.length ?? 0 }
/** first lines of the first few inputs of a pending import, for the confirm modal */
export function pendingImportPreview(max = 3): string[] {
  return (pendingImport?.cells ?? []).filter((c) => c.input.trim()).slice(0, max).map((c) => c.input.split('\n')[0].slice(0, 60))
}

function appendImportedCells(name: string, cells: import('@/session/transcript').ImportedCell[]) {
  const ws = useWorkspace.getState()
  for (const c of cells) {
    ws.addCell({
      input: c.input, pkg: c.pkg, status: c.status, stdout: c.stdout, values: c.values, warnings: c.warnings,
      error: c.error, errorType: c.errorType, resumedVia: c.resumedVia, durationMs: c.durationMs,
      startedAt: Date.now(), restartsUsed: c.resumedVia ? 1 : 0, imported: true,
      ...(c.kind === 'project' && c.project ? { kind: 'project' as const, project: { projectName: c.project.projectName, files: c.project.files, packages: [] } } : {}),
    })
  }
  ws.addLog('INFO', 'UI', `Imported ${cells.length} cells from ${name}`)
  toast(`Imported ${cells.length} cell${cells.length === 1 ? '' : 's'} from ${name}`)
}

/** Confirmed "replace session" import: clear, then append the parsed cells. */
export async function applyPendingImport() {
  const p = pendingImport
  pendingImport = null
  if (!p) return
  useWorkspace.getState().clearCells()
  appendImportedCells(p.name, p.cells)
}

/** Append the cells of a Markdown transcript to the session (or, with mode 'replace', ask to clear it first); a .lisp transcript opens as a buffer. */
export async function importTranscriptText(name: string, text: string, mode: 'append' | 'replace' = 'append'): Promise<number> {
  const ws = useWorkspace.getState()
  /* by extension, or by content when the file has none (a browser download, a paste) */
  const isMarkdown = /\.(md|markdown)$/i.test(name) || (!/\.(lisp|lsp|cl)$/i.test(name) && /^## Cell \d+ · /m.test(text))
  if (!isMarkdown) {
    ws.newBuffer(name.replace(/[^\w.-]+/g, '_') || 'transcript.lisp', text)
    toast(`Opened ${name} as a buffer`)
    return 0
  }
  const { parseMarkdownTranscript } = await import('@/session/transcript')
  const cells = parseMarkdownTranscript(text)
  if (!cells.length) { toast(`No cells found in ${name} — is it a ConsCell transcript?`); return 0 }
  if (mode === 'replace' && ws.cells.length > 0) {
    pendingImport = { name, cells }
    useUi.getState().setConfirm('import-replace')
    return cells.length
  }
  appendImportedCells(name, cells)
  return cells.length
}

/** Palette: pick a .md / .lisp transcript from disk. */
export function importTranscriptFile(mode: 'append' | 'replace' = 'append') {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.md,.markdown,.lisp,.lsp,.cl,text/markdown'
  input.style.display = 'none'
  input.onchange = () => {
    const f = input.files?.[0]
    input.remove()
    if (!f) return
    void f.text().then((t) => importTranscriptText(f.name, t, mode))
  }
  /* attached while open: some browsers ignore clicks on detached file inputs */
  document.body.appendChild(input)
  input.click()
}

/* ---- session cell → buffer (Sprint 16) ---- */

/** Open a cell's input as a buffer named after the cell (linked both ways) and activate it; a linked buffer that still exists is just activated. */
export function openCellAsBuffer(cell: { id: string; n: number; input: string; bufferId?: string }) {
  const ws = useWorkspace.getState()
  const linked = cell.bufferId ? ws.buffers.find((b) => b.id === cell.bufferId) : undefined
  if (linked) { ws.setActiveBuffer(linked.id); return }
  const name = `cell-${cell.n}.lisp`
  const id = ws.newBuffer(name, cell.input.endsWith('\n') ? cell.input : cell.input + '\n', { type: 'cell', cellId: cell.id, n: cell.n })
  ws.updateCell(cell.id, { bufferId: id })
  ws.addLog('DEBUG', 'UI', `opened cell [${cell.n}] as buffer ${name}`)
}

/** Re-run a cell: a linked buffer's current text (as an evaluation from that buffer), else the recorded input. */
export function rerunCell(cell: { id: string; n: number; input: string; bufferName?: string; bufferId?: string }) {
  const ws = useWorkspace.getState()
  const linked = cell.bufferId ? ws.buffers.find((b) => b.id === cell.bufferId) : undefined
  if (linked) { void evaluateCode(linked.content, linked.name, { bufferId: linked.id, from: 0 }); return }
  void evaluateCode(cell.input, cell.bufferName)
}
