/* Real-browser smoke test of the IDE + debugger (Chromium via Playwright).
 * Not part of CI (needs a browser); run it locally after `pnpm build`:
 *   pnpm preview --port 4173 &   then   node scripts/browser-smoke.mjs
 * Resolves playwright from node_modules or the global npm root.
 * Writes screenshots next to this script's ../dist as smoke-*.png. */
import { createRequire } from 'node:module'
import fs from 'node:fs'
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

  /* 4a (Sprint 11). the outline lists the buffer's definitions and jumps */
  await page.keyboard.press('Control+Shift+O')
  const outline = page.locator('[data-testid="outline-panel"]')
  await outline.waitFor({ timeout: 5_000 })
  await outline.getByText('use-it', { exact: true }).waitFor({ timeout: 5_000 })
  const outlineRows = await outline.locator('button:has(span.truncate)').allInnerTexts()
  check('Ctrl⇧O outline lists sq and use-it for the active buffer', outlineRows.some((r) => /\bsq\b/.test(r)) && outlineRows.some((r) => /use-it/.test(r)), outlineRows.join(' | '))
  await outline.getByText('use-it', { exact: true }).click()
  await page.getByText('Ln 4, Col 1').waitFor({ timeout: 5_000 })
  check('clicking use-it in the outline moves the caret to its defun — Ln 4, Col 1', true)
  await page.keyboard.press('Control+Shift+O')
  await outline.waitFor({ state: 'detached', timeout: 5_000 })

  /* 4b (Sprint 9). a definition evaluated from a buffer is a go-to-definition target from another buffer */
  await page.keyboard.press('Control+Shift+Enter')
  await page.getByText('USE-IT', { exact: true }).first().waitFor({ timeout: 20_000 })
  await page.locator('button[title="New buffer (Ctrl N)"]').first().click()
  await setCode('(sq 3)')
  await page.evaluate(() => {
    const t = document.querySelector('.cm-content').cmTile || document.querySelector('.cm-content').cmView
    const view = t.view || t.rootView.view
    view.dispatch({ selection: { anchor: 2 } })
    view.focus()
  })
  await page.keyboard.press('F12')
  await page.waitForFunction(() => {
    const t = document.querySelector('.cm-content').cmTile || document.querySelector('.cm-content').cmView
    const view = t.view || t.rootView.view
    return view.state.doc.toString().startsWith('(defun sq') && view.state.selection.main.head === 0
  }, null, { timeout: 10_000 })
  check('F12 on `sq` in a second buffer jumps to the evaluated (defun sq …) in the first', true)

  /* 4c (Sprint 9). workspace search across open buffers, click to jump */
  await page.keyboard.press('Control+Shift+F')
  const box = page.locator('[data-testid="search-panel"] input')
  await box.waitFor({ timeout: 5_000 })
  await box.fill('sq')
  await page.locator('[data-testid="search-panel"] mark').first().waitFor({ timeout: 10_000 })
  const hits = await page.locator('[data-testid="search-panel"] mark').count()
  check('Ctrl⇧F search finds `sq` in both open buffers (defun, call, call)', hits === 3, String(hits))
  await page.locator('[data-testid="search-panel"] mark').first().click()
  await page.getByText('Ln 1, Col 8').waitFor({ timeout: 10_000 })
  check('clicking a hit puts the caret on it — status bar shows Ln 1, Col 8', true)
  await box.press('Escape')

  /* 4d (Sprint 10). Shift+F12 = find references: the panel opens with the symbol, whole-symbol and code-only on */
  await page.evaluate(() => {
    const t = document.querySelector('.cm-content').cmTile || document.querySelector('.cm-content').cmView
    const view = t.view || t.rootView.view
    const doc = view.state.doc.toString()
    view.dispatch({ selection: { anchor: doc.lastIndexOf('(sq 9)') + 2 } })
    view.focus()
  })
  await page.keyboard.press('Shift+F12')
  await page.waitForFunction(() => document.querySelector('[data-testid="search-panel"] input')?.value === 'sq', null, { timeout: 5_000 })
  await page.locator('[data-testid="search-panel"] mark').first().waitFor({ timeout: 10_000 })
  const refHits = await page.locator('[data-testid="search-panel"] mark').count()
  const wholeOn = await page.locator('button[title="Whole symbol"][aria-pressed="true"]').count()
  const codeOn = await page.locator('button[title^="Code only"][aria-pressed="true"]').count()
  check('Shift+F12 on `sq` fills the search with the symbol, whole-symbol + code-only on, 3 references', refHits === 3 && wholeOn === 1 && codeOn === 1, `hits=${refHits} whole=${wholeOn} code=${codeOn}`)
  await box.press('Escape')

  /* 4e (Sprint 10). a defun typed into the session box is a go-to-definition target: F12 scrolls to and flashes its cell */
  const sessionBox = page.locator('[data-testid="session-input"] .cm-content')
  await sessionBox.click()
  await page.keyboard.type('(defun from-session () 1)')
  const typed = await sessionBox.innerText()
  await page.keyboard.press('Enter')
  try {
    await page.getByText('FROM-SESSION', { exact: true }).first().waitFor({ state: 'attached', timeout: 20_000 }) /* the new cell may be off-screen under content-visibility:auto */
  } catch (e) {
    throw new Error(`session box did not evaluate: typed=${JSON.stringify(typed)} now=${JSON.stringify(await sessionBox.innerText())} cells=${await page.locator('.cc-cell').count()} cmContents=${await page.locator('.cm-content').count()}`)
  }
  await setCode('(from-session)')
  await page.evaluate(() => {
    const t = document.querySelector('.cm-content').cmTile || document.querySelector('.cm-content').cmView
    const view = t.view || t.rootView.view
    view.dispatch({ selection: { anchor: 3 } })
    view.focus()
  })
  await page.keyboard.press('F12')
  await page.locator('.cc-cell.ring-2').first().waitFor({ timeout: 10_000 })
  const flashed = await page.locator('.cc-cell.ring-2').first().innerText()
  check('F12 on `from-session` (defined in the session box) flashes that cell', /from-session/.test(flashed), flashed.slice(0, 120))

  /* 5. package pill follows in-package (Sprint 1) */
  await setCode('(defpackage :smoke (:use :cl))\n(in-package :smoke)')
  await page.keyboard.press('Control+Shift+Enter') /* evaluate ALL forms */
  await page.getByText('SMOKE', { exact: true }).first().waitFor({ timeout: 20_000 })
  check('package pill follows (in-package :smoke)', true)

  /* Sprint 8: session export downloads a Markdown notebook of the cells above */
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10_000 }),
    page.locator('button[title^="Export session as Markdown"]').click(),
  ])
  const mdPath = await download.path()
  const md = mdPath ? fs.readFileSync(mdPath, 'utf8') : ''
  fs.writeFileSync(path.join(root, 'dist', 'smoke-session.md'), md)
  check('export button downloads conscell-session-….md', /^conscell-session-\d{4}-\d{2}-\d{2}-\d{4}\.md$/.test(download.suggestedFilename()), download.suggestedFilename())
  check('the Markdown carries the cells: header, the resumed cell, the stdin cell', md.startsWith('# ConsCell session') && md.includes('_Resumed via `USE-VALUE`._') && md.includes(';;=> (:HELLO "Ada")'), md.slice(0, 300))

  /* Sprint 10: import the transcript back — the cells are appended, marked imported */
  const cellsBefore = await page.locator('.cc-cell').count()
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10_000 }),
    (async () => {
      await page.keyboard.press('Control+k')
      await page.keyboard.type('Import session transcript')
      await page.keyboard.press('Enter') /* exact-prefix matches rank first in the palette */
    })(),
  ])
  const accept = await chooser.element().getAttribute('accept')
  await chooser.setFiles(mdPath)
  const headings = (md.match(/^## Cell \d+ · /gm) || []).length
  await page.waitForFunction((n) => document.querySelectorAll('.cc-cell').length >= n, cellsBefore + 1, { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(500)
  const cellsAfter = await page.locator('.cc-cell').count()
  const importedChips = await page.getByText('imported', { exact: true }).count()
  const toasts = await page.locator('[data-sonner-toast]').allInnerTexts()
  check('importing the exported Markdown appends every cell, each marked imported', headings === cellsBefore && cellsAfter === cellsBefore * 2 && importedChips === cellsBefore, `headings=${headings} before=${cellsBefore} after=${cellsAfter} chips=${importedChips} accept=${accept} file=${mdPath} size=${mdPath ? fs.statSync(mdPath).size : -1} toasts=${JSON.stringify(toasts)}`)

  /* Sprint 11/12: the definition index survives a reload, and an entry follows the defun when the buffer changes.
   * Index path vs text-scan path differ here: the ACTIVE buffer (2) also defines sq at line 1; the index says sq was
   * evaluated in buffer 1, where it now sits on line 3 — F12 must land in buffer 1, line 3. */
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('ECL 24.5 · wasm32').first().waitFor({ timeout: 90_000 })
  await page.locator('.cm-content').first().waitFor()
  await setCode('(defpackage :x)\n\n(defun sq (y) y)\n')
  await page.keyboard.press('Control+Shift+F')
  const box2 = page.locator('[data-testid="search-panel"] input')
  await box2.waitFor({ timeout: 5_000 })
  await box2.fill('sq 3')
  await page.locator('[data-testid="search-panel"] mark').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-testid="search-panel"] mark').first().click()
  await page.waitForFunction(() => {
    const t = document.querySelector('.cm-content').cmTile || document.querySelector('.cm-content').cmView
    const view = t.view || t.rootView.view
    return view.state.doc.toString().startsWith('(sq 3)')
  }, null, { timeout: 10_000 })
  await box2.press('Escape')
  await setCode('(defun sq (z) z)\n(sq 3)\n')
  await page.evaluate(() => {
    const t = document.querySelector('.cm-content').cmTile || document.querySelector('.cm-content').cmView
    const view = t.view || t.rootView.view
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf('(sq 3)') + 2 } })
    view.focus()
  })
  await page.keyboard.press('F12')
  await page.waitForFunction(() => {
    const t = document.querySelector('.cm-content').cmTile || document.querySelector('.cm-content').cmView
    const view = t.view || t.rootView.view
    return view.state.doc.toString().startsWith('(defpackage :x)')
  }, null, { timeout: 10_000 })
  await page.getByText('Ln 3, Col 1').waitFor({ timeout: 10_000 })
  check('after a reload, F12 on `sq` uses the persisted index and follows the defun to its new line (buffer 1, Ln 3)', true)

  /* Sprint 13: replace across open buffers — active one through the editor (undoable), the other through the store */
  await page.keyboard.press('Control+Shift+F')
  const box3 = page.locator('[data-testid="search-panel"] input[aria-label="Search workspace"]')
  await box3.waitFor({ timeout: 5_000 })
  await box3.fill('sq')
  await page.locator('[data-testid="search-panel"] mark').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-testid="search-panel"] button[title="Replace…"]').click()
  const rbox = page.locator('[data-testid="search-panel"] input[aria-label="Replacement"]')
  await rbox.waitFor({ timeout: 5_000 })
  await rbox.fill('sq2')
  await page.locator('[data-testid="search-panel"] button[title^="Replace all"]').click()
  await page.locator('[data-testid="search-panel"] button[title^="Confirm"]').click()
  await page.waitForFunction(() => {
    const t = document.querySelector('.cm-content').cmTile || document.querySelector('.cm-content').cmView
    const view = t.view || t.rootView.view
    return view.state.doc.toString().includes('(defun sq2 (y) y)')
  }, null, { timeout: 10_000 })
  await box3.fill('sq2')
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="search-panel"] mark').length === 3, null, { timeout: 10_000 })
  check('Replace all sq → sq2 rewrites both open buffers (3 hits of sq2 afterwards)', true)
  await page.locator('.cm-content').first().click()
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => {
    const t = document.querySelector('.cm-content').cmTile || document.querySelector('.cm-content').cmView
    const view = t.view || t.rootView.view
    return view.state.doc.toString().includes('(defun sq (y) y)')
  }, null, { timeout: 10_000 })
  check('Ctrl+Z in the editor undoes the replacement in the active buffer', true)
  await page.keyboard.press('Control+Shift+F')
  await box3.press('Escape')

  /* Sprint 8: the landing page is code-split and its scroll effects load on demand */
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  await page.locator('h1').first().waitFor({ timeout: 20_000 })
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((r) => /lenis-.*\.js/.test(r.name)), null, { timeout: 20_000 })
  check('landing page renders after code-splitting and loads its lenis chunk on demand', true)

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
