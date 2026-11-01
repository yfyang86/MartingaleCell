/* Common Lisp language support for CodeMirror 6:
 * StreamLanguage tokenizer + MartingaleCell syntax HighlightStyle + editor theme.
 * Colors exactly per design.md §1.2 syntax table. */

import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { StreamParser } from '@codemirror/language'
import { tags, type Tag } from '@lezer/highlight'
import { EditorView } from '@codemirror/view'

const KEYWORDS = new Set([
  'defun', 'defmacro', 'defparameter', 'defvar', 'defconstant', 'defgeneric', 'defmethod',
  'defclass', 'defstruct', 'defpackage', 'in-package', 'lambda', 'let', 'let*', 'flet', 'labels',
  'macrolet', 'symbol-macrolet', 'if', 'when', 'unless', 'cond', 'case', 'ecase', 'ccase', 'typecase',
  'etypecase', 'ctypecase', 'progn', 'prog1', 'prog2', 'block', 'return-from', 'tagbody', 'go',
  'catch', 'throw', 'unwind-protect', 'handler-case', 'handler-bind', 'restart-case', 'restart-bind',
  'with-simple-restart', 'loop', 'do', 'do*', 'dolist', 'dotimes', 'quote', 'function', 'setq',
  'setf', 'psetq', 'psetf', 'multiple-value-bind', 'multiple-value-list', 'multiple-value-call',
  'multiple-value-prog1', 'destructuring-bind', 'with-open-file', 'with-open-stream',
  'with-output-to-string', 'with-input-from-string', 'with-slots', 'with-accessors',
  'with-hash-table-iterator', 'with-package-iterator', 'with-standard-io-syntax', 'with-compilation-unit',
  'values', 'the', 'declare', 'locally', 'eval-when', 'load-time-value', 'and', 'or', 'not',
  'incf', 'decf', 'push', 'pushnew', 'pop', 'rotatef', 'shiftf', 'time', 'trace', 'untrace',
  'step', 'macroexpand', 'macroexpand-1', 'otherwise', 'return', 'assert', 'check-type',
  'defsetf', 'define-setf-expander', 'define-compiler-macro', 'define-symbol-macro',
  'print-unreadable-object', 'with-condition-restarts', 'make-load-form', 'nth-value',
  'with-gensyms', 'dribble', 'ed', 'inspect', 'describe', 'room', 'apropos',
])

const TYPES = new Set([
  'array', 'atom', 'bignum', 'bit', 'bit-vector', 'character', 'class', 'compiled-function',
  'complex', 'cons', 'double-float', 'fixnum', 'float', 'function', 'hash-table', 'integer',
  'keyword', 'list', 'long-float', 'nil', 'null', 'number', 'package', 'pathname', 'ratio',
  'rational', 'readtable', 'real', 'sequence', 'short-float', 'simple-array', 'simple-string',
  'simple-vector', 'single-float', 'standard-class', 'standard-object', 'stream', 'string',
  'structure', 'symbol', 't', 'vector', 'condition', 'serious-condition', 'simple-error',
  'simple-warning', 'style-warning', 'type-error', 'cell-error', 'arithmetic-error',
])

interface ClState {
  inString: boolean
  blockComment: number
  expectSymbol: boolean // previous token was a package prefix (foo:)
}

