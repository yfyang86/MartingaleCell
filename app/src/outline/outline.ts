/* Definition outline: a pure scanner over Lisp source for `(def… name`
 * heads (any depth, strings and comments skipped) plus the pruning rule
 * for the persisted definition index. scripts/outline-test.mjs runs it. */

import { classifyChars } from '@/search/workspace-search'

export interface OutlineEntry {
  /** upper-case name as the image would report it, e.g. "FIB-MEMO", "(SETF PX)" */
  name: string
  /** as written in the source */
  label: string
  /** defun / defmacro / … (lower-case) */
  kind: string
  /** 1-based line and column of the opening paren */
  line: number
  col: number
  /** character offset of the opening paren */
  offset: number
}

export const DEF_KINDS = [
  'defun', 'defmacro', 'defvar', 'defparameter', 'defconstant', 'defclass', 'defstruct',
  'defgeneric', 'defmethod', 'deftype', 'define-condition', 'defpackage', 'defsetf', 'define-symbol-macro',
]

const SYM = '[^\\s()"\';`,]+'
const HEAD_RE = new RegExp(`\\(\\s*(${DEF_KINDS.join('|')})\\s+`, 'gi')

/** Normalise a written name to the image's reporting form: strip a package prefix, upper-case, keep (SETF X). */
export function canonicalName(written: string): string {
  const m = written.match(/^\(\s*setf\s+(\S+?)\s*\)$/i)
  if (m) return `(SETF ${stripPackage(m[1]).toUpperCase()})`
  return stripPackage(written).toUpperCase()
}

function stripPackage(s: string): string {
  const t = s.replace(/^[#']+/, '').replace(/^:/, '')
  const i = t.lastIndexOf(':')
  return i === -1 ? t : t.slice(i + 1)
}

/** Every definition head in `src`, in source order. */
export function scanDefinitions(src: string): OutlineEntry[] {
  const classes = classifyChars(src)
  const out: OutlineEntry[] = []
  const lineStarts = [0]
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1)
  const lineOf = (offset: number) => {
    let lo = 0, hi = lineStarts.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1 }
    return lo
  }
  HEAD_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = HEAD_RE.exec(src))) {
    const at = m.index
    if (classes[at] !== 0) continue
    const kind = m[1].toLowerCase()
    const rest = src.slice(HEAD_RE.lastIndex)
    let label: string | null = null
    if (rest.startsWith('(')) {
      /* (setf x), or a defstruct / defclass option list: (name (:constructor …)) */
      const setf = rest.match(/^\(\s*setf\s+(\S+?)\s*\)/i)
      if (setf) label = setf[0]
      else {
        const inner = rest.match(new RegExp(`^\\(\\s*(${SYM})`))
        if (inner) label = inner[1]
      }
    } else {
      const plain = rest.match(new RegExp(`^(${SYM})`))
      if (plain) label = plain[1]
    }
    if (!label) continue
    const li = lineOf(at)
    out.push({ name: canonicalName(label), label: label.replace(/\s+/g, ' '), kind, line: li + 1, col: at - lineStarts[li] + 1, offset: at })
  }
  return out
}

/** Drop persisted index entries whose buffer or cell is gone. */
export function pruneDefinitions<T extends { bufferId: string; cellN?: number }>(defs: T[], liveBufferIds: Set<string>, liveCellNs: Set<number>): T[] {
  return defs.filter((d) => (d.cellN != null ? liveCellNs.has(d.cellN) : liveBufferIds.has(d.bufferId)))
}
