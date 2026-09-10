/* Lisp fold ranges, in Node (Sprint 20): bundles src/editor/fold.ts with
 * @codemirror/state + @codemirror/language (DOM-free) and checks the
 * range rules on text, then that the fold service folds through a real
 * EditorState and that the fold state round-trips through toJSON/fromJSON
 * (what the per-buffer persistence relies on).
 *
 * Usage: node scripts/fold-test.mjs   (exit 0 iff every check passes)
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); return ok }

const built = await esbuild.build({
  stdin: {
    contents: "export { foldRangeForLine, matchingClose, lispFoldService, topLevelFoldRanges } from './src/editor/fold'\nexport { classifyChars } from './src/search/workspace-search'\nexport { EditorState } from '@codemirror/state'\nexport { foldable, foldEffect, foldState, foldedRanges, codeFolding } from '@codemirror/language'\n",
    resolveDir: root, loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
  alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
})
const { foldRangeForLine, matchingClose, lispFoldService, topLevelFoldRanges, classifyChars, EditorState, foldable, foldEffect, foldState, foldedRanges, codeFolding } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))

/* line helpers over plain text */
const lines = (src) => { const out = []; let at = 0; for (const l of src.split('\n')) { out.push({ from: at, to: at + l.length }); at += l.length + 1 } return out }
const range = (src, n) => { const l = lines(src)[n]; return foldRangeForLine(src, l.from, l.to) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const defun = '(defun sq (x)\n  (* x x))\n\n(defun one () 1)\n'
let r = range(defun, 0)
check('a multi-line defun folds from the end of its first line to just before its closing paren', same(r, { from: 13, to: defun.indexOf('x x)') + 4 }), JSON.stringify(r))
check('the visible text after folding keeps the closing paren', r && defun.slice(0, r.from) + '…' + defun.slice(r.to) === '(defun sq (x)…)\n\n(defun one () 1)\n', r && defun.slice(0, r.from) + '…' + defun.slice(r.to))
check('a body line inside the form has no fold of its own', range(defun, 1) === null)
check('a blank line has no fold', range(defun, 2) === null)
check('a one-line form has no fold', range(defun, 3) === null)

const nested = '(let ((a 1)\n      (b 2))\n  (list a\n        b))\n'
r = range(nested, 0)
check('the OUTERMOST form opening on the line wins (let, not its binding list)', r && r.to === nested.lastIndexOf(')'), JSON.stringify(r))
r = range(nested, 2)
check('an inner form that opens on a later line folds on that line', r && r.from === nested.indexOf('(list a') + 7 && r.to === nested.lastIndexOf(')') - 1, JSON.stringify(r))

const twoOnLine = '(one) (defun two ()\n  2)\n'
r = range(twoOnLine, 0)
check('a one-line form before a multi-line one is skipped; the multi-line one folds', r && r.to === twoOnLine.lastIndexOf(')'), JSON.stringify(r))

const tricky = '(defun s ()\n  (format t ")(" #\\( #\\) ; (not code)\n  #| ( |#\n  1))\n'
r = range(tricky, 0)
check('parens in strings, character literals, line and block comments do not count', r && r.to === tricky.lastIndexOf(')'), JSON.stringify(r))
check('matchingClose ignores those too', matchingClose(tricky, classifyChars(tricky), 0) === tricky.lastIndexOf(')'))

check('an unbalanced form (missing close) has no fold', range('(defun broken (\n  1\n', 0) === null)
check('a form whose only hidden text would be whitespace has no fold', range('(a\n)', 0) === null && range('(a\n   \n)', 0) === null)
check('a form hiding real text folds even when the close paren has its own line', same(range('(a\n  b\n)', 0), { from: 2, to: 7 }), JSON.stringify(range('(a\n  b\n)', 0)))

/* Sprint 22: block comments and top-level folds */
const withComment = '#| a long\n   comment |#\n(defun f ()\n  1)\n;; #| not a block\n'
r = range(withComment, 0)
check('a multi-line #| |# block comment folds from the end of its first line, keeping |# visible', same(r, { from: 9, to: withComment.indexOf('|#') }), JSON.stringify(r))
check('a line inside the comment has no fold; the defun after it folds as before', range(withComment, 1) === null && range(withComment, 2)?.to === withComment.indexOf('1)') + 1)
check('a one-line block comment or #| inside a ; comment has no fold', range('#| one line |#\n(a)', 0) === null && range(withComment, 4) === null)
const top = topLevelFoldRanges('(defun a ()\n  (let ((x 1))\n    x))\n\n(defvar *b* 1)\n(defun c ()\n  2)\n')
check('topLevelFoldRanges: one range per multi-line top-level form, none for the inner let or the one-liner', top.length === 2 && top[0].from === 11 && top[1].from === '(defun a ()\n  (let ((x 1))\n    x))\n\n(defvar *b* 1)\n(defun c ()'.length, JSON.stringify(top))
check('topLevelFoldRanges: stops at an unbalanced form', topLevelFoldRanges('(defun a ()\n  1)\n(broken (\n').length === 1)

/* the service through a real EditorState */
const ext = [codeFolding(), lispFoldService]
let st = EditorState.create({ doc: defun, extensions: ext })
const fr = foldable(st, 0, 13)
check('foldable() on the defun line reports the same range', same(fr, { from: 13, to: defun.indexOf('x x)') + 4 }), JSON.stringify(fr))
check('foldable() on the one-line defun reports nothing', foldable(st, defun.indexOf('(defun one'), defun.length - 1) === null)
st = st.update({ effects: foldEffect.of(fr) }).state
const folded = []
foldedRanges(st).between(0, st.doc.length, (from, to) => { folded.push({ from, to }) })
check('foldEffect folds it', same(folded, [fr]), JSON.stringify(folded))

/* the fold state round-trips through JSON, as the per-buffer persistence does */
const json = st.toJSON({ fold: foldState })
const back = EditorState.fromJSON(json, { extensions: ext }, { fold: foldState })
const folded2 = []
foldedRanges(back).between(0, back.doc.length, (from, to) => { folded2.push({ from, to }) })
check('the fold survives toJSON / fromJSON', same(folded2, [fr]), JSON.stringify(folded2))
const edited = back.update({ changes: { from: 0, insert: ';; note\n' } }).state
const folded3 = []
foldedRanges(edited).between(0, edited.doc.length, (from, to) => { folded3.push({ from, to }) })
check('the fold moves with an edit above it', same(folded3, [{ from: fr.from + 8, to: fr.to + 8 }]), JSON.stringify(folded3))

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} check(s) failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
