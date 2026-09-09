/* Lisp source utilities: paren scanning, form extraction, top-level navigation.
 * Shared by the CodeMirror extensions, the session cells and the actions. */

export interface ParenInfo {
  pos: number
  open: boolean
  depth: number
  match: number // index into parens array of the matching paren, -1 if unmatched
}

/** Scan source for parens, skipping strings, ; comments, #| |# blocks and #\ chars. */
export function scanParens(src: string): ParenInfo[] {
  const parens: ParenInfo[] = []
  const stack: number[] = []
  let inStr = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === '"') inStr = false
      continue
    }
    if (c === ';') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '"') { inStr = true; continue }
    if (c === '#') {
      if (src[i + 1] === '|') {
        let d = 1; i += 2
        while (i < src.length && d > 0) {
          if (src[i] === '#' && src[i + 1] === '|') { d++; i += 2 }
          else if (src[i] === '|' && src[i + 1] === '#') { d--; i += 2 }
          else i++
        }
        continue
      }
      if (src[i + 1] === '\\') { // #\a  #\Space  #\(
        i += 2
        if (i < src.length && /[A-Za-z0-9]/.test(src[i])) {
          while (i < src.length && /[A-Za-z0-9]/.test(src[i])) i++
          i--
        }
        continue
      }
    }
    if (c === '(') {
      stack.push(parens.length)
      parens.push({ pos: i, open: true, depth: stack.length, match: -1 })
    } else if (c === ')') {
      const openIdx = stack.pop()
      const info: ParenInfo = { pos: i, open: false, depth: stack.length + 1, match: -1 }
      parens.push(info)
      if (openIdx !== undefined) {
        info.match = openIdx
        parens[openIdx].match = parens.length - 1
      }
    }
  }
  return parens
}

/** Depth of the sexp nesting at a character position. */
export function depthAt(src: string, pos: number): number {
  const parens = scanParens(src)
  return parens.filter((p) => p.pos < pos && p.open && (p.match === -1 || parens[p.match].pos >= pos)).length
}

/** The top-level form (start/end offsets) enclosing a position, if any. */
export function topLevelFormAt(src: string, pos: number): { from: number; to: number } | null {
  const parens = scanParens(src)
  // ancestors: open parens before pos whose match is at/after pos
  let innermostTop: ParenInfo | null = null
  for (const p of parens) {
    if (!p.open || p.depth !== 1) continue
    const closeIdx = p.match
    const end = closeIdx === -1 ? src.length : parens[closeIdx].pos + 1
    if (p.pos <= pos && pos <= end) innermostTop = p
  }
  if (innermostTop) {
    const closeIdx = innermostTop.match
    return { from: innermostTop.pos, to: closeIdx === -1 ? src.length : parens[closeIdx].pos + 1 }
  }
  // bare atom at top level
  let i = pos
  while (i > 0 && !/[\s()]/.test(src[i - 1])) i--
  let j = pos
  while (j < src.length && !/[\s()]/.test(src[j])) j++
  if (j > i) return { from: i, to: j }
  return null
}

/** The innermost form enclosing a position (for select-enclosing / macroexpand). */
export function innermostFormAt(src: string, pos: number): { from: number; to: number } | null {
  const parens = scanParens(src)
  let best: { from: number; to: number; size: number } | null = null
  for (const p of parens) {
    if (!p.open) continue
    const closeIdx = p.match
    const end = closeIdx === -1 ? src.length : parens[closeIdx].pos + 1
    if (p.pos <= pos && pos <= end) {
      const size = end - p.pos
      if (!best || size < best.size) best = { from: p.pos, to: end, size }
    }
  }
  return best ? { from: best.from, to: best.to } : null
}

/** All top-level form ranges in a document. */
export function topLevelForms(src: string): { from: number; to: number }[] {
  const parens = scanParens(src)
  const out: { from: number; to: number }[] = []
  for (const p of parens) {
    if (p.open && p.depth === 1) {
      const closeIdx = p.match
      out.push({ from: p.pos, to: closeIdx === -1 ? src.length : parens[closeIdx].pos + 1 })
    }
  }
  return out
}

/** Enclosing call context for signature help: the symbol at the head of the
 * innermost form containing pos, plus which argument the caret sits on. */
export function callContextAt(src: string, pos: number): { fn: string; argIndex: number; from: number } | null {
  const parens = scanParens(src)
  let best: { from: number; to: number } | null = null
  for (const p of parens) {
    if (!p.open) continue
    const closeIdx = p.match
    const end = closeIdx === -1 ? src.length : parens[closeIdx].pos + 1
    if (p.pos < pos && pos <= end) {
      if (!best || end - p.pos < best.to - best.from) best = { from: p.pos, to: end }
    }
  }
  if (!best) return null
  const inner = src.slice(best.from + 1, pos)
  const m = inner.match(/^\s*([\w*+/<>=!?$%&.-]+(?:::[\w*+/<>=!?$%&.-]+|:[\w*+/<>=!?$%&.-]+)?)/i)
  if (!m) return null
  const fnName = m[1]
  // count complete top-level (relative) args between the head symbol and the caret
  const rest = inner.slice(m[0].length)
  let depth = 0, inStr = false, args = 0, sawSpace = false, curToken = false
  for (const c of rest) {
    if (inStr) { if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; curToken = true; continue }
    if (c === '(') { depth++; curToken = true; continue }
    if (c === ')') { depth--; continue }
    if (/\s/.test(c)) {
      if (depth === 0 && curToken) { args++; curToken = false; sawSpace = true }
      continue
    }
    curToken = true
  }
  void sawSpace
  // caret inside a new token → that's arg N; inside whitespace after token → arg N
  return { fn: fnName, argIndex: Math.max(0, args), from: best.from }
}

/** Find the line:col of the first occurrence of a symbol definition in a buffer. */
export function findSymbolPosition(src: string, symbol: string): { line: number; col: number } | null {
  const re = new RegExp(`\\(\\s*(?:defun|defmacro|defparameter|defvar|defconstant|defgeneric|defmethod|defclass|defstruct)\\s+${escapeRe(symbol)}\\b`, 'i')
  const m = src.match(re)
  const idx = m ? (m.index ?? -1) : src.toUpperCase().indexOf(symbol.toUpperCase())
  if (idx < 0) return null
  const before = src.slice(0, idx)
  const line = before.split('\n').length
  const col = idx - before.lastIndexOf('\n')
  return { line, col }
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/** Balance of parens in a buffer: >0 unclosed opens, <0 extra closes, 0 balanced. */
export function parenBalance(src: string): number {
  const parens = scanParens(src)
  let bal = 0
  for (const p of parens) bal += p.open ? 1 : -1
  return bal
}
