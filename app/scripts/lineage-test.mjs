/* Cell lineage rules, in Node (Sprint 21): bundles src/session/lineage.ts
 * and checks runs, run index, comparison and the lineage of a cell buffer.
 *
 * Usage: node scripts/lineage-test.mjs   (exit 0 iff every check passes)
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); return ok }

const built = await esbuild.build({
  stdin: {
    contents: "export * from './src/session/lineage'\nexport * from './src/session/diff'\n",
    resolveDir: root, loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
  alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
})
const { lineageOf, runsOf, runIndex, runIndexAll, runLabels, compareRuns, lineageForBuffer, diffLines, diffSummary } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))

const cell = (id, n, extra = {}) => ({ id, n, input: '(f)', status: 'done', values: ['1'], ...extra })
const a1 = cell('a', 1)
const b2 = cell('b', 2)
const a3 = cell('c', 3, { lineage: 'a', values: ['2'] })
const a5 = cell('e', 5, { lineage: 'a', input: '(f 2)', values: ['2', '3'], status: 'error' })
const cells = [a3, b2, a5, a1] /* unsorted on purpose */

check('lineageOf: the first run is its own lineage', lineageOf(a1) === 'a' && lineageOf(a3) === 'a' && lineageOf(b2) === 'b')
const runs = runsOf(cells, 'a')
check('runsOf: the runs of a lineage in evaluation order', runs.map((c) => c.n).join(',') === '1,3,5', runs.map((c) => c.n).join(','))
check('runsOf: a cell without re-runs is its only run', runsOf(cells, 'b').length === 1)
check('runsOf: unknown lineage → empty', runsOf(cells, 'zzz').length === 0)
check('runIndex: run k of N for a middle run', JSON.stringify(runIndex(cells, a3)) === '{"k":2,"total":3}', JSON.stringify(runIndex(cells, a3)))
check('runIndex: the first run', JSON.stringify(runIndex(cells, a1)) === '{"k":1,"total":3}')
check('runIndex: a lone cell is 1 of 1', JSON.stringify(runIndex(cells, b2)) === '{"k":1,"total":1}')

const all = runIndexAll(cells)
check('runIndexAll: every cell gets its k/N in one pass', all.get('a') === '1/3' && all.get('c') === '2/3' && all.get('e') === '3/3' && all.get('b') === '1/1', JSON.stringify([...all]))

const first = compareRuns(undefined, a1)
check('compareRuns: the first run has nothing to compare (all false)', !first.inputChanged && !first.countChanged && !first.statusChanged && first.valueChanged.length === 1 && !first.valueChanged[0])
const second = compareRuns(a1, a3)
check('compareRuns: same input, a changed value', !second.inputChanged && second.valueChanged[0] === true && !second.countChanged && !second.statusChanged, JSON.stringify(second))
const third = compareRuns(a3, a5)
check('compareRuns: changed input, an extra value (count changed, first value same), status changed', third.inputChanged && third.valueChanged.join(',') === 'false,true' && third.countChanged && third.statusChanged, JSON.stringify(third))
check('compareRuns: input compared trimmed', !compareRuns(cell('x', 1, { input: ' (f)\n' }), cell('y', 2, { input: '(f)' })).inputChanged)

const buffers = [
  { id: 'buf-1', origin: { type: 'scratch' } },
  { id: 'buf-2', origin: { type: 'cell', cellId: 'c' } },
  { id: 'buf-3', origin: { type: 'cell', cellId: 'gone' } },
  { id: 'buf-4', origin: { type: 'project', path: 'x.lisp' } },
]
check('lineageForBuffer: a buffer opened from a re-run cell carries that cell\'s lineage (the first run)', lineageForBuffer(buffers, cells, 'buf-2') === 'a')
check('lineageForBuffer: a scratch or project buffer has none', lineageForBuffer(buffers, cells, 'buf-1') === undefined && lineageForBuffer(buffers, cells, 'buf-4') === undefined)
check('lineageForBuffer: the cell is gone → the recorded cell id still names the lineage', lineageForBuffer(buffers, cells, 'buf-3') === 'gone')
check('lineageForBuffer: no buffer id / unknown buffer → none', lineageForBuffer(buffers, cells, undefined) === undefined && lineageForBuffer(buffers, cells, 'nope') === undefined)

const labels = runLabels(cells)
check('runLabels: k, total and the first run\'s cell number', JSON.stringify(labels.get('e')) === '{"k":3,"total":3,"firstN":1}' && JSON.stringify(labels.get('b')) === '{"k":1,"total":1,"firstN":2}', JSON.stringify([...labels]))

/* line diff (Sprint 22) */
const d1 = diffLines('(defun f (x)\n  (* x 2))', '(defun f (x)\n  (* x 3))')
check('diffLines: one changed line → same, del, add', d1.map((l) => l.kind).join(',') === 'same,del,add' && d1[1].text === '  (* x 2))' && d1[2].text === '  (* x 3))', JSON.stringify(d1))
check('diffLines: identical inputs → all same', diffLines('(a)\n(b)', '(a)\n(b)\n').every((l) => l.kind === 'same'))
const d2 = diffLines('(a)\n(b)\n(c)', '(a)\n(c)')
check('diffLines: a removed middle line', d2.map((l) => l.kind).join(',') === 'same,del,same' && d2[1].text === '(b)', JSON.stringify(d2))
const d3 = diffLines('(a)', '(z)\n(a)\n(q)')
check('diffLines: lines added around', d3.map((l) => l.kind + ':' + l.text).join(' ') === 'add:(z) same:(a) add:(q)', JSON.stringify(d3))
check('diffLines: empty vs text → all add; text vs empty → all del', diffLines('', '(a)\n(b)').filter((l) => l.kind === 'add').length === 2 && diffLines('(a)', '').map((l) => l.kind).join() === 'del,add' && diffLines('(a)', '')[1].text === '')
check('diffSummary counts', JSON.stringify(diffSummary(d3)) === '{"added":2,"removed":0}')

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} check(s) failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
