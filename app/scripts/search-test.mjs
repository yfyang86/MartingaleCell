/* Workspace search matcher test: bundles src/search/workspace-search.ts
 * with esbuild and checks plain / case / regex / whole-word / symbols-only
 * matching, grouping, source merging and the cap.
 *
 * Usage: node scripts/search-test.mjs   (exit 0 iff every check passes)
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); return ok }

const built = await esbuild.build({
  entryPoints: [path.join(root, 'src/search/workspace-search.ts')],
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
  alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
})
const { searchSources, mergeSources, classifyChars, compileQuery, replaceInText, replaceInSources } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))

const a = `;;; plot.lisp — defun in a comment
(defpackage :demo (:use :cl))
(in-package :demo)

(defun plot (fig)
  "Render FIG; see (defun plot-many) for lists."
  (plot-one fig))
#| a block comment mentioning (defun plot-inside) that
   spans #| nested |# two lines |#
(defun plot-many (figs) (mapc #'plot figs))
(defvar *plot-count* 0)
(format t "plot ~A~%" #\\" ) ; a #\\" char must not open a string
(defun done () 'plot)
`
const b = `(defun helper () (PLOT nil))\n(defun plotter () 1)\n`
const sources = [{ path: 'src/plot.lisp', content: a, kind: 'project' }, { path: 'scratch.lisp', content: b, kind: 'buffer', bufferId: 'b1' }]
const flat = (r) => r.files.flatMap((f) => f.matches.map((m) => `${f.path}:${m.line}:${m.col}`))

let r = searchSources(sources, 'plot', {})
check('plain, case-insensitive: matches in both files, grouped by path', r.files.length === 2 && r.files[0].path === 'src/plot.lisp' && r.files[1].bufferId === 'b1', JSON.stringify(flat(r)))
check('line and column are 1-based and the line text is attached', r.files[0].matches[0].line === 1 && r.files[0].matches[0].col === 5 && r.files[0].matches[0].lineText === ';;; plot.lisp — defun in a comment' && r.files[0].matches[0].from === 4 && r.files[0].matches[0].to === 8, JSON.stringify(r.files[0].matches[0]))
check('totalMatches counts every occurrence', r.totalMatches === flat(r).length && r.totalMatches === 12, String(r.totalMatches))

r = searchSources(sources, 'PLOT', { caseSensitive: true })
check('case-sensitive: only the upper-case call in the buffer', flat(r).join() === 'scratch.lisp:1:19', JSON.stringify(flat(r)))

r = searchSources(sources, 'plot', { wholeWord: true })
check('whole word: plot but not plot.lisp / plot-many / *plot-count* / plotter', flat(r).join() === 'src/plot.lisp:5:8,src/plot.lisp:10:33,src/plot.lisp:12:12,src/plot.lisp:13:17,scratch.lisp:1:19', JSON.stringify(flat(r)))

r = searchSources(sources, '\\(defun [a-z-]+', { regex: true })
check('regex: every (defun heading, including those in comments and strings when not symbols-only', r.totalMatches === 7, JSON.stringify(flat(r)))

r = searchSources(sources, '\\(defun [a-z-]+', { regex: true, symbolsOnly: true })
check('symbols only: skips the ; comment, the docstring and the nested block comment', flat(r).join() === 'src/plot.lisp:5:1,src/plot.lisp:10:1,src/plot.lisp:13:1,scratch.lisp:1:1,scratch.lisp:2:1', JSON.stringify(flat(r)))

r = searchSources(sources, "'plot", { symbolsOnly: true })
check('symbols only: a #\\" character literal does not swallow the rest of the file as a string', flat(r).join() === 'src/plot.lisp:10:32,src/plot.lisp:13:16', JSON.stringify(flat(r)))

const cls = classifyChars('(a "b;c" #| d "e" |# ; f\n g)')
check('classifyChars: code / string / block / line classes', cls[0] === 0 && cls[3] === 1 && cls[5] === 1 && cls[9] === 3 && cls[14] === 3 && cls[21] === 2 && cls[cls.length - 2] === 0, Array.from(cls).join(''))

r = searchSources(sources, '[unclosed', { regex: true })
check('invalid regex reports an error instead of throwing', r.error && r.files.length === 0, r.error)
check('empty query is an error too', typeof compileQuery('', {}) === 'string')

r = searchSources(sources, 'plot', {}, 3)
check('cap: stops at N matches and says so', r.totalMatches === 3 && r.truncated === true && r.files.length === 1 && r.files[0].matches.length === 3, JSON.stringify({ total: r.totalMatches, truncated: r.truncated }))

r = searchSources(sources, 'x*', { regex: true })
check('an empty-width match never loops forever', Array.isArray(r.files))

const merged = mergeSources(
  [{ id: 'b1', name: 'scratch.lisp', content: 'S' }, { id: 'b2', name: 'a.lisp', content: 'UNSAVED', origin: { type: 'project', path: 'src/a.lisp' } }],
  [{ path: 'src/a.lisp', content: 'ON DISK' }, { path: 'src/b.lisp', content: 'B' }],
)
check('mergeSources: buffer content wins for open project files; other files from disk; scratch by name', merged.length === 3 && merged.find((s) => s.path === 'src/a.lisp').content === 'UNSAVED' && merged.find((s) => s.path === 'src/a.lisp').bufferId === 'b2' && merged.find((s) => s.path === 'src/b.lisp').kind === 'project' && merged.find((s) => s.path === 'scratch.lisp').kind === 'buffer', JSON.stringify(merged))

/* replace (Sprint 13) */
const rl = replaceInText('plot (plot-many) "plot" ; plot', compileQuery('plot', {}), 'draw', {})
check('replace literal: every hit, count', rl.text === 'draw (draw-many) "draw" ; draw' && rl.count === 4, JSON.stringify(rl))
const rw = replaceInText('plot (plot-many) "plot" ; plot', compileQuery('plot', { wholeWord: true }), 'draw', { wholeWord: true })
check('replace whole-symbol: plot-many untouched', rw.text === 'draw (plot-many) "draw" ; draw' && rw.count === 3, JSON.stringify(rw))
const rs = replaceInText('plot (plot-many) "plot" ; plot', compileQuery('plot', { symbolsOnly: true }), 'draw', { symbolsOnly: true })
check('replace code-only: the string and the comment are untouched', rs.text === 'draw (draw-many) "plot" ; plot' && rs.count === 2, JSON.stringify(rs))
const rr = replaceInText('(defun f1 () 1)\n(defun f2 () 2)', compileQuery('\\(defun (f\\d)', { regex: true }), '(defun new-$1', { regex: true })
check('replace regex: $1 expands per match', rr.text === '(defun new-f1 () 1)\n(defun new-f2 () 2)' && rr.count === 2, JSON.stringify(rr))
const rd = replaceInText('price', compileQuery('price', {}), 'cost $1', {})
check('replace literal: a $ in the replacement stays literal', rd.text === 'cost $1', JSON.stringify(rd))
const rn = replaceInText('nothing here', compileQuery('zzz', {}), 'x', {})
check('replace with no match: text unchanged, count 0', rn.text === 'nothing here' && rn.count === 0)
const rc = replaceInText('Plot plot PLOT', compileQuery('plot', { caseSensitive: true }), 'p', { caseSensitive: true })
check('replace case-sensitive: only the exact case', rc.text === 'Plot p PLOT' && rc.count === 1, JSON.stringify(rc))
const rsrc = replaceInSources(sources, 'plot', { wholeWord: true, symbolsOnly: true }, 'draw')
check('replaceInSources: only sources with hits, totals add up', rsrc.files.length === 2 && rsrc.total === rsrc.files.reduce((n, f) => n + f.count, 0) && rsrc.files[1].bufferId === 'b1' && /\(draw nil\)/.test(rsrc.files[1].text), JSON.stringify(rsrc.files.map((f) => [f.path, f.count])))
check('replaceInSources: invalid regex reports an error', replaceInSources(sources, '[', { regex: true }, 'x').error !== undefined)

console.log(results.join('\n'))
const failed = results.filter((x) => x.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} check(s) failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
