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
const { pushHistory, recallStep, sanitizeHistory, HISTORY_CAP } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))

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

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} check(s) failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
