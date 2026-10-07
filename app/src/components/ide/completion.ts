/* Autocomplete source for Common Lisp.
 *
 * What makes it "smart":
 *  - context-aware: right after '(' only callables are offered (head
 *    position); in argument position everything is; after #' functions
 *    and macros; after a package prefix (foo:) only that package's
 *    external symbols, completed with the prefix; after a lone ':' the
 *    keywords seen in the buffer and the known lambda-list keywords.
 *  - live image: on engine-ready the external symbols of COMMON-LISP
 *    (and their kinds — macro/function/special/class) are dumped from
 *    the running image, so the full ~800-symbol alphabet is offered,
 *    not a curated subset; the curated entries keep their docs/arglists
 *    and merge over the live ones.
 *  - locals: let / let* / lambda / defun parameters of the enclosing
 *    top-level form, offered in argument position.
 *  - ranked: exact prefix > word-start > substring > subsequence, with
 *    boosts for symbols already used in the buffer and project symbols;
 *    matches are sorted by score, not alphabetically-first.
 */

import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { CL_SYMBOLS, lookupSymbol } from '@/lisp/symbols'

const KIND_TO_TYPE: Record<string, string> = {
  fn: 'function',
  macro: 'macro',
  var: 'variable',
  class: 'class',
  const: 'constant',
}

function docNode(name: string): Node | null {
  const sym = lookupSymbol(name)
  if (!sym || typeof document === 'undefined') return null
  const el = document.createElement('div')
  const head = document.createElement('div')
  head.style.cssText = 'color:var(--steel-bright);font-weight:600;margin-bottom:4px'
  head.textContent = sym.name.toUpperCase() + (sym.arglist ? '  ' : '')
  if (sym.arglist) {
    const args = document.createElement('span')
    args.style.cssText = 'color:var(--text-secondary);font-weight:400'
    args.textContent = sym.arglist
    head.appendChild(args)
  }
  const kind = document.createElement('div')
  kind.style.cssText = 'color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px'
  kind.textContent = { fn: 'function', macro: 'macro', var: 'special variable', class: 'type / class', const: 'constant' }[sym.kind] ?? sym.kind
  const body = document.createElement('div')
  body.style.cssText = 'color:var(--text-secondary)'
  body.textContent = sym.doc
  const pkg = document.createElement('div')
  pkg.style.cssText = 'color:var(--text-muted);margin-top:6px;font-size:10px'
  pkg.textContent = 'COMMON-LISP'
  el.append(head, kind, body, pkg)
  return el
}

const coreCompletions: Completion[] = CL_SYMBOLS.map((s) => ({
  label: s.name,
  type: KIND_TO_TYPE[s.kind],
  detail: s.arglist.length > 42 ? s.arglist.slice(0, 42) + '…' : s.arglist,
  info: () => docNode(s.name),
}))

/* ---- live symbols from the running image ---- */

export type LiveKind = 'macro' | 'function' | 'variable' | 'class' | 'other'

let liveCompletions: Completion[] = []
/** name (lowercase) → kind, for context filtering */
const liveKinds = new Map<string, LiveKind>()

const LIVE_KIND_BY_CODE: Record<number, LiveKind> = { 1: 'macro', 0: 'function', 2: 'variable', 3: 'class', 4: 'other' }

/** Parse the printed ((NAME kind-code) …) dump of the image. */
export function parseSymbolDump(printed: string): { name: string; kind: LiveKind }[] {
  const out: { name: string; kind: LiveKind }[] = []
  const re = /\(([A-Z0-9*+/<>=!?$%&.:-]+)\s+(\d)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(printed))) out.push({ name: m[1].toLowerCase(), kind: LIVE_KIND_BY_CODE[Number(m[2])] ?? 'other' })
  return out
}

