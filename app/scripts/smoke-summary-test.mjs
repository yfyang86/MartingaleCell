/* smoke-summary.mjs on a synthetic report (Sprint 26).
 * Usage: node scripts/smoke-summary-test.mjs   (exit 0 iff every check passes) */
import { summarize } from './smoke-summary.mjs'

const results = []
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); return ok }

const report = {
  scenarios: [
    { name: 'debugger', seconds: 15.2, checks: [{ label: 'a', ok: true }, { label: 'b', ok: true }], skipped: null },
    { name: 'history', seconds: 20.7, checks: [{ label: 'chips', ok: true }, { label: 'view shows three runs', ok: false, detail: 'cols=2 values=1,2\nmore' }], skipped: null, screenshot: '/x/dist/smoke-failure-history.png' },
    { name: 'sbcl', seconds: 0, checks: [], skipped: 'SBCL artifacts not in public/sbcl/' },
  ],
  passed: 3, failed: 1, skipped: 1,
}
const md = summarize(report)
check('headline: totals and a red mark when something failed', md.startsWith('### Browser smoke — ❌ 3 passed, 1 failed, 1 skipped (35.9 s)'), md.split('\n')[0])
check('table: one row per scenario with checks, time and result', md.includes('| debugger | 2 | 15.2 s | ✅ |') && md.includes('| history | 2 | 20.7 s | ❌ 1 failed |') && md.includes('| sbcl | 0 | 0.0 s | skipped — SBCL artifacts not in public/sbcl/ |'), md)
check('failures: label, first detail line, screenshot name', md.includes('- `history`: view shows three runs — cols=2 values=1,2 (screenshot: `smoke-failure-history.png`)'), md)
check('slowest scenario named (skipped ones excluded)', md.includes('Slowest scenario: `history` (20.7 s).'))
const green = summarize({ scenarios: [{ name: 'landing', seconds: 90, checks: [{ label: 'ok', ok: true }], skipped: null }], passed: 1, failed: 0, skipped: 0 })
check('a green report: green mark, minutes formatting, no failures section', green.startsWith('### Browser smoke — ✅ 1 passed, 0 failed, 0 skipped (1 min 30 s)') && !green.includes('**Failures**'), green.split('\n')[0])
check('totals are derived when the report lacks them', summarize({ scenarios: [{ name: 'x', seconds: 1, checks: [{ label: 'a', ok: false }], skipped: null }] }).includes('0 passed, 1 failed, 0 skipped'))

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} check(s) failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
