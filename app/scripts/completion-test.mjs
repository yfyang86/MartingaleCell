/* Unit test of the completion logic (src/components/ide/completion.ts):
 * context analysis, ranking, locals, live-symbol registration. The
 * CodeMirror-facing source needs an editor; the exported helpers are
 * pure and tested here. Exit 0 = pass.
 *
 *   node scripts/completion-test.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entry = path.join(os.tmpdir(), `martingalecell-completion-entry-${process.pid}.ts`)
const outfile = path.join(os.tmpdir(), `martingalecell-completion-bundle-${process.pid}.mjs`)
fs.writeFileSync(entry, `export { analyzeContext, scoreMatch, localsInForm, bufferSymbols, parseSymbolDump, registerLiveSymbols, haveLiveSymbols, liveCompletionLabels } from ${JSON.stringify(path.join(root, 'src/components/ide/completion'))}\n`)
esbuild.buildSync({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' })
const mod = await import(outfile)

let fails = 0
const check = (ok, label) => { console.log((ok ? '✓ ' : '✗ ') + label); if (!ok) fails++ }

/* ---- context analysis ---- */
{
  const doc = '(defun f (x) (+ x inc))'
  const info = mod.analyzeContext(doc, doc.indexOf('inc') + 3)
  check(info.position === 'argument' && info.prefix === 'inc', 'argument position: mid-symbol prefix')
}
{
  const doc = '(ma'
  const info = mod.analyzeContext(doc, 3)
  check(info.position === 'head' && info.prefix === 'ma', 'head position right after the open paren')
}
{
  const doc = "(mapcar #'ident"
  const info = mod.analyzeContext(doc, doc.length)
  check(info.position === 'function-quote' && info.prefix === 'ident', "#' position")
}
{
  const doc = '(remove-if-not '
  const info = mod.analyzeContext(doc, doc.length)
  check(info.position === 'argument' && info.prefix === '', 'argument position with empty prefix (explicit trigger)')
}
{
  const doc = '(format t "x") (sb-ext:quit-now'
  const info = mod.analyzeContext(doc, doc.length)
  check(info.position === 'package-prefix' && info.pkg === 'sb-ext' && info.prefix === 'quit-now', 'package-qualified prefix')
}
{
  const doc = '(make-instance \'foo :initar'
  const info = mod.analyzeContext(doc, doc.length)
  check(info.position === 'keyword' && info.prefix === 'initar', 'keyword position after a lone colon')
}

/* ---- ranking ---- */
{
  const s = mod.scoreMatch
  check(s('mapcar', 'map') > s('make-instance', 'map'), 'prefix match outranks later word-start')
  check(s('with-output-to-string', 'out') > 0, 'separator word-start matches (out in with-OUT-put…)')
  check(s('remove-if', 'rif') > 0, 'subsequence fuzzy match (rif → remove-if)')
  check(s('mapcar', 'xyz') < 0, 'no match is negative')
}

/* ---- locals ---- */
{
  const form = '(let ((width 10) (height 20)) (+ wid'
  const locals = mod.localsInForm(form, form.length)
  const names = locals.map((l) => l.label)
  check(names.includes('width') && names.includes('height'), 'let bindings offered as locals')
  check(locals.every((l) => l.boost >= 4), 'locals carry the highest boost')
}
{
  const form = '(defun area (radius pi-ish) (* radiu'
  const names = mod.localsInForm(form, form.length).map((l) => l.label)
  check(names.includes('radius') && names.includes('pi-ish'), 'lambda-list parameters offered as locals')
  check(!names.some((n) => n.startsWith('&')), '&key/&optional markers not offered')
}

/* ---- buffer symbols ---- */
{
  const doc = '(defun sq (x) (* x x))\n(defparameter *size* 3)\n'
  const syms = mod.bufferSymbols(doc)
  const sq = syms.find((s) => s.label === 'sq')
  const size = syms.find((s) => s.label === '*size*')
  check(sq && sq.type === 'function', 'buffer defun typed as function')
  check(size && size.type === 'variable', 'buffer defparameter typed as variable')
}

/* ---- live symbols ---- */
{
  check(!mod.haveLiveSymbols(), 'no live symbols before registration')
  const printed = '((CAR 0) (CDR 0) (DOLIST 1) (*STANDARD-OUTPUT* 2) (HASH-TABLE 3) (FOO 4))'
  const dump = mod.parseSymbolDump(printed)
  check(dump.length === 6, 'symbol dump parsed: 6 entries')
  check(dump[0].name === 'car' && dump[0].kind === 'function', 'kind codes decoded: function')
  check(dump[2].kind === 'macro' && dump[3].kind === 'variable' && dump[4].kind === 'class', 'kind codes decoded: macro/variable/class')
  mod.registerLiveSymbols(dump)
  check(mod.haveLiveSymbols(), 'live symbols registered')
}


{
  /* SB-MOP live dump: qualified names parse, register, and match after the ':' */
  const dump = mod.parseSymbolDump('((CAR 0) (SB-MOP:SLOT-VALUE-USING-CLASS 0) (SB-MOP:SLOT-EXISTS-P-USING-CLASS 0))')
  check(dump.length === 3 && dump[1].name === 'sb-mop:slot-value-using-class', 'qualified symbol dump parses')
  mod.registerLiveSymbols(dump)
  check(mod.scoreMatch('sb-mop:slot-value-using-class', 'slot-value-u') >= 600, 'bare prefix matches after sb-mop: separator')
  check(mod.scoreMatch('sb-mop:slot-value-using-class', 'sb-mop:slot') >= 700, 'package-prefixed exact-prefix scores high')
}

{
  /* Sprint 35 (review blocker 2): a symbol in both the dump and the curated
   * list used to be dropped from both; the curated entry must survive. */
  const dump = mod.parseSymbolDump('((DEFUN 1) (FORMAT 0) (CAR 0) (MY-OWN-FN 0))')
  mod.registerLiveSymbols(dump)
  const labels = mod.liveCompletionLabels()
  check(labels.includes('defun') && labels.includes('format'), 'curated symbols present in the dump are still offered')
  check(labels.includes('my-own-fn'), 'dump-only symbol offered')
  check(labels.includes('loop'), 'curated symbol absent from the dump still offered')
  check(labels.filter((l) => l === 'defun').length === 1, 'curated symbol offered once, not twice')
}

console.log(fails ? `\nFAIL: ${fails} check(s)` : '\nPASS: completion logic')
process.exit(fails ? 1 : 0)