export function registerLiveSymbols(dump: { name: string; kind: LiveKind }[]): void {
  const curated = new Set(CL_SYMBOLS.map((s) => s.name))
  const merged: Completion[] = []
  for (const d of dump) {
    liveKinds.set(d.name, d.kind)
    if (curated.has(d.name)) continue /* the curated entry has docs */
    const qualified = d.name.includes(':')
    merged.push({
      label: d.name,
      type: KIND_TO_TYPE[d.kind === 'other' ? 'fn' : d.kind],
      detail: qualified ? `${d.name.slice(0, d.name.indexOf(':')).toUpperCase()} · live image` : 'CL · live image',
    })
  }
  /* Sprint 35: the curated list is always offered in full — a symbol in both
   * the dump and the curated list keeps its documented entry (skipped above),
   * one only in the curated list keeps it too. */
  merged.push(...coreCompletions)
  liveCompletions = merged
}

/** The completions offered from the live image (tests). */
export function liveCompletionLabels(): string[] {
  return liveCompletions.map((c) => c.label)
}

/** The form dumped by dumpCoreSymbolsForm, for hidden evaluation. */
export const dumpCoreSymbolsForm =
  '(let ((*print-length* nil) (*print-level* nil) (*print-pretty* nil))' +
  '  (loop for pkg in (list "COMMON-LISP" "SB-MOP")' +
  '        when (find-package pkg)' +
  '        append (loop for s being each external-symbol (find-package pkg)' +
  '                     collect (list (if (string= pkg "COMMON-LISP")' +
  '                                      (symbol-name s)' +
  `                                      (concatenate 'string pkg ":" (symbol-name s)))` +
  '                                   (cond ((macro-function s) 1)' +
  '                                         ((fboundp s) 0)' +
  '                                         ((find-class s nil) 3)' +
  '                                         ((boundp s) 2)' +
  '                                         (t 4))))))'

/** Whether the live dump has run (first completion can trigger it lazily). */
export function haveLiveSymbols(): boolean {
  return liveKinds.size > 0
}

/* ---- project symbols (merged after "Load Project into Runtime") ---- */

export interface ProjectPackageSymbols {
  name: string
  symbols: string[]
}
let projectPackages: ProjectPackageSymbols[] = []
/** upper-case name → "file.lisp:12 · defun" for project definitions */
let projectDefinitionDetail = new Map<string, { where: string; kind: string }>()

export function registerProjectSymbols(pkgs: ProjectPackageSymbols[]): void {
  projectPackages = pkgs
}

export function registerProjectDefinitions(defs: { name: string; kind: string; path: string; line: number }[]): void {
  projectDefinitionDetail = new Map(defs.map((d) => [d.name.toUpperCase(), { where: `${d.path.split('/').pop()}:${d.line}`, kind: d.kind }]))
}

const DEF_KIND_TO_TYPE: Record<string, string> = {
  defun: 'function', defgeneric: 'function', defmethod: 'function',
  defmacro: 'macro',
  defvar: 'variable', defparameter: 'variable', defconstant: 'constant',
  defclass: 'class', defstruct: 'class', 'define-condition': 'class', deftype: 'class',
}

function projectSymbols(): Completion[] {
  const out: Completion[] = []
  for (const p of projectPackages) {
    for (const s of p.symbols) {
      const def = projectDefinitionDetail.get(s.toUpperCase())
      const label = p.name === 'CL-USER' ? s.toLowerCase() : `${p.name.toLowerCase()}:${s.toLowerCase()}`
      out.push({
        label,
        type: (def && DEF_KIND_TO_TYPE[def.kind]) || 'function',
        detail: def ? `${p.name} · ${def.where}` : p.name,
        boost: 2,
      })
    }
  }
  return out
}

/* ---- buffer-local symbols and enclosing-form locals ---- */

