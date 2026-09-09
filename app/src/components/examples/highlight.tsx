import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Lightweight Common Lisp tokenizer + renderer.
 * Reuses the scaffold's `tok-*` syntax theme classes (src/index.css,
 * design.md §1.2). No CodeMirror — previews are DOM spans only.
 */

export type TokType =
  | 'paren'
  | 'keyword'
  | 'symbol'
  | 'constant'
  | 'string'
  | 'comment'
  | 'number'
  | 'reader'
  | 'package'
  | 'type'
  | 'text'

export interface Tok {
  text: string
  type: TokType
}

const KEYWORDS = new Set([
  // special operators & defining forms (design: purple, 600)
  'defun', 'defmacro', 'defgeneric', 'defmethod', 'defclass', 'defstruct',
  'defvar', 'defparameter', 'defconstant', 'define-condition', 'defpackage',
  'in-package', 'lambda', 'named-lambda', 'let', 'let*', 'flet', 'labels',
  'macrolet', 'symbol-macrolet', 'if', 'when', 'unless', 'cond', 'case',
  'ccase', 'ecase', 'typecase', 'etypecase', 'ctypecase', 'and', 'or', 'not',
  'progn', 'prog1', 'prog2', 'setq', 'setf', 'psetq', 'psetf', 'incf', 'decf',
  'push', 'pushnew', 'pop', 'quote', 'function', 'values',
  'multiple-value-bind', 'multiple-value-call', 'multiple-value-setq',
  'multiple-value-list', 'nth-value', 'block', 'return-from', 'return',
  'tagbody', 'go', 'catch', 'throw', 'unwind-protect', 'loop', 'loop-finish',
  'do', 'do*', 'dolist', 'dotimes', 'destructuring-bind', 'with-open-file',
  'with-open-stream', 'with-slots', 'with-accessors', 'with-hash-table-iterator',
  'handler-case', 'handler-bind', 'restart-case', 'restart-bind',
  'with-condition-restarts', 'with-simple-restart', 'ignore-errors',
  'call-next-method', 'next-method-p', 'make-instance', 'slot-value',
  'error', 'cerror', 'signal', 'warn', 'assert', 'check-type', 'abort',
  'muffle-warning', 'continue', 'store-value', 'use-value',
  'invoke-restart', 'invoke-restart-interactively', 'invoke-debugger',
  'declare', 'the', 'locally', 'eval-when', 'load-time-value', 'progv',
  'declaim', 'proclaim', 'compiler-let', 'unwind-protect', 'time',
])

const CONSTANTS = new Set(['t', 'nil', 'otherwise', 'pi'])

const TYPES = new Set([
  'integer', 'fixnum', 'bignum', 'float', 'short-float', 'single-float',
  'double-float', 'long-float', 'rational', 'ratio', 'real', 'number',
  'complex', 'string', 'simple-string', 'base-string', 'character',
  'base-char', 'standard-char', 'extended-char', 'symbol', 'keyword',
  'boolean', 'generalized-boolean', 'cons', 'list', 'null', 'atom',
  'sequence', 'array', 'simple-array', 'vector', 'simple-vector',
  'bit-vector', 'simple-bit-vector', 'hash-table', 'package', 'stream',
  'pathname', 'logical-pathname', 'function', 'compiled-function',
  'standard-object', 'standard-class', 'structure-object', 'structure-class',
  'built-in-class', 'class', 'method', 'generic-function',
  'standard-generic-function', 'method-combination', 'condition',
  'serious-condition', 'error', 'simple-error', 'type-error',
  'simple-type-error', 'cell-error', 'unbound-variable', 'unbound-slot',
  'undefined-function', 'arithmetic-error', 'division-by-zero',
  'floating-point-overflow', 'warning', 'simple-warning', 'style-warning',
  'restart', 'bit', 'signed-byte', 'unsigned-byte', 'random-state',
  'readtable', 'broadcast-stream', 'concatenated-stream', 'echo-stream',
  'file-stream', 'string-stream', 'synonym-stream', 'two-way-stream',
])

const SYMBOL_CHAR = "[^\\s()\"'`,;]"

const TOKEN_RE = new RegExp(
  [
    '(;.*$)',                                        // 1 comment
    '("(?:\\\\.|[^"\\\\])*")',                       // 2 string
    '(#\\\\(?:[^\\s]|newline|space|tab|return))',    // 3 character literal
    "(#'|#\\(|#\\.|#:|#\\+|#-|,@|,\\.?|,|[`'])",       // 4 reader macros
    '([()])',                                        // 5 parens
    `([+-]?(?:\\d+\\/\\d+|\\d*\\.\\d+(?:[defsl][+-]?\\d+)?|\\d+(?:\\.\\d*)?(?:[defsl][+-]?\\d+)?|#x[0-9a-f]+|#b[01]+|#o[0-7]+)(?!${SYMBOL_CHAR}))`, // 6 number
    `(${SYMBOL_CHAR}+)`,                             // 7 symbol-ish
  ].join('|'),
  'gi'
)

