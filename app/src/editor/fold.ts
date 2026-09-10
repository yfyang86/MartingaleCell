/* Folding for Lisp buffers (Sprint 20). CodeMirror's StreamLanguage has no
 * syntax tree to fold by, so a foldService computes the range from the
 * text: the fold of a line is the OUTERMOST form that opens on that line
 * and closes on a later line, hidden from the end of the opening line to
 * just before the closing paren — `(defun sq (x)…)` stays readable.
 * Strings, comments and character literals are skipped through the search
 * module's character classifier, so a paren inside "…" or after ; does not
 * count. The fold state itself is a CodeMirror field, stashed and persisted
 * per buffer with the rest of the editor state. */
import { foldService } from '@codemirror/language'
import { classifyChars } from '@/search/workspace-search'

export interface FoldRange { from: number; to: number }

/** a paren that is code and not the character literal `#\(` / `#\)` (the classifier keeps those as code) */
const isCodeParen = (src: string, cls: Uint8Array, i: number) =>
  cls[i] === 0 && !(i >= 2 && src[i - 1] === '\\' && src[i - 2] === '#')

/** matching close paren offset for the open paren at `open`, or -1 */
export function matchingClose(src: string, cls: Uint8Array, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (!isCodeParen(src, cls, i)) continue
    const c = src[i]
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth === 0) return i }
  }
  return -1
}

/** the fold range for the line [lineFrom, lineTo) of `src`, or null when nothing on that line spans further lines */
export function foldRangeForLine(src: string, lineFrom: number, lineTo: number, cls: Uint8Array = classifyChars(src)): FoldRange | null {
  /* skip forms that are nested inside a form that opened on the same line: only the first open paren whose
   * close lies beyond the line end counts, scanning left to right at the line's own depth */
  let i = lineFrom
  while (i < lineTo) {
    if (src[i] === '(' && isCodeParen(src, cls, i)) {
      const close = matchingClose(src, cls, i)
      if (close < 0) return null /* unbalanced: no fold */
      if (close >= lineTo) {
        /* fold from the end of the opening line; keep the closing paren visible; nothing to fold when only whitespace would hide */
        const from = lineTo
        const to = close
        return /\S/.test(src.slice(from, to)) ? { from, to } : null
      }
      i = close + 1
      continue
    }
    i++
  }
  return null
}

/* the classifier runs once per document version (the gutter asks for every visible line on each update) */
const classified = new WeakMap<object, { src: string; cls: Uint8Array }>()
function classify(doc: { toString(): string }): { src: string; cls: Uint8Array } {
  let hit = classified.get(doc)
  if (!hit) { const src = doc.toString(); hit = { src, cls: classifyChars(src) }; classified.set(doc, hit) }
  return hit
}

/** CodeMirror fold service over the document text */
export const lispFoldService = foldService.of((state, lineStart, lineEnd) => {
  const { src, cls } = classify(state.doc)
  return foldRangeForLine(src, lineStart, lineEnd, cls)
})