/** (defun foo …) etc. defined in the current document. */
export function bufferSymbols(doc: string): Completion[] {
  const out = new Map<string, Completion>()
  const re = /\(\s*(defun|defmacro|defparameter|defvar|defconstant|defgeneric|defmethod|defclass|defstruct)\s+([\w*+/<>=!?$%&.-]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(doc))) {
    const kind = m[1].toLowerCase()
    const name = m[2].toLowerCase()
    if (!out.has(name)) {
      out.set(name, {
        label: name,
        type: kind === 'defparameter' || kind === 'defvar' || kind === 'defconstant' ? 'variable'
          : kind === 'defclass' || kind === 'defstruct' ? 'class'
          : kind === 'defmacro' ? 'macro' : 'function',
        detail: 'buffer',
        boost: 3,
      })
    }
  }
  return [...out.values()]
}

/** locals: let / let* / lambda-list names visible in the enclosing top-level
 * form — the text of the form is scanned, bindings after the caret only
 * count when they precede it (approximation: all are offered — a nested
 * let after the caret is rare enough and harmless). */
export function localsInForm(formText: string, caret: number): Completion[] {
  const out = new Map<string, Completion>()
  const bindName = (s: string | undefined) => {
    if (s && /^[\w*+/<>=!?$%&.-]+$/.test(s) && !out.has(s.toLowerCase())) {
      out.set(s.toLowerCase(), { label: s.toLowerCase(), type: 'variable', detail: 'local', boost: 4 })
    }
  }
  /* (let ((name ...) ...) and (let (a b c ...) */
  let re = /\(\s*(let|let\*|dotimes|dolist)\s+(\()/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(formText))) {
    const rest = formText.slice(m.index, Math.min(m.index + 4000, formText.length))
    const inner = rest.match(/\(([\s\S]*?)\)\s*\)/)
    if (inner) {
      const bindingRe = /\(\s*([\w*+/<>=!?$%&.-]+)|([\w*+/<>=!?$%&.-]+)/g
      let b: RegExpExecArray | null
      let count = 0
      while ((b = bindingRe.exec(inner[1])) && count++ < 60) bindName(b[1] || b[2])
    }
  }
  /* lambda lists of defun/defmacro/lambda in the form */
  re = /\(\s*(?:defun|defmacro|defgeneric|lambda)\s+[\w*+/<>=!?$%&.-]*\s*\(([\s\S]*?)\)/gi
  while ((m = re.exec(formText))) {
    let b: RegExpExecArray | null
    const bindingRe = /[\w*+/<>=!?$%&.-]+/g
    let count = 0
    while ((b = bindingRe.exec(m[1])) && count++ < 20) {
      const w = b[0]
      if (!w.startsWith('&')) bindName(w)
    }
  }
  void caret
  return [...out.values()]
}

/** keywords used in the buffer (:foo) — offered after a lone ':'. */
function bufferKeywords(doc: string): Completion[] {
  const out = new Map<string, Completion>()
  const re = /(?<![\w:]):([\w*+/<>=!?$%&.-]+)/g
  let m: RegExpExecArray | null
  let count = 0
  while ((m = re.exec(doc)) && count++ < 200) {
    if (!out.has(m[1])) out.set(m[1], { label: ':' + m[1], type: 'keyword', detail: 'keyword' })
  }
  return [...out.values()]
}

/* ---- scoring ---- */

export function scoreMatch(candidate: string, prefix: string): number {
  if (candidate === prefix) return 1000
  if (candidate.startsWith(prefix)) return 800 - candidate.length * 0.1
  const ws = candidate.indexOf(prefix, 1) /* after a separator, e.g. hash-table-… */
  if (ws > 0 && /[-*./:]/.test(candidate[ws - 1])) return 650 - candidate.length * 0.1
  const sub = candidate.indexOf(prefix)
  if (sub > 0) return 400 - sub
  /* subsequence (fuzzy): every prefix char in order */
  let pi = 0
  for (let ci = 0; ci < candidate.length && pi < prefix.length; ci++) if (candidate[ci] === prefix[pi]) pi++
  return pi === prefix.length ? 200 : -1
}

type Position = 'head' | 'argument' | 'function-quote' | 'keyword' | 'package-prefix'

export interface ContextInfo {
  position: Position
  prefix: string
  /** for package-prefix: the package part before the colon */
  pkg?: string
  from: number
}

export function analyzeContext(doc: string, pos: number): ContextInfo | null {
  /* the symbol-ish token being typed */
  let end = pos
  while (end > 0 && /[\w*+/<>=!?$%&:.-]/.test(doc[end - 1])) end--
  const token = doc.slice(end, pos)
  /* look back over the same token class for the character before it */
  let before = end
  while (before > 0 && /\s/.test(doc[before - 1])) before--
  const prevChar = before > 0 ? doc[before - 1] : ''
  const twoBack = before > 1 ? doc.slice(before - 2, before) : ''

  if (twoBack === "#'") return { position: 'function-quote', prefix: token.replace(/^:/, ''), from: end }
  const colon = token.indexOf(':')
  if (colon > 0 && !token.startsWith(':')) {
    return { position: 'package-prefix', prefix: token.slice(colon + 1).toLowerCase(), pkg: token.slice(0, colon).toLowerCase(), from: end }
  }
  if (token.startsWith(':')) return { position: 'keyword', prefix: token.slice(1).toLowerCase(), from: end }
  const prefix = token.toLowerCase()
  if (prevChar === '(') {
    /* head position: what is being called */
    return { position: 'head', prefix, from: end }
  }
  return { position: 'argument', prefix, from: end }
}

const CALLABLE = new Set(['function', 'macro'])
const isCallable = (o: Completion) => !o.type || CALLABLE.has(o.type)

export function clCompletionSource(context: CompletionContext): CompletionResult | null {
  const doc = context.state.doc.toString()
  const info = analyzeContext(doc, context.pos)
  if (!info) return null
  if (!context.explicit && info.prefix.length < 1 && info.position !== 'head' && info.position !== 'keyword') return null
  if (!context.explicit && info.prefix.length < 2 && info.position !== 'head' && info.position !== 'keyword' && info.position !== 'package-prefix') return null

  let options: Completion[]
  const prefix = info.prefix

  if (info.position === 'package-prefix' && info.pkg) {
    /* only that package's symbols; the label keeps the foo: prefix so the
     * completed text is right */
    const want = info.pkg
    options = projectSymbols()
      .filter((o) => (o.label.includes(':') ? o.label.split(':')[0] === want : want === 'cl' && liveKinds.has(o.label)))
      .map((o) => (o.label.includes(':') ? o : { ...o, label: `${want}:${o.label}` }))
  } else if (info.position === 'keyword') {
    options = bufferKeywords(doc)
  } else if (info.position === 'head' || info.position === 'function-quote') {
    const localFns = bufferSymbols(doc).filter(isCallable)
    options = [...localFns, ...projectSymbols().filter(isCallable), ...(liveCompletions.length ? liveCompletions : coreCompletions)].filter(isCallable)
  } else {
    /* argument position: everything, locals first */
    const start = doc.lastIndexOf('\n(', context.pos)
    const formStart = Math.max(0, start)
    const locals = localsInForm(doc.slice(formStart, formStart + 8000), context.pos)
    options = [...locals, ...bufferSymbols(doc), ...projectSymbols(), ...(liveCompletions.length ? liveCompletions : coreCompletions)]
  }

  /* rank by score, drop non-matches, cap the list */
  const scored: { o: Completion; s: number }[] = []
  for (const o of options) {
    const label = o.label.includes(':') && prefix && !prefix.includes(':') ? o.label.split(':').pop() ?? o.label : o.label
    if (!prefix) { scored.push({ o, s: (o.boost ?? 0) * 10 }); continue }
    const s = scoreMatch(label, prefix)
    if (s < 0) continue
    scored.push({ o, s: s + (o.boost ?? 0) * 20 })
  }
  scored.sort((a, b) => b.s - a.s)
  const validFor = info.position === 'package-prefix' || info.position === 'keyword'
    ? /^[\w*+/<>=!?$%&:.-]*$/
    : /^[\w*+/<>=!?$%&.-]*$/
  return { from: info.from, options: scored.slice(0, 200).map((x) => x.o), validFor }
}
