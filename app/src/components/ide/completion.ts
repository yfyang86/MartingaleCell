/* Autocomplete source: CL core symbols (+ doc popovers) and buffer-local definitions. */

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
  if (!sym) return null
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

/* ---- project symbols (merged after "Load Project into Runtime") ---- */

export interface ProjectPackageSymbols {
  name: string
  symbols: string[]
}

let projectPackages: ProjectPackageSymbols[] = []
/** upper-case name → "file.lisp:12 · defun" for project definitions (go-to-definition targets) */
let projectDefinitionDetail = new Map<string, { where: string; kind: string }>()

/** Replace the project-provided completion source (called by project/load.ts). */
export function registerProjectSymbols(pkgs: ProjectPackageSymbols[]): void {
  projectPackages = pkgs
}

/** Definitions reported by the loader — used for completion details and types. */
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
      out.push({
        label: s.toLowerCase(),
        type: (def && DEF_KIND_TO_TYPE[def.kind]) || 'function',
        detail: def ? `${p.name} · ${def.where}` : p.name,
        boost: 1,
      })
    }
  }
  return out
}

/** (defun foo …) etc. defined in the current document. */
function bufferSymbols(doc: string): Completion[] {
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
        boost: 1,
      })
    }
  }
  return [...out.values()]
}

export function clCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w*+/<>=!?$%&:.-][\w*+/<>=!?$%&.-]*/)
  if (!word && !context.explicit) return null
  const from = word ? word.from : context.pos
  const prefix = word ? word.text.toLowerCase() : ''
  if (!context.explicit && prefix.length < 2) return null
  const options = [...bufferSymbols(context.state.doc.toString()), ...projectSymbols(), ...coreCompletions]
  return { from, options, validFor: /^[\w*+/<>=!?$%&.-]*$/ }
}
