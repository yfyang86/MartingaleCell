import { useMemo } from 'react'
import type { ReactNode } from 'react'

/**
 * Lightweight Common Lisp syntax highlighter.
 * Tokenizes with a small scanner and renders <span>s using the shared
 * tok-* utility classes from index.css (design.md §1.2 syntax theme).
 * No CodeMirror — docs code samples only.
 */

type TokType =
  | 'comment'
  | 'string'
  | 'number'
  | 'reader'
  | 'keyword'
  | 'constant'
  | 'package'
  | 'type'
  | 'symbol'
  | 'paren'
  | 'plain'

interface Token {
  type: TokType
  text: string
}

const KEYWORDS = new Set([
  'defun', 'defmacro', 'defvar', 'defparameter', 'defconstant', 'defgeneric',
  'defmethod', 'defclass', 'defstruct', 'defpackage', 'define-condition',
  'lambda', 'let', 'let*', 'flet', 'labels', 'macrolet', 'symbol-macrolet',
  'if', 'when', 'unless', 'cond', 'case', 'ecase', 'ccase', 'typecase',
  'progn', 'prog1', 'prog2', 'block', 'return-from', 'tagbody', 'go',
  'catch', 'throw', 'unwind-protect', 'loop', 'do', 'do*', 'dolist',
  'dotimes', 'setf', 'setq', 'psetf', 'quote', 'function', 'declare',
  'multiple-value-bind', 'destructuring-bind', 'handler-case',
  'handler-bind', 'restart-case', 'restart-bind', 'with-restarts',
  'with-open-file', 'with-slots', 'with-accessors', 'with-hash-table-iterator',
  'in-package', 'eval-when', 'values', 'the', 'locally', 'load-time-value',
])

const CONSTANTS = new Set(['t', 'nil', 'otherwise'])

const TYPE_NAMES = new Set([
  'cons', 'list', 'vector', 'string', 'array', 'hash-table', 'integer',
  'fixnum', 'float', 'double-float', 'single-float', 'ratio', 'complex',
  'number', 'character', 'stream', 'package', 'function', 'standard-object',
  'standard-class', 'simple-vector', 'bit-vector',
])

const isDigit = (c: string) => c >= '0' && c <= '9'
const isSymChar = (c: string) =>
  /[A-Za-z0-9\-+*/<>=!?_.$%&~^]/.test(c)

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let pendingPackage = false // last token ended with ':' or '::'

  const push = (type: TokType, text: string) => {
    tokens.push({ type, text })
    if (type !== 'plain') pendingPackage = type === 'package'
  }

  while (i < src.length) {
    const c = src[i]

    // whitespace
    if (/\s/.test(c)) {
      let j = i
      while (j < src.length && /\s/.test(src[j])) j++
      tokens.push({ type: 'plain', text: src.slice(i, j) })
      i = j
      continue
    }

    // comment
    if (c === ';') {
      let j = i
      while (j < src.length && src[j] !== '\n') j++
      push('comment', src.slice(i, j))
      i = j
      continue
    }

    // string
    if (c === '"') {
      let j = i + 1
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\') j++
        j++
      }
      push('string', src.slice(i, j + 1))
      i = j + 1
      continue
    }

    // parens
    if (c === '(' || c === ')') {
      push('paren', c)
      i++
      continue
    }

    // reader macros: #' #\ #x #b #o #± ' ` , ,@
    if (c === "'") {
      push('reader', "'")
      i++
      continue
    }
    if (c === '`') {
      push('reader', '`')
      i++
      continue
    }
    if (c === ',') {
      if (src[i + 1] === '@') {
        push('reader', ',@')
        i += 2
      } else {
        push('reader', ',')
        i++
      }
      continue
    }
    if (c === '#') {
      const n = src[i + 1]
      if (n === "'") {
        push('reader', "#'")
        i += 2
        continue
      }
      if (n === '\\') {
        // #\a or #\Space
        let j = i + 2
        while (j < src.length && isSymChar(src[j])) j++
        push('reader', src.slice(i, Math.max(j, i + 3)))
        i = Math.max(j, i + 3)
        continue
      }
      if (n === 'x' || n === 'b' || n === 'o') {
        let j = i + 2
        while (j < src.length && /[0-9a-fA-F]/.test(src[j])) j++
        push('number', src.slice(i, j))
        i = j
        continue
      }
      if (n === '+' || n === '-') {
        push('reader', src.slice(i, i + 2))
        i += 2
        continue
      }
      if (n === '(') {
        push('reader', '#(')
        i += 2
        continue
      }
      push('plain', c)
      i++
      continue
    }

    // number
    if (isDigit(c) || ((c === '+' || c === '-' || c === '.') && isDigit(src[i + 1] ?? ''))) {
      let j = i
      while (j < src.length && /[0-9./a-fA-F]/.test(src[j])) j++
      push('number', src.slice(i, j))
      i = j
      continue
    }

    // symbol-ish token
    if (isSymChar(c) || c === ':') {
      let j = i
      while (j < src.length && (isSymChar(src[j]) || src[j] === ':')) j++
      const text = src.slice(i, j)

      // REPL prompt prefix e.g. CL-USER>
      if (text.endsWith('>')) {
        push('package', text)
        i = j
        continue
      }

      const lower = text.toLowerCase()

      // package-qualified symbol: cl:mapcar / my-pkg::helper
      const colonIdx = text.indexOf(':')
      if (colonIdx > 0 && !text.startsWith(':')) {
        const sepLen = text[colonIdx + 1] === ':' ? 2 : 1
        push('package', text.slice(0, colonIdx + sepLen))
        const rest = text.slice(colonIdx + sepLen)
        push(KEYWORDS.has(rest.toLowerCase()) ? 'keyword' : 'symbol', rest)
        i = j
        continue
      }

      if (text.startsWith(':')) push('constant', text)
      else if (pendingPackage) push('symbol', text)
      else if (KEYWORDS.has(lower)) push('keyword', text)
      else if (CONSTANTS.has(lower)) push('constant', text)
      else if (TYPE_NAMES.has(lower)) push('type', text)
      else push('symbol', text)
      i = j
      continue
    }

    push('plain', c)
    i++
  }
  return tokens
}

const CLASS: Record<Exclude<TokType, 'plain'>, string> = {
  comment: 'tok-comment',
  string: 'tok-string',
  number: 'tok-number',
  reader: 'tok-reader',
  keyword: 'tok-keyword',
  constant: 'tok-constant',
  package: 'tok-package',
  type: 'tok-type',
  symbol: 'tok-symbol',
  paren: 'tok-paren',
}

/** Render highlighted Common Lisp source. Whitespace-pre content. */
export function ClCode({ code }: { code: string }) {
  const nodes = useMemo<ReactNode[]>(() => {
    return tokenize(code).map((t, idx) =>
      t.type === 'plain' ? (
        <span key={idx}>{t.text}</span>
      ) : (
        <span key={idx} className={CLASS[t.type]}>
          {t.text}
        </span>
      )
    )
  }, [code])
  return <>{nodes}</>
}

/** Code block well: bg-inset, radius 8, mono — per docs.md inline code style. */
export function CodeBlock({
  code,
  className = '',
}: {
  code: string
  className?: string
}) {
  return (
    <pre
      className={`overflow-x-auto rounded-lg border border-hairline bg-inset p-5 font-mono text-[12.5px] leading-[1.7] ${className}`}
    >
      <code>
        <ClCode code={code} />
      </code>
    </pre>
  )
}
