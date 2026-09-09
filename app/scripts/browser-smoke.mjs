/* Real-browser smoke test of the IDE + debugger (Chromium via Playwright).
 * Not part of CI (needs a browser); run it locally after `pnpm build`:
 *   pnpm preview --port 4173 &   then   node scripts/browser-smoke.mjs
 * Resolves playwright from node_modules or the global npm root.
 * Writes screenshots next to this script's ../dist as smoke-*.png. */
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
function loadPlaywright() {
  try { return require('playwright') } catch { /* fall through */ }
  const g = execSync('npm root -g').toString().trim()
  return require(path.join(g, 'playwright'))
}
const { chromium } = loadPlaywright()
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.env.SMOKE_URL || 'http://localhost:4173'
const results = []
const check = (name, ok, detail = '') => results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
try {
  await page.goto(`${base}/ide`, { waitUntil: 'domcontentloaded' })
  /* boot: the status bar shows the engine label once ready */
  await page.getByText('ECL 24.5 · wasm32').first().waitFor({ timeout: 90_000 })
  check('ECL boots in the browser (status bar shows ECL 24.5 · wasm32)', true)
  const editor = page.locator('.cm-content').first()
  await editor.waitFor()

  /* replace the whole buffer: caret to the top-left, shift-select to the
   * end of the document, delete, then insert (bypasses key handlers) */
  /* Replace the whole buffer through CodeMirror's own view (exposed on the
   * content node as `cmTile` / `cmView`) — keyboard select-all chords proved flaky in
   * headless Chromium. Dispatching a change runs the same update listener
   * as typing, so the workspace store sees the new text. */
  const setCode = async (code) => {
    await editor.click()
    await page.evaluate((text) => {
      const node = document.querySelector('.cm-content')
      /* CodeMirror ≥ 6.43 (tile renderer) exposes `cmTile.view`; older builds `cmView` */
      const t = node && (node.cmTile || node.cmView)
      const view = t && (t.view || (t.rootView && t.rootView.view))
      if (!view) throw new Error('CodeMirror view not reachable from .cm-content')
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: text.length } })
      view.focus()
    }, code)
    /* line elements concatenate without newlines — compare ignoring whitespace */
    const now = ((await editor.textContent()) ?? '').replace(/\s+/g, '')
    const want = code.replace(/\s+/g, '')
    if (now !== want) throw new Error(`setCode: buffer is "${now.slice(0, 80)}" not "${want.slice(0, 80)}"`)
  }

  /* 1. division by zero → debugger pauses, ABORT via key */
  await setCode('(/ 1 0)')
  await page.keyboard.press('Control+Enter')
  await page.getByText(';; DEBUGGER — DIVISION-BY-ZERO').waitFor({ timeout: 20_000 })
  check('unhandled error pauses the cell in the debugger', true)
  const rows = await page.locator('button:has-text("RETRY"), button:has-text("ABORT")').allTextContents()
  check('RETRY and ABORT rows are offered', rows.some((r) => r.includes('RETRY')) && rows.some((r) => r.includes('ABORT')), rows.join(' | '))
  await page.screenshot({ path: path.join(root, 'dist', 'smoke-1-paused.png') })
  await page.keyboard.press('1') /* [0] RETRY, [1] ABORT */
  await page.getByText(';; ERROR — DIVISION-BY-ZERO').waitFor({ timeout: 20_000 })
  await page.getByText(';; resolved via ABORT').waitFor({ timeout: 5_000 })
  check('key 1 → ABORT: error reported, resolution line says ABORT', true)

  /* 2. user restart-case with USE-VALUE → value input → resumed */
  await setCode('(restart-case (/ 1 0) (use-value (v) :report "Use a value instead" (* v 2)))')
  await page.keyboard.press('Control+Enter')
  await page.getByText(';; DEBUGGER — DIVISION-BY-ZERO').waitFor({ timeout: 20_000 })
  await page.locator('button:has-text("USE-VALUE")').first().click()
  const input = page.locator('input[placeholder^="a form, evaluated in"]')
  await input.waitFor({ timeout: 5_000 })
  check('USE-VALUE opens the value-form input', true)
  await input.fill('21')
  await page.keyboard.press('Enter')
  await page.getByText(';;=>').last().waitFor({ timeout: 20_000 })
  await page.getByText(';; resumed via USE-VALUE').waitFor({ timeout: 10_000 })
  const valueText = await page.locator('.cc-cell').last().textContent()
  check('USE-VALUE 21 resumes → 42 and "resumed via USE-VALUE"', /42/.test(valueText ?? ''), (valueText ?? '').slice(0, 200))
  await page.screenshot({ path: path.join(root, 'dist', 'smoke-2-resumed.png') })

  /* 3. (read-line): the cell shows an stdin prompt; typing completes the read */
  await setCode('(progn (format t "Name? ") (list :hello (read-line)))')
  await page.keyboard.press('Control+Enter')
  const stdin = page.locator('input[placeholder^="the program is reading a line"]')
  await stdin.waitFor({ timeout: 20_000 })
  check('(read-line) blocks the cell with an stdin prompt', true)
  await page.screenshot({ path: path.join(root, 'dist', 'smoke-3-stdin.png') })
  await stdin.fill('Ada')
  await page.keyboard.press('Enter')
  await page.getByText('(:HELLO "Ada")').waitFor({ timeout: 20_000 })
  check('typed line completes the read → (:HELLO "Ada")', true)

  /* 4. F12 on a symbol jumps to its defun in the buffer (fallback path) */
  await setCode('(defun sq (x)\n  (* x x))\n\n(defun use-it ()\n  (sq 9))\n')
  await page.evaluate(() => {
    const t = document.querySelector('.cm-content').cmTile || document.querySelector('.cm-content').cmView
    const view = t.view || t.rootView.view
    const doc = view.state.doc.toString()
    view.dispatch({ selection: { anchor: doc.lastIndexOf('sq') + 1 } })
    view.focus()
  })
  await page.keyboard.press('F12')
  await page.getByText('Ln 1, Col 1').waitFor({ timeout: 10_000 })
  check('F12 on `sq` jumps to (defun sq …) — status bar shows Ln 1, Col 1', true)

  /* 5. package pill follows in-package (Sprint 1) */
  await setCode('(defpackage :smoke (:use :cl))\n(in-package :smoke)')
  await page.keyboard.press('Control+Shift+Enter') /* evaluate ALL forms */
  await page.getByText('SMOKE', { exact: true }).first().waitFor({ timeout: 20_000 })
  check('package pill follows (in-package :smoke)', true)

  check('no uncaught page errors', errors.length === 0, errors.join(' | '))
} catch (e) {
  check('smoke run completed', false, e?.message ?? String(e))
  await page.screenshot({ path: path.join(root, 'dist', 'smoke-failure.png') }).catch(() => {})
} finally {
  await browser.close()
}
console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} check(s) failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