const SYMBOL_CHARS = /[^\s()'"`,;#"]/
const SPECIAL_VAR_RE = /^\*[^*]*\*$/

/* Map our custom token names onto tags (read at StreamLanguage.define time). */
export const clTokenTable: Record<string, Tag> = {
  paren: tags.paren,
  keyword: tags.keyword,
  symbol: tags.variableName,
  constant: tags.atom,
  string: tags.string,
  comment: tags.comment,
  number: tags.number,
  reader: tags.meta,
  package: tags.namespace,
  type: tags.typeName,
  var: tags.special(tags.variableName),
}

export const clStreamParser: StreamParser<ClState> = {
  name: 'common-lisp',
  tokenTable: clTokenTable,
  startState: (): ClState => ({ inString: false, blockComment: 0, expectSymbol: false }),

  token(stream, state): string | null {
    if (state.inString) {
      while (!stream.eol()) {
        const c = stream.next()
        if (c === '\\') stream.next()
        else if (c === '"') { state.inString = false; break }
      }
      return 'string'
    }
    if (state.blockComment > 0) {
      while (!stream.eol()) {
        if (stream.match('#|')) state.blockComment++
        else if (stream.match('|#')) state.blockComment--
        else stream.next()
        if (state.blockComment === 0) break
      }
      return 'comment'
    }
    if (stream.eatSpace()) return null
    const ch = stream.next()!

    if (ch === ';') { stream.skipToEnd(); return 'comment' }
    if (ch === '"') {
      state.inString = true
      while (!stream.eol()) {
        const c = stream.next()
        if (c === '\\') stream.next()
        else if (c === '"') { state.inString = false; break }
      }
      return 'string'
    }
    if (ch === '(' || ch === ')') return 'paren'
    if (ch === "'") return 'reader'
    if (ch === '`') return 'reader'
    if (ch === ',') { if (stream.eat('@')) return 'reader'; return 'reader' }
    if (ch === '#') {
      const next = stream.peek()
      if (next === '|') { stream.next(); state.blockComment = 1; return 'comment' }
      if (next === "'") { stream.next(); return 'reader' }
      if (next === '\\') {
        stream.next()
        if (!stream.eatWhile(/[A-Za-z0-9-]/)) stream.next() // #\( — single char literal
        return 'number' // character literal — amber like numbers per design
      }
      if (next === '.' || next === '+' || next === '-' || next === '=') { stream.next(); return 'reader' }
      if (next === '(') { return 'reader' }
      if (/\d/.test(next ?? '')) { stream.eatWhile(/[0-9A-Za-z]/); return 'number' } // #b101 #xFF #o17 #10a
      stream.eatWhile(/[A-Za-z]/)
      return 'reader'
    }

    // number?
    const rest = ch + stream.current().slice(stream.pos)
    const numMatch = rest.match(/^[+-]?(\d+\/\d+|\d+\.\d*|\.\d+|\d+)([eEsSfFdDlL][+-]?\d+)?/)
    if (numMatch && (numMatch[0].length === rest.length || !SYMBOL_CHARS.test(rest[numMatch[0].length]))) {
      for (let i = 1; i < numMatch[0].length; i++) stream.next()
      return 'number'
    }

    // symbol / keyword / package prefix
    let word = ch
    while (stream.peek() && SYMBOL_CHARS.test(stream.peek()!)) word += stream.next()
    const lower = word.toLowerCase()

    if (state.expectSymbol) { state.expectSymbol = false; return 'symbol' }

    if (lower.startsWith(':') || lower === 't' || lower === 'nil' || lower === '&rest' || lower === '&key' || lower === '&optional' || lower === '&body' || lower === '&aux' || lower === '&allow-other-keys' || lower === '&whole' || lower === '&environment') return 'constant'

    const pkgMatch = word.match(/^([A-Za-z][\w*+/<>=!?$%&.-]*)(::?)/)
    if (pkgMatch && word.length > pkgMatch[0].length) {
      // back up to just after the package prefix
      stream.backUp(word.length - pkgMatch[0].length)
      state.expectSymbol = true
      return 'package'
    }

    if (KEYWORDS.has(lower)) return 'keyword'
    if (TYPES.has(lower)) return 'type'
    if (SPECIAL_VAR_RE.test(word)) return 'var'
    return 'symbol'
  },

  languageData: {
    commentTokens: { line: ';', block: { open: '#|', close: '|#' } },
    closeBrackets: { brackets: ['(', '"'] },
  },
}

export const commonLispLanguage = StreamLanguage.define(clStreamParser)

/* design.md §1.2 syntax theme */
export const clHighlight = HighlightStyle.define([
  { tag: tags.paren, color: '#9AA1B5' },
  { tag: tags.keyword, color: '#A78BFA', fontWeight: '600' },
  { tag: tags.variableName, color: '#8FC3EE' },
  { tag: tags.atom, color: '#F472B6' },
  { tag: tags.string, color: '#4ADE80' },
  { tag: tags.comment, color: '#565D72', fontStyle: 'italic' },
  { tag: tags.number, color: '#FBBF24' },
  { tag: tags.meta, color: '#38BDF8', fontWeight: '600' },
  { tag: tags.namespace, color: '#6EA8DC', fontWeight: '500' },
  { tag: tags.typeName, color: '#5EEAD4' },
])

/** MartingaleCell editor chrome theme (colors per design.md; font size is dynamic). */
export function clEditorTheme(fontSize: number, ligatures: boolean) {
  return EditorView.theme({
    '&': {
      backgroundColor: 'var(--bg-editor)',
      color: 'var(--text-primary)',
      fontSize: `${fontSize}px`,
      height: '100%',
      fontVariantLigatures: ligatures ? 'contextual' : 'none',
    },
    '.cm-content': {
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      lineHeight: '1.6',
      caretColor: 'var(--steel-bright)',
      paddingBottom: '40vh',
    },
    '.cm-cursor, .cm-cursor-primary': { borderLeft: '2px solid var(--steel-bright)' },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-editor)',
      color: 'var(--text-muted)',
      border: 'none',
      borderRight: '1px solid var(--border-hairline)',
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: '11.5px',
      paddingRight: '4px',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(18, 20, 30, 0.5)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-primary)' },
    /* folds (Sprint 20): a quiet marker in the gutter, the placeholder as a dim pill */
    '.cm-foldGutter .cm-gutterElement': { color: 'var(--text-muted)', opacity: '0.55', cursor: 'pointer', fontSize: '10px', paddingLeft: '2px' },
    '.cm-foldGutter .cm-gutterElement:hover': { opacity: '1', color: 'var(--text-primary)' },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--steel-dim)',
      border: '1px solid var(--border-hairline)',
      color: 'var(--text-primary)',
      borderRadius: '4px',
      padding: '0 5px',
      margin: '0 2px',
      cursor: 'pointer',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(110, 168, 220, 0.22) !important',
    },
    '.cm-matchingBracket': { backgroundColor: 'transparent', outline: 'none' },
    /* autocomplete */
    '.cm-tooltip': {
      backgroundColor: 'var(--bg-raised)',
      border: '1px solid var(--border-hairline)',
      borderRadius: '8px',
      color: 'var(--text-primary)',
      boxShadow: '0 24px 64px rgba(0,0,0,.55)',
      overflow: 'hidden',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: '12px',
      maxHeight: '232px',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--steel-dim)',
      color: 'var(--text-primary)',
    },
    '.cm-completionDetail': { color: 'var(--text-muted)', fontStyle: 'normal', fontSize: '11px' },
    '.cm-tooltip.cm-completionInfo': {
      backgroundColor: 'var(--bg-panel)',
      border: '1px solid var(--border-strong)',
      borderRadius: '8px',
      padding: '10px 12px',
      maxWidth: '380px',
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: '11.5px',
      lineHeight: '1.5',
    },
    '.cm-completionIcon': { width: 'auto', paddingRight: '6px', opacity: '1' },
    '.cm-completionIcon::after': { fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", verticalAlign: 'middle' },
    '.cm-completionIcon-function::after': { content: "'fn'", color: 'var(--steel)' },
    '.cm-completionIcon-macro::after': { content: "'mac'", color: 'var(--lisp-purple)' },
    '.cm-completionIcon-variable::after': { content: "'var'", color: 'var(--warning)' },
    '.cm-completionIcon-class::after': { content: "'cls'", color: '#5EEAD4' },
    '.cm-completionIcon-constant::after': { content: "'k'", color: '#F472B6' },
    /* rainbow parens + mismatch (classes applied by decoration plugin) */
    '.cc-rp-1': { color: 'var(--paren-1)', fontWeight: '600' },
    '.cc-rp-2': { color: 'var(--paren-2)', fontWeight: '600' },
    '.cc-rp-3': { color: 'var(--paren-3)', fontWeight: '600' },
    '.cc-rp-4': { color: 'var(--paren-4)', fontWeight: '600' },
    '.cc-rp-5': { color: 'var(--paren-5)', fontWeight: '600' },
    '.cc-rp-6': { color: 'var(--paren-6)', fontWeight: '600' },
    '.cc-rp-inner-1': { backgroundColor: 'rgba(143,195,238,0.12)' },
    '.cc-rp-inner-2': { backgroundColor: 'rgba(167,139,250,0.12)' },
    '.cc-rp-inner-3': { backgroundColor: 'rgba(244,114,182,0.12)' },
    '.cc-rp-inner-4': { backgroundColor: 'rgba(74,222,128,0.12)' },
    '.cc-rp-inner-5': { backgroundColor: 'rgba(251,191,36,0.12)' },
    '.cc-rp-inner-6': { backgroundColor: 'rgba(56,189,248,0.12)' },
    '.cc-rp-error': {
      textDecoration: 'underline wavy var(--error)',
      textDecorationSkipInk: 'none',
    },
    '.cc-electric-match': {
      backgroundColor: 'rgba(110,168,220,0.25)',
      borderRadius: '2px',
    },
  }, { dark: true })
}

export const clSyntaxExtension = [commonLispLanguage, syntaxHighlighting(clHighlight)]