// reader-macro alternation, corrected (kept separate for clarity)
const READER_RE = /^(#\\(?:[^\s]|newline|space|tab|return)|#'|#\(|#\.|#:|#\+|#-|,@|,\.?|[`'])$/i

function classifySymbol(raw: string, out: Tok[]) {
  const lower = raw.toLowerCase()
  if (lower.startsWith('&')) {
    // lambda-list markers
    out.push({ text: raw, type: 'constant' })
    return
  }
  if (lower.startsWith(':')) {
    out.push({ text: raw, type: 'constant' })
    return
  }
  if (CONSTANTS.has(lower)) {
    out.push({ text: raw, type: 'constant' })
    return
  }
  const colon = raw.indexOf(':')
  if (colon > 0) {
    // package prefix, e.g. cl:format
    out.push({ text: raw.slice(0, colon + 1), type: 'package' })
    classifySymbol(raw.slice(colon + 1), out)
    return
  }
  if (KEYWORDS.has(lower)) {
    out.push({ text: raw, type: 'keyword' })
    return
  }
  if (TYPES.has(lower)) {
    out.push({ text: raw, type: 'type' })
    return
  }
  out.push({ text: raw, type: 'symbol' })
}

export function tokenizeLine(line: string): Tok[] {
  const out: Tok[] = []
  TOKEN_RE.lastIndex = 0
  let last = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), type: 'text' })
    const text = m[0]
    if (m[1] !== undefined) out.push({ text, type: 'comment' })
    else if (m[2] !== undefined) out.push({ text, type: 'string' })
    else if (m[3] !== undefined) out.push({ text, type: 'reader' })
    else if (m[4] !== undefined) {
      if (READER_RE.test(text)) out.push({ text, type: 'reader' })
      else classifySymbol(text, out)
    } else if (m[5] !== undefined) out.push({ text, type: 'paren' })
    else if (m[6] !== undefined) out.push({ text, type: 'number' })
    else if (m[7] !== undefined) classifySymbol(text, out)
    else out.push({ text, type: 'text' })
    last = m.index + text.length
  }
  if (last < line.length) out.push({ text: line.slice(last), type: 'text' })
  return out
}

export function tokenize(code: string): Tok[][] {
  return code.replace(/\n+$/, '').split('\n').map(tokenizeLine)
}

/** Count top-level forms ("cells") — ignores comments & strings. */
export function countCells(code: string): number {
  let depth = 0
  let cells = 0
  let inString = false
  let inComment = false
  let escaped = false
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    if (inComment) {
      if (ch === '\n') inComment = false
      continue
    }
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === ';') inComment = true
    else if (ch === '"') inString = true
    else if (ch === '(') {
      if (depth === 0) cells++
      depth++
    } else if (ch === ')') depth = Math.max(0, depth - 1)
  }
  return cells
}

const TOK_CLASS: Record<TokType, string> = {
  paren: 'tok-paren',
  keyword: 'tok-keyword',
  symbol: 'tok-symbol',
  constant: 'tok-constant',
  string: 'tok-string',
  comment: 'tok-comment',
  number: 'tok-number',
  reader: 'tok-reader',
  package: 'tok-package',
  type: 'tok-type',
  text: '',
}

export function renderTokens(toks: Tok[], keyPrefix: string): ReactNode[] {
  return toks.map((t, i) =>
    t.type === 'text' ? (
      <span key={`${keyPrefix}-${i}`}>{t.text}</span>
    ) : (
      <span key={`${keyPrefix}-${i}`} className={TOK_CLASS[t.type]}>
        {t.text}
      </span>
    )
  )
}

/** Static highlighted code block (no line numbers). */
export function ClCode({
  code,
  className,
  maxLines,
}: {
  code: string
  className?: string
  maxLines?: number
}) {
  const lines = useMemo(() => {
    const all = tokenize(code)
    return maxLines ? all.slice(0, maxLines) : all
  }, [code, maxLines])
  return (
    <pre className={cn('font-mono', className)}>
      {lines.map((toks, i) => (
        <div key={i} className="whitespace-pre">
          {renderTokens(toks, String(i))}
          {toks.length === 0 ? ' ' : null}
        </div>
      ))}
    </pre>
  )
}

/** Highlighted code block with line numbers + horizontal scroll. */
export function ClCodeBlock({
  code,
  className,
}: {
  code: string
  className?: string
}) {
  const lines = useMemo(() => tokenize(code), [code])
  return (
    <pre className={cn('font-mono', className)}>
      {lines.map((toks, i) => (
        <div key={i} className="flex whitespace-pre">
          <span
            aria-hidden
            className="w-8 shrink-0 select-none pr-4 text-right text-muted"
          >
            {i + 1}
          </span>
          <span>{renderTokens(toks, String(i))}</span>
        </div>
      ))}
    </pre>
  )
}
