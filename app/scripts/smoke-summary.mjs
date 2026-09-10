/* Markdown summary of a browser-smoke JSON report (Sprint 26): totals, a
 * per-scenario table, failures with their details, skips. The CI smoke job
 * appends it to $GITHUB_STEP_SUMMARY whatever the outcome.
 *
 * Usage: node scripts/smoke-summary.mjs dist/smoke-report.json [>> "$GITHUB_STEP_SUMMARY"]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function summarize(report) {
  const scenarios = report.scenarios ?? []
  const passed = report.passed ?? scenarios.reduce((n, s) => n + s.checks.filter((c) => c.ok).length, 0)
  const failed = report.failed ?? scenarios.reduce((n, s) => n + s.checks.filter((c) => !c.ok).length, 0)
  const skipped = report.skipped ?? scenarios.filter((s) => s.skipped).length
  const total = scenarios.reduce((n, s) => n + (s.seconds || 0), 0)
  const mmss = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s` : `${sec.toFixed(1)} s`)
  const lines = []
  lines.push(`### Browser smoke — ${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed, ${skipped} skipped (${mmss(total)})`)
  lines.push('')
  lines.push('| Scenario | Checks | Time | Result |')
  lines.push('|---|---:|---:|---|')
  for (const s of scenarios) {
    const bad = s.checks.filter((c) => !c.ok).length
    const result = s.skipped ? `skipped — ${s.skipped}` : bad ? `❌ ${bad} failed` : '✅'
    lines.push(`| ${s.name} | ${s.checks.length} | ${(s.seconds || 0).toFixed(1)} s | ${result} |`)
  }
  const failures = scenarios.flatMap((s) => s.checks.filter((c) => !c.ok).map((c) => ({ scenario: s.name, ...c, screenshot: s.screenshot })))
  if (failures.length) {
    lines.push('', '**Failures**', '')
    for (const f of failures) lines.push(`- \`${f.scenario}\`: ${f.label}${f.detail ? ` — ${String(f.detail).split('\n')[0].slice(0, 300)}` : ''}${f.screenshot ? ` (screenshot: \`${path.basename(f.screenshot)}\`)` : ''}`)
  }
  const slowest = scenarios.filter((s) => !s.skipped).sort((a, b) => (b.seconds || 0) - (a.seconds || 0))[0]
  if (slowest) lines.push('', `Slowest scenario: \`${slowest.name}\` (${(slowest.seconds || 0).toFixed(1)} s).`)
  return lines.join('\n') + '\n'
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
  if (!file) { console.error('usage: node scripts/smoke-summary.mjs <report.json>'); process.exit(2) }
  if (!fs.existsSync(file)) { console.log(`### Browser smoke — no report at \`${file}\` (the scenarios did not run)\n`); process.exit(0) }
  process.stdout.write(summarize(JSON.parse(fs.readFileSync(file, 'utf8'))))
}
