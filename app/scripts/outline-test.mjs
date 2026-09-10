/* Outline scanner test: bundles src/outline/outline.ts with esbuild and
 * checks definition heads at any depth, strings/comments skipped, setf
 * heads, defstruct option lists, package prefixes, and index pruning.
 *
 * Usage: node scripts/outline-test.mjs   (exit 0 iff every check passes)
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); return ok }

const built = await esbuild.build({
  entryPoints: [path.join(root, 'src/outline/outline.ts')],
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
  alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
})
const { scanDefinitions, canonicalName, pruneDefinitions, mergeProjectOutline } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))

const src = `;;;; (defun in-a-comment ())
(defpackage :demo (:use :cl))
(in-package :demo)

(defun fib-rec (n)
  "Naive; see (defun fib-memo) below."
  (if (< n 2) n (+ (fib-rec (- n 1)) (fib-rec (- n 2)))))

(let ((memo (make-hash-table)))
  (defun fib-memo (n)
    (gethash n memo)))
#| (defvar *in-block* 1) |#
(defvar *count* 0)
(defstruct (pt (:constructor mk-pt)) a b)
(defclass point () ((x :initarg :x)))
(defmethod (setf px) (v (p point)) v)
(defmethod demo::area ((p point)) 0)
(define-condition my-error (error) ())
(deftype small () '(integer 0 9))
( defmacro   with-x (&body b) \`(progn ,@b))
(format t "(defparameter *in-string* 1)")
`
const d = scanDefinitions(src)
const names = d.map((e) => `${e.kind}:${e.name}`)
check('every real definition, in source order, at any depth', names.join(',') === 'defpackage:DEMO,defun:FIB-REC,defun:FIB-MEMO,defvar:*COUNT*,defstruct:PT,defclass:POINT,defmethod:(SETF PX),defmethod:AREA,define-condition:MY-ERROR,deftype:SMALL,defmacro:WITH-X', names.join(','))
check('nothing from the line comment, the docstring, the block comment or the string', !names.some((n) => /IN-A-COMMENT|FIB-MEMO\)|IN-BLOCK|IN-STRING/.test(n)))
const fibMemo = d.find((e) => e.name === 'FIB-MEMO')
check('line/col/offset point at the opening paren (fib-memo inside the let: line 10, col 3)', fibMemo.line === 10 && fibMemo.col === 3 && src.slice(fibMemo.offset, fibMemo.offset + 6) === '(defun', JSON.stringify(fibMemo))
check('labels keep the written form; names are canonical', d.find((e) => e.name === '(SETF PX)').label === '(setf px)' && d.find((e) => e.name === 'AREA').label === 'demo::area' && d.find((e) => e.name === 'PT').label === 'pt' && d.find((e) => e.name === 'WITH-X').col === 1, JSON.stringify(d.map((e) => e.label)))
check('canonicalName: package prefixes, keywords, setf heads', canonicalName('cl-plot:figure') === 'FIGURE' && canonicalName(':demo') === 'DEMO' && canonicalName('(setf foo)') === '(SETF FOO)' && canonicalName("#'bar") === 'BAR')
check('empty source → no entries', scanDefinitions('').length === 0 && scanDefinitions('; nothing').length === 0)

const kept = pruneDefinitions([
  { name: 'A', bufferId: 'b1' }, { name: 'B', bufferId: 'gone' }, { name: 'C', bufferId: '', cellN: 3 }, { name: 'D', bufferId: '', cellN: 99 },
], new Set(['b1']), new Set([3]))
check('pruneDefinitions keeps live buffers and cells only', kept.map((k) => k.name).join() === 'A,C', JSON.stringify(kept))

const po = mergeProjectOutline(
  [{ path: 'src/b.lisp', content: '(defun b1 () 1)\n(defun b2 () 2)\n' }, { path: 'src/a.lisp', content: '(defclass a-class () ())\n' }, { path: 'src/empty.lisp', content: '; nothing\n' }],
  [{ name: 'B1', kind: 'defun', path: 'src/b.lisp', line: 1, col: 1 }, { name: 'FROM-ASD', kind: 'defsystem', path: 'demo.asd', line: 3, col: 1 }],
)
check('mergeProjectOutline: files sorted, empty files dropped, loaded entries ticked, unloaded not', po.map((f) => f.path).join() === 'src/a.lisp,src/b.lisp,demo.asd' && po[1].entries.map((e) => `${e.name}:${e.loaded}`).join() === 'B1:true,B2:false' && po[0].entries[0].loaded === false, JSON.stringify(po))
check('mergeProjectOutline: a loaded definition in a file the scan did not cover is still listed', po[2].entries.length === 1 && po[2].entries[0].name === 'FROM-ASD' && po[2].entries[0].loaded === true && po[2].entries[0].offset === -1, JSON.stringify(po[2]))

console.log(results.join('\n'))
const failed = results.filter((x) => x.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} check(s) failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
