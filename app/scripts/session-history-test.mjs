/* Session-box ↑/↓ history rules, in Node (Sprint 20): bundles
 * src/session/history.ts and checks push / recall / restore.
 *
 * Usage: node scripts/session-history-test.mjs   (exit 0 iff every check passes)
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); return ok }

const built = await esbuild.build({
  entryPoints: [path.join(root, 'src', 'session', 'history.ts')],
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
  alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
})
const { pushHistory, recallStep, sanitizeHistory, filterHistory, historyEntries, filterEntries, HISTORY_CAP } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))

/* push */
let h = pushHistory([], '(+ 1 2)')
h = pushHistory(h, '(defun f () 1)')
check('newest entry first', h[0] === '(defun f () 1)' && h[1] === '(+ 1 2)', JSON.stringify(h))
check('an immediate repeat is not duplicated', pushHistory(h, '(defun f () 1)').length === 2)
check('the same form later is pushed again', pushHistory(pushHistory(h, '(g)'), '(defun f () 1)').length === 4)
check('blank input is ignored', pushHistory(h, '   ').length === 2)
check('input is trimmed', pushHistory(h, '  (h) \n')[0] === '(h)')
check('the input list is not mutated', h.length === 2)
let big = []
for (let i = 0; i < HISTORY_CAP + 20; i++) big = pushHistory(big, `(f ${i})`)
check(`capped at ${HISTORY_CAP}, newest kept`, big.length === HISTORY_CAP && big[0] === `(f ${HISTORY_CAP + 19})`, `${big.length} ${big[0]}`)

/* recall */
const live = { idx: -1, text: '', atStart: true }
let s = recallStep(h, live, 1)
check('↑ from an empty input recalls the newest entry', s && s.idx === 0 && s.text === '(defun f () 1)', JSON.stringify(s))
s = recallStep(h, { idx: 0, text: h[0], atStart: true }, 1)
check('↑ again walks to the older entry', s && s.idx === 1 && s.text === '(+ 1 2)', JSON.stringify(s))
check('↑ at the oldest entry is a no-op (falls through)', recallStep(h, { idx: 1, text: h[1], atStart: true }, 1) === null)
s = recallStep(h, { idx: 1, text: h[1], atStart: true }, -1)
check('↓ walks back to the newer entry', s && s.idx === 0 && s.text === h[0], JSON.stringify(s))
s = recallStep(h, { idx: 0, text: h[0], atStart: true }, -1)
check('↓ past the newest entry returns to a live empty input', s && s.idx === -1 && s.text === '', JSON.stringify(s))
check('↓ on the live input falls through', recallStep(h, live, -1) === null)
check('↑ with the caret not at the start falls through', recallStep(h, { idx: -1, text: '(a', atStart: false }, 1) === null)
check('↑ in a multi-line input falls through (arrows move between lines)', recallStep(h, { idx: -1, text: '(a\n b)', atStart: true }, 1) === null)
check('↑ keeps walking once started even with a multi-line entry shown', recallStep(['(x)', '(a\n b)'], { idx: 0, text: '(x)', atStart: false }, 1)?.text === '(a\n b)')
check('↑ on an empty history falls through', recallStep([], live, 1) === null)

/* restore */
check('restore: non-arrays become an empty list', sanitizeHistory(undefined).length === 0 && sanitizeHistory('x').length === 0)
check('restore: non-strings and blanks are dropped, adjacent repeats collapsed', JSON.stringify(sanitizeHistory(['(a)', 3, '', '(a)', ' (b) '])) === JSON.stringify(['(a)', '(b)']))
check('restore: capped', sanitizeHistory(Array.from({ length: 500 }, (_, i) => `(f ${i})`)).length === HISTORY_CAP)

/* search (Sprint 21) */
const hist = ['(defun g () 2)', '(list :a 1)', '(defun f () 1)', '(+ 1 2)']
check('filterHistory: substring, case-insensitive, newest first', JSON.stringify(filterHistory(hist, 'DEFUN')) === JSON.stringify(['(defun g () 2)', '(defun f () 1)']))
check('filterHistory: an empty query lists the newest entries', JSON.stringify(filterHistory(hist, '  ')) === JSON.stringify(hist))
check('filterHistory: capped', filterHistory(hist, '', 2).length === 2 && filterHistory(hist, '(', 3).length === 3)
check('filterHistory: no match → empty', filterHistory(hist, 'zzz').length === 0)

/* Sprint 31: Ctrl+R over cell inputs */
const cellsFx = [
  { n: 1, input: '(defvar *runs* 0)', kind: 'eval' },
  { n: 2, input: '(incf *runs*)' },
  { n: 3, input: '(incf *runs*)' },
  { n: 4, input: '', kind: 'project' },
  { n: 5, input: '(+ 40 2)' },
]
const ents = historyEntries(['(+ 40 2)', '(list :remembered 42)'], cellsFx)
check('entries: cells newest first, one per distinct input with the newest cell number, then box-only history',
  ents.map((e) => `${e.text}${e.cell !== undefined ? '@' + e.cell : ''}`).join('|') === '(+ 40 2)@5|(incf *runs*)@3|(defvar *runs* 0)@1|(list :remembered 42)',
  JSON.stringify(ents))
check('project cells and blank inputs are skipped', !ents.some((e) => e.cell === 4))
check('filterEntries keeps list order and the cell numbers', filterEntries(ents, 'runs').map((e) => e.cell).join(',') === '3,1')
check('filterEntries with an empty query lists the first entries, capped', filterEntries(ents, '', 2).length === 2 && filterEntries(ents, '', 2)[0].cell === 5)
check('no cells: entries are the history alone', historyEntries(['(a)', '(b)'], []).map((e) => e.text).join('|') === '(a)|(b)')

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} check(s) failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
