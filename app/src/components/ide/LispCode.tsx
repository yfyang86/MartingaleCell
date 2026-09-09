/* Lightweight React renderer for highlighted Common Lisp source — used in
 * session cell input echoes and value blocks (same colors as the editor,
 * rainbow parens by depth). Uses the tok-* utilities from index.css. */

import { Fragment } from 'react'
import type { ReactNode } from 'react'

const KEYWORDS = new Set([
  'defun', 'defmacro', 'defparameter', 'defvar', 'defconstant', 'defgeneric', 'defmethod',
  'defclass', 'defstruct', 'defpackage', 'in-package', 'lambda', 'let', 'let*', 'flet', 'labels',
  'macrolet', 'if', 'when', 'unless', 'cond', 'case', 'ecase', 'typecase', 'progn', 'prog1',
  'block', 'return-from', 'tagbody', 'go', 'catch', 'throw', 'unwind-protect', 'handler-case',
  'handler-bind', 'restart-case', 'loop', 'do', 'do*', 'dolist', 'dotimes', 'quote', 'function',
  'setq', 'setf', 'multiple-value-bind', 'destructuring-bind', 'with-open-file',
  'with-output-to-string', 'with-input-from-string', 'with-slots', 'values', 'the', 'declare',
  'and', 'or', 'not', 'incf', 'decf', 'push', 'pop', 'time', 'macroexpand-1', 'otherwise',
])

interface Tok { text: string; cls: string }

export function tokenizeLisp(src: string): Tok[] {
  const toks: Tok[] = []
  let depth = 0
  let i = 0
  const push = (text: string, cls: string) => { if (text) toks.push({ text, cls }) }

  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      let j = i
      while (j < src.length && /\s/.test(src[j])) j++
      push(src.slice(i, j), '')
      i = j
      continue
    }
    if (c === ';') {
      let j = i
      while (j < src.length && src[j] !== '\n') j++
      push(src.slice(i, j), 'tok-comment')
      i = j
      continue
    }
    if (c === '#') {
      if (src[i + 1] === '|') {
        let d = 1, j = i + 2
        while (j < src.length && d > 0) {
          if (src[j] === '#' && src[j + 1] === '|') { d++; j += 2 }
          else if (src[j] === '|' && src[j + 1] === '#') { d--; j += 2 }
          else j++
        }
        push(src.slice(i, j), 'tok-comment')
        i = j
        continue
      }
      if (src[i + 1] === "'") { push("#'", 'tok-reader'); i += 2; continue }
      if (src[i + 1] === '\\') {
        let j = i + 2
        if (j < src.length && /[A-Za-z0-9]/.test(src[j])) while (j < src.length && /[A-Za-z0-9-]/.test(src[j])) j++
        else j++
        push(src.slice(i, j), 'tok-number')
        i = j
        continue
      }
      if (src[i + 1] === '<') { // #<CLASS-NAME {address}> unreadable object
        let j = i + 2
        while (j < src.length && src[j] !== '>') j++
        push(src.slice(i, j + 1), 'tok-comment')
        i = j + 1
        continue
      }
      let j = i + 1
      while (j < src.length && /[A-Za-z0-9.+-]/.test(src[j])) j++
      push(src.slice(i, j), 'tok-reader')
      i = j
      continue
    }
    if (c === '"') {
      let j = i + 1
      while (j < src.length && src[j] !== '"') { if (src[j] === '\\') j++; j++ }
      push(src.slice(i, Math.min(j + 1, src.length)), 'tok-string')
      i = j + 1
      continue
    }
    if (c === '(') { depth++; push('(', `tok-paren-${((depth - 1) % 6) + 1}`); i++; continue }
    if (c === ')') { push(')', `tok-paren-${((Math.max(depth, 1) - 1) % 6) + 1}`); depth = Math.max(0, depth - 1); i++; continue }
    if (c === "'" || c === '`') { push(c, 'tok-reader'); i++; continue }
    if (c === ',') { push(src[i + 1] === '@' ? ',@' : ',', 'tok-reader'); i += src[i + 1] === '@' ? 2 : 1; continue }

    let j = i
    while (j < src.length && !/[\s()'"`,;#"]/.test(src[j])) j++
    const word = src.slice(i, j)
    const lower = word.toLowerCase()
    if (/^[+-]?(\d+\/\d+|\d+\.\d*|\.\d+|\d+)([eEsSfFdDlL][+-]?\d+)?$/.test(word)) push(word, 'tok-number')
    else if (lower.startsWith(':') || lower === 't' || lower === 'nil' || lower.startsWith('&')) push(word, 'tok-constant')
    else if (/^[A-Za-z][\w*+/<>=!?$%&.-]*::?/.test(word) && word.length > word.match(/^[A-Za-z][\w*+/<>=!?$%&.-]*::?/)![0].length) {
      const m = word.match(/^[A-Za-z][\w*+/<>=!?$%&.-]*::?/)![0]
      push(m, 'tok-package')
      push(word.slice(m.length), 'tok-symbol')
    }
    else if (KEYWORDS.has(lower)) push(word, 'tok-keyword')
    else push(word, 'tok-symbol')
    i = j
  }
  return toks
}

export function LispCode({ code, className }: { code: string; className?: string }) {
  const toks = tokenizeLisp(code)
  return (
    <code className={className}>
      {toks.map((t, i) => (
        <Fragment key={i}>
          {t.cls ? <span className={t.cls}>{t.text}</span> : (t.text as ReactNode)}
        </Fragment>
      ))}
    </code>
  )
}
