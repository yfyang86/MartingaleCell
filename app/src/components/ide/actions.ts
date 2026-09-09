/* Global IDE actions shared by toolbar, palette, context menu and shortcuts. */

import type { EditorView } from '@codemirror/view'
import { toast } from 'sonner'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { useWorkspace } from '@/store/workspace'
import { useUi } from '@/store/ui'
import { useProject } from '@/store/project'
import { evaluateCode, evaluateAll } from '@/store/evaluate'
import { runtime } from '@/lisp/runtime'
import { topLevelFormAt, innermostFormAt } from './lisp-utils'

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
  void evaluateCode(code, buf.name)
}

export function evaluateRegion() {
  const view = editorView
  const buf = activeBuffer()
  if (!view || !buf) return
  const sel = view.state.selection.main
  if (sel.empty) return evaluateFormAtPoint()
  const code = view.state.doc.sliceString(sel.from, sel.to)
  if (code.trim()) void evaluateCode(code, buf.name)
}

export function evaluateAllForms() {
  const buf = activeBuffer()
  if (!buf) return
  evaluateAll(buf.content, buf.name)
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
}

export async function restartRuntime() {
  const s = useWorkspace.getState()
  s.addLog('INFO', 'RUNTIME', 'Restarting Lisp image…')
  await runtime.restart()
  const st = useWorkspace.getState()
  st.addLog('INFO', 'RUNTIME', `Runtime restarted (${st.engineLabel}) — definitions cleared`)
  toast('Runtime restarted — definitions cleared')
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
 * the workspace (scratch buffers) to IndexedDB — Save All. */
export function saveBuffers() {
  void useProject.getState().saveAllDirty().then(() => {
    useWorkspace.getState().markSaved()
  })
  useWorkspace.getState().addLog('DEBUG', 'STORAGE', 'Buffers saved (project files + IndexedDB flush)')
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
