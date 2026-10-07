/* Real-browser smoke test of the IDE (Chromium via Playwright), organised
 * as named scenarios (Sprint 19). In CI on pull requests labelled `smoke`
 * and on pushes to dev (the `smoke` job, Sprints 20–21); run it locally after `pnpm build`:
 *   pnpm preview --port 4173 &   then   node scripts/browser-smoke.mjs [--only a,b] [--list] [--allow-stale] [--json report.json]
 * Each scenario runs in its own browser context (fresh IndexedDB), boots
 * the IDE and sets up its own state, so any one can run alone. Resolves
 * playwright from node_modules or the global npm root. Screenshots go to
 * ../dist as smoke-*.png. */
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
const argv = process.argv.slice(2)
const only = (argv.includes('--only') ? argv[argv.indexOf('--only') + 1] || '' : '').split(',').filter(Boolean)
const jsonOut = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null
/* a scenario throws this to be reported as skipped (neither passed nor failed) — e.g. the SBCL artifacts are absent */
class SkipScenario extends Error {}

/* Sprint 18: refuse to test a stale build — a `tsc` failure leaves the previous dist in place */
{
  const newest = (dir) => {
    let t = 0
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else t = Math.max(t, fs.statSync(p).mtimeMs) } }
    walk(dir); return t
  }
  const built = fs.existsSync(path.join(root, 'dist', 'index.html')) ? fs.statSync(path.join(root, 'dist', 'index.html')).mtimeMs : 0
  const sources = Math.max(newest(path.join(root, 'src')), fs.statSync(path.join(root, 'public', 'wecl-worker.js')).mtimeMs, fs.statSync(path.join(root, 'index.html')).mtimeMs)
  if (built < sources && !argv.includes('--allow-stale')) {
    console.error(`browser-smoke: dist/ is older than the sources (built ${new Date(built).toISOString()}, newest source ${new Date(sources).toISOString()}). Run \`pnpm build\` first, or pass --allow-stale.`)
    process.exit(2)
  }
}

/* ---- per-page tools ---- */

/* CodeMirror ≥ 6.43 (tile renderer) exposes `cmTile.view`; older builds `cmView` */
const VIEW = `(function(){const n=document.querySelector('.cm-content');const t=n&&(n.cmTile||n.cmView);return t&&(t.view||(t.rootView&&t.rootView.view))})()`

function tools(page, check) {
  const doc = () => page.evaluate(`${VIEW}.state.doc.toString()`)
  /* wait until the editor document satisfies {startsWith|includes} */
  const waitDoc = (cond, timeout = 10_000) => page.waitForFunction(`(function(){const d=${VIEW}.state.doc.toString();return ${cond.startsWith !== undefined ? `d.startsWith(${JSON.stringify(cond.startsWith)})` : `d.includes(${JSON.stringify(cond.includes)})`}${cond.caretAt !== undefined ? ` && ${VIEW}.state.selection.main.head === ${cond.caretAt}` : ''}})()`, null, { timeout })
  /* put the caret at a character offset (a negative offset counts from the end of `needle`'s last occurrence) */
  const setCaret = (at) => page.evaluate(`(function(){const v=${VIEW};const d=v.state.doc.toString();const at=${typeof at === 'number' ? at : `(d.lastIndexOf(${JSON.stringify(at.after)}) + ${at.plus ?? 0})`};v.dispatch({selection:{anchor:at}});v.focus()})()`)
  /* replace the whole buffer through CodeMirror's own view: the same update listener as typing runs, so the store sees it */
  const setCode = async (code) => {
    await page.locator('.cm-content').first().click()
    await page.evaluate(`(function(text){const v=${VIEW};if(!v)throw new Error('CodeMirror view not reachable');v.dispatch({changes:{from:0,to:v.state.doc.length,insert:text},selection:{anchor:text.length}});v.focus()})(${JSON.stringify(code)})`)
    const now = (await doc()).replace(/\s+/g, '')
    const want = code.replace(/\s+/g, '')
    if (now !== want) throw new Error(`setCode: buffer is "${now.slice(0, 80)}" not "${want.slice(0, 80)}"`)
  }
  const bootIde = async () => {
    /* pin ECL for the general scenarios — the app default is SBCL-first
     * since 1.0; scenarios that want SBCL set their own pref */
    await page.addInitScript(() => { try { localStorage.setItem('martingalecell-engine-pref', 'ecl') } catch { /* private mode */ } })
    await page.goto(`${base}/ide`, { waitUntil: 'domcontentloaded' })
    await page.getByText('ECL 24.5 · wasm32').first().waitFor({ timeout: 90_000 })
    await page.locator('.cm-content').first().waitFor()
  }
  const evalAll = () => page.keyboard.press('Control+Shift+Enter')
  const newBuffer = () => page.locator('button[title="New buffer (Ctrl N)"]').first().click()
  const tab = (i) => page.locator('[data-testid="buffer-tab"]').nth(i)
  const searchBox = () => page.locator('[data-testid="search-panel"] input[aria-label="Search workspace"]')
  const marks = () => page.locator('[data-testid="search-panel"] mark')
  /* open the search panel, type a query and click the first hit */
  const jumpViaSearch = async (query, expectDoc) => {
    await page.keyboard.press('Control+Shift+F')
    const box = searchBox()
    await box.waitFor({ timeout: 5_000 })
    await box.fill(query)
    await marks().first().waitFor({ timeout: 10_000 })
    await marks().first().click()
    await waitDoc(expectDoc)
    await box.press('Escape')
  }
  const paletteCommand = async (name) => {
    const input = page.getByPlaceholder('Type a command…')
    await page.keyboard.press('Control+k')
    /* Ctrl+K toggles: after a file chooser the palette can still be open, so press again if it went away */
    if (!(await input.isVisible().catch(() => false))) await page.keyboard.press('Control+k')
    await input.waitFor({ timeout: 5_000 })
    await input.fill(name)
    await page.keyboard.press('Enter') /* exact-prefix matches rank first in the palette */
  }
  const cells = () => page.locator('.cc-cell')
  const shot = (name) => page.screenshot({ path: path.join(root, 'dist', `smoke-${name}.png`) }).catch(() => {})
  return { doc, waitDoc, setCaret, setCode, bootIde, evalAll, newBuffer, tab, searchBox, marks, jumpViaSearch, paletteCommand, cells, shot, check, page }
}

/* ---- scenarios ---- */

const scenarios = {
  /* the debugger pauses on an unhandled error; restarts resume or abort */
  async debugger({ page, check, setCode, shot, cells }) {
    check('ECL boots in the browser (status bar shows ECL 24.5 · wasm32)', true)
    await setCode('(/ 1 0)')
    await page.keyboard.press('Control+Enter')
    await page.getByText(';; DEBUGGER — DIVISION-BY-ZERO').waitFor({ timeout: 20_000 })
    check('unhandled error pauses the cell in the debugger', true)
    const rows = await page.locator('button:has-text("RETRY"), button:has-text("ABORT")').allTextContents()
    check('RETRY and ABORT rows are offered', rows.some((r) => r.includes('RETRY')) && rows.some((r) => r.includes('ABORT')), rows.join(' | '))
    await shot('1-paused')
    await page.keyboard.press('1') /* [0] RETRY, [1] ABORT */
    await page.getByText(';; ERROR — DIVISION-BY-ZERO').waitFor({ timeout: 20_000 })
    await page.getByText(';; resolved via ABORT').waitFor({ timeout: 5_000 })
    check('key 1 → ABORT: error reported, resolution line says ABORT', true)
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
    const valueText = await cells().last().textContent()
    check('USE-VALUE 21 resumes → 42 and "resumed via USE-VALUE"', /42/.test(valueText ?? ''), (valueText ?? '').slice(0, 200))
    await shot('2-resumed')
  },

  /* (read-line) blocks the cell on a prompt; the typed line completes it */
  async stdin({ page, check, setCode, shot }) {
    await setCode('(progn (format t "Name? ") (list :hello (read-line)))')
    await page.keyboard.press('Control+Enter')
    const stdin = page.locator('input[placeholder^="the program is reading a line"]')
    await stdin.waitFor({ timeout: 20_000 })
    check('(read-line) blocks the cell with an stdin prompt', true)
    await shot('3-stdin')
    await stdin.fill('Ada')
    await page.keyboard.press('Enter')
    await page.getByText('(:HELLO "Ada")').waitFor({ timeout: 20_000 })
    check('typed line completes the read → (:HELLO "Ada")', true)
  },

  /* Sprint 35 (review blocker 6): a raw-SVG ;;PLOT64 payload — which any Lisp code can print — is sanitised before it reaches innerHTML */
  async svgsafe({ page, check, setCode }) {
    const hostile = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" onload="window.__pwned=1"><script>window.__pwned=2</script><image href="x" onerror="window.__pwned=3"/><foreignObject><body onload="window.__pwned=4"/></foreignObject><a href="javascript:window.__pwned=5"><text x="4" y="24" fill="#e6edf3">mol</text></a><circle cx="60" cy="20" r="6" fill="#6ea8dc"/></svg>'
    const payload = '"' + hostile.replace(/(["\\])/g, '\\$1') + '"'
    const b64 = Buffer.from(payload, 'binary').toString('base64')
    await setCode(`(progn (format t ";;PLOT64 ${b64}~%") :drawn)`)
    await page.keyboard.press('Control+Enter')
    await page.locator('.cc-mol-plot svg').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(300) /* give any surviving handler a chance to fire */
    const html = await page.locator('.cc-mol-plot').first().innerHTML()
    const pwned = await page.evaluate('window.__pwned')
    check('the raw SVG renders in the cell with its drawing kept (text, circle)', /<text/.test(html) && /<circle/.test(html), html)
    check('script, foreignObject, on* handlers and javascript: hrefs are stripped', !/<script|foreignObject|onload|onerror|javascript:/i.test(html), html)
    check('nothing in the payload executed (window.__pwned stays unset)', pwned === undefined, String(pwned))
  },

  /* go-to-definition, the outline, workspace search, find references, session-box definitions, the package pill */
  async definitions({ page, check, setCode, setCaret, waitDoc, evalAll, newBuffer, searchBox, marks, cells }) {
    await setCode('(defun sq (x)\n  (* x x))\n\n(defun use-it ()\n  (sq 9))\n')
    await setCaret({ after: 'sq', plus: 1 })
    await page.keyboard.press('F12')
    await page.getByText('Ln 1, Col 1').waitFor({ timeout: 10_000 })
    check('F12 on `sq` jumps to (defun sq …) — status bar shows Ln 1, Col 1', true)

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

    await evalAll()
    await page.getByText('USE-IT', { exact: true }).first().waitFor({ timeout: 20_000 })
    await newBuffer()
    await setCode('(sq 3)')
    await setCaret(2)
    await page.keyboard.press('F12')
    await waitDoc({ startsWith: '(defun sq', caretAt: 0 })
    check('F12 on `sq` in a second buffer jumps to the evaluated (defun sq …) in the first', true)

    await page.keyboard.press('Control+Shift+F')
    const box = searchBox()
    await box.waitFor({ timeout: 5_000 })
    await box.fill('sq')
    await marks().first().waitFor({ timeout: 10_000 })
    const hits = await marks().count()
    check('Ctrl⇧F search finds `sq` in both open buffers (defun, call, call)', hits === 3, String(hits))
    await marks().first().click()
    await page.getByText('Ln 1, Col 8').waitFor({ timeout: 10_000 })
    check('clicking a hit puts the caret on it — status bar shows Ln 1, Col 8', true)
    await box.press('Escape')

    await setCaret({ after: '(sq 9)', plus: 2 })
    await page.keyboard.press('Shift+F12')
    await page.waitForFunction(() => document.querySelector('[data-testid="search-panel"] input')?.value === 'sq', null, { timeout: 5_000 })
    await marks().first().waitFor({ timeout: 10_000 })
    const refHits = await marks().count()
    const wholeOn = await page.locator('button[title="Whole symbol"][aria-pressed="true"]').count()
    const codeOn = await page.locator('button[title^="Code only"][aria-pressed="true"]').count()
    check('Shift+F12 on `sq` fills the search with the symbol, whole-symbol + code-only on, 3 references', refHits === 3 && wholeOn === 1 && codeOn === 1, `hits=${refHits} whole=${wholeOn} code=${codeOn}`)
    await box.press('Escape')

    const sessionBox = page.locator('[data-testid="session-input"] .cm-content')
    await sessionBox.click()
    await page.keyboard.type('(defun from-session () 1)')
    await page.keyboard.press('Enter')
    await page.getByText('FROM-SESSION', { exact: true }).first().waitFor({ state: 'attached', timeout: 20_000 }) /* may be off-screen under content-visibility:auto */
    await setCode('(from-session)')
    await setCaret(3)
    await page.keyboard.press('F12')
    const flashedCell = page.locator('.cc-cell.ring-2').first()
    await flashedCell.waitFor({ timeout: 10_000 })
    const flashed = await flashedCell.innerText()
    check('F12 on `from-session` (defined in the session box) flashes that cell', /from-session/.test(flashed), flashed.slice(0, 120))

    await setCode('(defpackage :smoke (:use :cl))\n(in-package :smoke)')
    await evalAll()
    await page.getByText('SMOKE', { exact: true }).first().waitFor({ timeout: 20_000 })
    check('package pill follows (in-package :smoke)', true)
  },

  /* export, import (append and replace), a cell opened as a linked buffer and re-run */
  async transcript({ page, check, setCode, doc, cells, tab, waitDoc, paletteCommand }) {
    await setCode('(/ 1 0)')
    await page.keyboard.press('Control+Enter')
    await page.getByText(';; DEBUGGER — DIVISION-BY-ZERO').waitFor({ timeout: 20_000 })
    await page.keyboard.press('1')
    await page.getByText(';; resolved via ABORT').waitFor({ timeout: 10_000 })
    await setCode('(list :hello "Ada")')
    await page.keyboard.press('Control+Enter')
    await page.getByText('(:HELLO "Ada")').waitFor({ timeout: 20_000 })

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      page.locator('button[title^="Export session as Markdown"]').click(),
    ])
    const mdPath = await download.path()
    const md = mdPath ? fs.readFileSync(mdPath, 'utf8') : ''
    fs.writeFileSync(path.join(root, 'dist', 'smoke-session.md'), md)
    check('export button downloads martingalecell-session-….md', /^martingalecell-session-\d{4}-\d{2}-\d{2}-\d{4}\.md$/.test(download.suggestedFilename()), download.suggestedFilename())
    check('the Markdown carries the cells: header, the aborted cell, the value', md.startsWith('# MartingaleCell session') && md.includes('_Resumed via `ABORT`._') && md.includes(';;=> (:HELLO "Ada")'), md.slice(0, 300))

    const cellsBefore = await cells().count()
    const headings = (md.match(/^## Cell \d+ · /gm) || []).length
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), paletteCommand('Import session transcript')])
    await chooser.setFiles(mdPath)
    await page.waitForFunction((n) => document.querySelectorAll('.cc-cell').length === n, cellsBefore * 2, { timeout: 15_000 }).catch(() => {})
    const cellsAfter = await cells().count()
    const importedChips = await page.getByText('imported', { exact: true }).count()
    check('importing the exported Markdown appends every cell, each marked imported', headings === cellsBefore && cellsAfter === cellsBefore * 2 && importedChips === cellsBefore, `headings=${headings} before=${cellsBefore} after=${cellsAfter} chips=${importedChips}`)

    /* Sprint 26: the .lisp transcript round-trips too */
    const [lispDownload] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), paletteCommand('Export session as Lisp transcript')])
    const lispPath = await lispDownload.path()
    const lispText = lispPath ? fs.readFileSync(lispPath, 'utf8') : ''
    const lispSections = lispText.split('\n').filter((l) => l.startsWith(';;; ---- cell ')).length
    const [lispChooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), paletteCommand('Import session transcript')])
    await lispChooser.setFiles({ name: 'session.lisp', mimeType: 'text/plain', buffer: Buffer.from(lispText) })
    await page.waitForFunction((n) => document.querySelectorAll('.cc-cell').length === n, cellsAfter * 2, { timeout: 15_000 }).catch(() => {})
    const cellsAfterLisp = await cells().count()
    const abortedNotes = await page.getByText('resolved via ABORT', { exact: false }).count()
    check('exporting as .lisp and importing it appends the cells again (sections = cells, the aborted cell keeps its resolution)', lispSections === cellsAfter && cellsAfterLisp === cellsAfter * 2 && abortedNotes >= 2, `sections=${lispSections} after=${cellsAfterLisp} aborted=${abortedNotes}`)

    const tabsBefore = await page.locator('[data-testid="buffer-tab"]').count()
    await cells().first().hover()
    await cells().first().locator('button[title="Open as buffer"]').click()
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="buffer-tab"]').length === n + 1, tabsBefore, { timeout: 5_000 })
    const openedDoc = await doc()
    check('"Open as buffer" on the first cell adds a tab whose document is the cell input (/ 1 0)', openedDoc.trim() === '(/ 1 0)', JSON.stringify(openedDoc))
    const linkedTab = await page.locator('[data-testid="buffer-tab"][data-active="true"]').innerText()
    await setCode('(+ 1 2)')
    const cellsBeforeRerun = await cells().count()
    await cells().first().hover()
    await cells().first().locator('button[title="Re-run"]').click()
    await page.waitForFunction((n) => document.querySelectorAll('.cc-cell').length === n + 1, cellsBeforeRerun, { timeout: 20_000 })
    await cells().last().getByText('3', { exact: true }).waitFor({ state: 'attached', timeout: 20_000 })
    const rerunText = await cells().last().evaluate((el) => el.textContent || '')
    check('re-running the linked cell evaluates the edited buffer: new cell (+ 1 2) → 3, tab badged [1]', rerunText.includes('(+ 1 2)') && /\[1\]/.test(linkedTab), `tab=${JSON.stringify(linkedTab)} cell=${JSON.stringify(rerunText.slice(0, 80))}`)
    await tab(0).click()
    await waitDoc({ startsWith: '(list :hello' })

    const [chooser2] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), paletteCommand('Import transcript replacing')])
    await chooser2.setFiles(mdPath)
    await page.getByText('Replace the session with the transcript?').waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Replace session' }).click()
    await page.waitForFunction((n) => document.querySelectorAll('.cc-cell').length === n, headings, { timeout: 15_000 })
    const chipsAfterReplace = await page.getByText('imported', { exact: true }).count()
    check('replacing import: the confirm modal, then exactly the transcript\'s cells remain, all imported', chipsAfterReplace === headings, `cells=${headings} chips=${chipsAfterReplace}`)
  },

  /* the definition index and the editor state survive a reload; an index entry follows the defun */
  async persistence({ page, check, setCode, setCaret, waitDoc, evalAll, newBuffer, tab, jumpViaSearch, bootIde, paletteCommand }) {
    await setCode('(defun sq (x)\n  (* x x))\n\n(defun use-it ()\n  (sq 9))\n')
    await evalAll()
    await page.getByText('USE-IT', { exact: true }).first().waitFor({ timeout: 20_000 })
    await newBuffer()
    await setCode('(sq 3)')
    await tab(0).click()
    await waitDoc({ startsWith: '(defun sq' })
    await setCode('(from-session)')
    await setCode('(defpackage :smoke (:use :cl))\n(in-package :smoke)')

    /* Sprint 20: a fold in buffer 2 and a form submitted from the session box, both to be found again after the reload */
    await tab(1).click()
    await waitDoc({ startsWith: '(sq 3)' })
    await setCode('(defun folded (x)\n  (* x 2))\n(sq 3)\n')
    await setCaret(0)
    await page.keyboard.press('Control+Shift+{') /* Playwright's Ctrl+Shift+[ arrives with key "[" (a real browser sends "{"), which CodeMirror routes to its Ctrl+[ indent binding */
    await page.locator('.cm-foldPlaceholder').first().waitFor({ timeout: 5_000 })
    await tab(0).click()
    await waitDoc({ startsWith: '(defpackage :smoke' })
    const before = await page.locator('.cm-foldPlaceholder').count()
    await tab(1).click()
    await waitDoc({ startsWith: '(defun folded' })
    const after = await page.locator('.cm-foldPlaceholder').count()
    check('Ctrl+Shift+[ folds the defun; the fold belongs to its buffer (gone on tab 1, back on tab 2)', before === 0 && after === 1, `before=${before} after=${after}`)
    await tab(0).click()
    await waitDoc({ startsWith: '(defpackage :smoke' })
    const sessionBox = page.locator('[data-testid="session-input"] .cm-content')
    await sessionBox.click()
    await page.keyboard.type('(list :remembered 42)')
    await page.keyboard.press('Enter')
    await page.getByText('(:REMEMBERED 42)', { exact: true }).first().waitFor({ state: 'attached', timeout: 20_000 })
    await page.waitForTimeout(1200) /* both the workspace store and the editor states persist on a 500 ms debounce */

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('ECL 24.5 · wasm32').first().waitFor({ timeout: 90_000 })
    await page.locator('.cm-content').first().waitFor()
    await page.waitForTimeout(500)
    await page.locator('.cm-content').first().click()
    await page.keyboard.press('Control+z')
    await waitDoc({ startsWith: '(from-session)' })
    await page.keyboard.press('Control+y')
    await waitDoc({ startsWith: '(defpackage :smoke' })
    check('after a reload, Ctrl+Z undoes the edit made before it and Ctrl+Y redoes — the editor state was persisted', true)

    const box2 = page.locator('[data-testid="session-input"] .cm-content')
    await box2.click()
    await page.keyboard.press('ArrowUp')
    const recalled = await page.evaluate(`document.querySelector('[data-testid="session-input"] .cm-content').textContent`)
    check('after a reload, ↑ in the session box recalls the form submitted before it', recalled.trim() === '(list :remembered 42)', JSON.stringify(recalled))
    await page.keyboard.press('Escape')
    await tab(1).click()
    await waitDoc({ startsWith: '(defun folded' })
    const foldsAfterReload = await page.locator('.cm-foldPlaceholder').count()
    check('after a reload, the fold in buffer 2 is still there', foldsAfterReload === 1, String(foldsAfterReload))
    await setCaret(0) /* the tab click left focus on the tab bar; the caret line is the one whose fold Ctrl+Shift+] opens */
    await page.keyboard.press('Control+Shift+}')
    await page.waitForFunction(`document.querySelectorAll('.cm-foldPlaceholder').length === 0`, null, { timeout: 5_000 })
    check('Ctrl+Shift+] unfolds it', true)
    await paletteCommand('Fold all top-level forms')
    await page.waitForFunction(`document.querySelectorAll('.cm-foldPlaceholder').length === 1`, null, { timeout: 5_000 })
    check('"Fold all top-level forms" (palette) folds the defun again — the one-line (sq 3) has nothing to fold', true)
    await tab(0).click()
    await waitDoc({ startsWith: '(defpackage :smoke' })

    /* index path vs text-scan path differ here: the ACTIVE buffer (2) also defines sq at line 1; the index says sq was
     * evaluated in buffer 1, where it now sits on line 3 — F12 must land in buffer 1, line 3 */
    await setCode('(defpackage :x)\n\n(defun sq (y) y)\n')
    await jumpViaSearch('sq 3', { includes: '(sq 3)' }) /* buffer 2 now starts with the folded defun */
    await setCode('(defun sq (z) z)\n(sq 3)\n')
    await setCaret({ after: '(sq 3)', plus: 2 })
    await page.keyboard.press('F12')
    await waitDoc({ startsWith: '(defpackage :x)' })
    await page.getByText('Ln 3, Col 1').waitFor({ timeout: 10_000 })
    check('after a reload, F12 on `sq` uses the persisted index and follows the defun to its new line (buffer 1, Ln 3)', true)
    void bootIde
  },

  /* replace across buffers; undo/redo stay inside a buffer; scroll position per buffer */
  async replace({ page, check, setCode, doc, waitDoc, newBuffer, tab, searchBox, marks, jumpViaSearch }) {
    await setCode('(defpackage :x)\n\n(defun sq (y) y)\n')
    await newBuffer()
    await setCode('(defun sq (z) z)\n(sq 3)\n')
    await tab(0).click()
    await waitDoc({ startsWith: '(defpackage :x)' })

    await page.keyboard.press('Control+Shift+F')
    const box = searchBox()
    await box.waitFor({ timeout: 5_000 })
    await box.fill('sq')
    await marks().first().waitFor({ timeout: 10_000 })
    await page.locator('[data-testid="search-panel"] button[title="Replace…"]').click()
    const rbox = page.locator('[data-testid="search-panel"] input[aria-label="Replacement"]')
    await rbox.waitFor({ timeout: 5_000 })
    await rbox.fill('sq2')
    await page.locator('[data-testid="search-panel"] button[title^="Replace all"]').click()
    await page.locator('[data-testid="search-panel"] button[title^="Confirm"]').click()
    await waitDoc({ includes: '(defun sq2 (y) y)' })
    await box.fill('sq2')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="search-panel"] mark').length === 3, null, { timeout: 10_000 })
    check('Replace all sq → sq2 rewrites both open buffers (3 hits of sq2 afterwards)', true)
    await page.locator('.cm-content').first().click()
    await page.keyboard.press('Control+z')
    await waitDoc({ includes: '(defun sq (y) y)' })
    check('Ctrl+Z in the editor undoes the replacement in the active buffer', true)

    await jumpViaSearch('sq2 3', { startsWith: '(defun sq2 (z) z)' })
    await page.locator('.cm-content').first().click()
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(300)
    const docAfterUndo = await doc()
    check('Ctrl+Z in the other buffer reverts the replace that reached it through the store — and never shows another buffer\'s text', docAfterUndo.startsWith('(defun sq (z) z)'), JSON.stringify(docAfterUndo.slice(0, 40)))
    await page.keyboard.press('Control+y')
    await waitDoc({ startsWith: '(defun sq2 (z) z)' })
    check('Ctrl+Y re-applies it', true)
    await jumpViaSearch('defpackage :x', { includes: '(defun sq (y) y)' })
    await page.locator('.cm-content').first().click()
    await page.keyboard.press('Control+y') /* redo; Control+Shift+z would reach CodeMirror as a lowercase z and undo instead */
    await page.waitForTimeout(300)
    const docAfterRedo = await doc()
    check('back in the first buffer, redo restores the replacement — its history survived the switch', docAfterRedo.includes('(defun sq2 (y) y)'), JSON.stringify(docAfterRedo))

    await setCode(Array.from({ length: 300 }, (_, i) => `(defun line-${i} () ${i})`).join('\n') + '\n')
    await page.evaluate(() => { document.querySelector('.cm-scroller').scrollTop = 2000 })
    await page.waitForTimeout(250)
    const scrollBefore = await page.evaluate(() => document.querySelector('.cm-scroller').scrollTop)
    await tab(1).click()
    await waitDoc({ startsWith: '(defun sq2 (z) z)' })
    await tab(0).click()
    await waitDoc({ startsWith: '(defun line-0 ()' })
    await page.waitForTimeout(300)
    const scrollAfter = await page.evaluate(() => document.querySelector('.cm-scroller').scrollTop)
    check('switching away and back through the tab bar restores the buffer\'s scroll position', scrollBefore > 500 && Math.abs(scrollAfter - scrollBefore) < 60, `before=${scrollBefore} after=${scrollAfter}`)
  },

  /* the landing page is code-split and its scroll effects load on demand */
  async landing({ page, check }) {
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
    await page.locator('h1').first().waitFor({ timeout: 20_000 })
    await page.waitForFunction(() => performance.getEntriesByType('resource').some((r) => /lenis-.*\.js/.test(r.name)), null, { timeout: 20_000 })
    check('landing page renders after code-splitting and loads its lenis chunk on demand', true)
    /* Sprint 30: the docs site has the Engines section, reachable from the sidebar, and no ECL-only story left */
    await page.goto(`${base}/docs`, { waitUntil: 'domcontentloaded' })
    await page.locator('[data-testid="engine-table"]').waitFor({ timeout: 20_000 })
    const engineRows = await page.locator('[data-testid="engine-table"] tbody tr').count()
    const sidebarHasEngines = await page.locator('nav[aria-label="Documentation sections"] button', { hasText: /^Engines$/ }).count()
    const docsText = await page.evaluate(() => document.body.innerText)
    check(`/docs has the Engines section (${engineRows} comparison rows) and a sidebar entry for it`, engineRows >= 5 && sidebarHasEngines >= 1, `rows=${engineRows} sidebar=${sidebarHasEngines}`)
    check('/docs no longer claims a Cache API image, and says the IDE opens offline through the service worker', !/Cache API/.test(docsText) && /opens offline/.test(docsText))
  },

  /* Sprint 31: the service worker makes the IDE usable offline after its first load */
  async offline({ page, check, setCode }) {
    const context = page.context()
    await page.addInitScript(() => { try { localStorage.setItem('martingalecell-engine-pref', 'ecl') } catch { /* private mode */ } })
    await page.goto(`${base}/ide`, { waitUntil: 'domcontentloaded' })
    await page.getByText('ECL 24.5 · wasm32').first().waitFor({ timeout: 90_000 })
    const registered = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.active !== null)).catch(() => false)
    check('the production build registers a service worker and it becomes active', registered === true, String(registered))
    /* Sprint 34: no second online load — after ready the page asks the worker to warm the
     * cache with the engine's artifacts, and the document carries data-sw-warmed */
    await page.waitForFunction(() => document.documentElement.dataset.swWarmed !== undefined, null, { timeout: 120_000 })
    const warmed = await page.evaluate(() => document.documentElement.dataset.swWarmed)
    /* every chunk the page has loaded so far ends up cached (late chunks are warmed as they appear, so wait, do not snapshot) */
    const coverage = async () => {
      const names = await caches.keys()
      const c = await caches.open(names.find((n) => n.startsWith('martingalecell-')) ?? '')
      const scripts = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.startsWith(location.origin) && /\/assets\/.*\.js$/.test(n))
      const hits = await Promise.all(['/wecl/wecl.wasm', '/wecl-worker.js'].map((u) => new URL(u, location.href).href).concat(scripts).map((u) => c.match(u, { ignoreVary: true })))
      return { engine: hits.slice(0, 2).every(Boolean), chunks: scripts.length, chunksCached: hits.slice(2).filter(Boolean).length }
    }
    const covered = await page.waitForFunction(`(${coverage.toString()})().then((r) => r.engine && r.chunks > 0 && r.chunksCached === r.chunks)`, null, { timeout: 20_000 }).then(() => true).catch(() => false)
    const cached = await page.evaluate(`(${coverage.toString()})()`)
    check(`after the first boot the worker warmed its cache with the engine's artifacts and the page's own chunks (data-sw-warmed=${warmed}, ${cached.chunksCached}/${cached.chunks} chunks)`, warmed === 'ecl' && covered, JSON.stringify({ warmed, ...cached }))
    await context.setOffline(true)
    try {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.getByText('ECL 24.5 · wasm32').first().waitFor({ timeout: 90_000 })
      await page.locator('.cm-content').first().waitFor()
      check('offline: the IDE loads from the cache on the very next load and ECL boots', true)
      const isolated = await page.evaluate(() => crossOriginIsolated)
      check('offline: crossOriginIsolated still holds (the cached navigation kept its COOP/COEP headers)', isolated === true, String(isolated))
      await setCode('(list :offline (+ 40 2))')
      await page.keyboard.press('Control+Enter')
      await page.waitForFunction(`[...document.querySelectorAll('.cc-cell')].some((c) => c.textContent.replace(/\\s+/g, '').includes(';;=>(:OFFLINE42)'))`, null, { timeout: 60_000 })
      check('offline: a cell evaluates — (:OFFLINE 42)', true)
    } finally {
      await context.setOffline(false)
    }
  },

  /* re-run history side by side (Sprint 21) and Ctrl+R history search in the session box */
  async history({ page, check, setCode, cells, paletteCommand }) {
    /* the value spans are separate from the ;;=> marker: read the last matching cell's text, whitespace stripped */
    const waitValue = (input, value) => page.waitForFunction(`[...document.querySelectorAll('.cc-cell')].filter((c) => c.textContent.replace(/\\s+/g, '').includes(${JSON.stringify(input.replace(/\s+/g, ''))})).pop()?.textContent.replace(/\\s+/g, '').includes(${JSON.stringify(';;=>' + value)})`, null, { timeout: 20_000 })
    await setCode('(defvar *runs* 0)\n(incf *runs*)\n')
    await page.keyboard.press('Control+Shift+Enter')
    await waitValue('(incf *runs*)', '1')
    /* re-run the (incf *runs*) cell twice through its ↻ button: 2, then 3 */
    const incf = () => page.locator('.cc-cell').filter({ hasText: '*runs*' }).filter({ hasNotText: 'defvar' }).last()
    await incf().locator('button[title="Re-run"]').click()
    await waitValue('(incf *runs*)', '2')
    await incf().locator('button[title="Re-run"]').click()
    await waitValue('(incf *runs*)', '3')
    const chips = await page.locator('[data-testid="run-chip"]').allTextContents()
    check('three runs of the cell carry run chips 1/3, 2/3, 3/3 (the defvar cell has none)', chips.join(' ') === 'run 1/3 run 2/3 run 3/3', chips.join(' '))
    await page.locator('[data-testid="run-chip"]').last().click()
    const modal = page.locator('[data-testid="cell-history"]')
    await modal.waitFor({ timeout: 5_000 })
    const cols = await modal.locator('thead th').count() - 1
    const values = await modal.locator('[data-testid="run-value"], [data-testid="run-value-changed"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-value')))
    const changed = await modal.locator('[data-testid="run-value-changed"]').count()
    const inputsChanged = await modal.locator('[data-testid="run-input-changed"]').count()
    check('the history view shows the three runs with values 1, 2, 3; the two later values marked changed, the input never', cols === 3 && values.join(',') === '1,2,3' && changed === 2 && inputsChanged === 0, `cols=${cols} values=${values} changed=${changed} input=${inputsChanged}`)
    const valueDiffs = await modal.locator('[data-testid="run-value-diff"]').count()
    const dels3 = await modal.locator('[data-testid="run-value-diff"]').last().locator('[data-diff="del"]').allTextContents()
    const adds3 = await modal.locator('[data-testid="run-value-diff"]').last().locator('[data-diff="add"]').allTextContents()
    check('a changed value shows its token diff against the run before (2 → 3: - 2 / + 3)', valueDiffs === 2 && dels3.join() === '2' && adds3.join() === '3', `diffs=${valueDiffs} del=${dels3} add=${adds3}`)
    await modal.locator('thead button').first().click()
    await modal.waitFor({ state: 'detached', timeout: 5_000 }) /* the exit animation */
    await page.locator('.cc-cell.ring-2').first().waitFor({ timeout: 5_000 })
    const flashed = await page.locator('.cc-cell.ring-2').first().textContent()
    check('In [n] in the view closes it and flashes that cell', (await modal.count()) === 0 && /In \[2\]/.test(flashed ?? ''), (flashed ?? '').slice(0, 60))

    /* Sprint 22: a run with a changed input shows a line diff; export keeps the runs; import re-links them */
    await incf().hover()
    await incf().locator('button[title="Open as buffer"]').click()
    await page.locator('[data-testid="buffer-tab"][data-active="true"]').filter({ hasText: 'cell-' }).waitFor({ timeout: 5_000 })
    await setCode('(incf *runs* 10)\n')
    await incf().locator('button[title="Re-run"]').click()
    await waitValue('(incf *runs* 10)', '13')
    await page.locator('[data-testid="run-chip"]').last().click()
    await modal.waitFor({ timeout: 5_000 })
    const diffs = await modal.locator('[data-testid="run-input-diff"]').count()
    const dels = await modal.locator('[data-testid="run-input-diff"] [data-diff="del"]').allTextContents()
    const adds = await modal.locator('[data-testid="run-input-diff"] [data-diff="add"]').allTextContents()
    check('a run whose input changed shows a line diff against the run before: - (incf *runs*) / + (incf *runs* 10)', diffs === 1 && dels.length === 1 && adds.length === 1 && dels[0].includes('(incf *runs*)') && adds[0].includes('(incf *runs* 10)'), `diffs=${diffs} dels=${dels} adds=${adds}`)
    await page.keyboard.press('Escape')
    await modal.waitFor({ state: 'detached', timeout: 5_000 })

    const cellsBefore = await cells().count()
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      page.locator('button[title^="Export session as Markdown"]').click(),
    ])
    const mdPath = await download.path()
    const md = mdPath ? fs.readFileSync(mdPath, 'utf8') : ''
    const runHeads = md.split('\n').filter((l) => / · run \d\/4 of cell 2$/.test(l)).length
    check('the Markdown export labels the four runs `run k/4 of cell 2`', runHeads === 4, String(runHeads))
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), paletteCommand('Import session transcript')])
    await chooser.setFiles(mdPath)
    await page.waitForFunction((n) => document.querySelectorAll('.cc-cell').length === n, cellsBefore * 2, { timeout: 15_000 })
    const chipsAfter = await page.locator('[data-testid="run-chip"]').allTextContents()
    await page.locator('[data-testid="run-chip"]').last().click()
    await modal.waitFor({ timeout: 5_000 })
    const importedCols = await modal.locator('thead th').count() - 1
    const importedValues = await modal.locator('[data-testid="run-value"], [data-testid="run-value-changed"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-value')))
    await page.keyboard.press('Escape')
    await modal.waitFor({ state: 'detached', timeout: 5_000 })
    check('importing it re-links the runs: the imported cells carry run 1/4 … 4/4 of their own and the view shows their four values', chipsAfter.slice(4).join(' ') === 'run 1/4 run 2/4 run 3/4 run 4/4' && importedCols === 4 && importedValues.join(',') === '1,2,3,13', `chips=${chipsAfter.join(' ')} cols=${importedCols} values=${importedValues}`)

    /* Ctrl+R history search */
    const sessionBox = page.locator('[data-testid="session-input"] .cm-content')
    await sessionBox.click()
    await page.keyboard.type('(list :remembered 42)')
    await page.keyboard.press('Enter')
    await page.getByText('(:REMEMBERED 42)', { exact: true }).first().waitFor({ state: 'attached', timeout: 20_000 })
    await sessionBox.click()
    await page.keyboard.type('(+ 40 2)')
    await page.keyboard.press('Enter')
    await waitValue('(+ 40 2)', '42')
    await sessionBox.click()
    await page.keyboard.press('Control+r')
    const searchBox = page.locator('[data-testid="session-history-search"] input')
    await searchBox.waitFor({ timeout: 5_000 })
    /* Sprint 31: the list carries every distinct cell input newest first, with its cell number, then box-only history */
    const listedTexts = await page.locator('[data-testid="session-history-search"] [data-testid="history-entry"]').allTextContents()
    const listedCells = await page.locator('[data-testid="session-history-search"] [data-testid="history-cell"]').allTextContents()
    await searchBox.type('remem')
    const filtered = await page.locator('[data-testid="session-history-search"] [data-testid="history-entry"]').allTextContents()
    await searchBox.press('Enter')
    await page.waitForFunction(`document.querySelector('[data-testid="session-input"] .cm-content').textContent.trim() === '(list :remembered 42)'`, null, { timeout: 5_000 })
    check('Ctrl+R lists the session newest first — the two box forms, then the buffer-evaluated cells with In [n] chips; a substring filters it, Enter recalls the entry into the box',
      listedTexts[0] === '(+ 40 2)' && listedTexts[1] === '(list :remembered 42)' && listedTexts.some((t) => t.startsWith('(incf *runs*')) && listedCells.length === listedTexts.length && /^In \[\d+\]$/.test(listedCells[0]) && filtered.join('|') === '(list :remembered 42)' && (await searchBox.count()) === 0,
      `listed=${listedTexts.join('|')} cells=${listedCells.join('|')} filtered=${filtered.join('|')}`)
  },

  /* Sprint 24: the SBCL/wasm engine, when its artifacts are in public/sbcl/ (plain or .gz) — skipped otherwise */
  async sbcl({ page, check, setCode }) {
    const have = (f) => fs.existsSync(path.join(root, 'public', 'sbcl', f)) || fs.existsSync(path.join(root, 'public', 'sbcl', f + '.gz'))
    if (!['sbcl.wasm', 'sbcl.core', 'sbcl-core.wasm'].every(have)) throw new SkipScenario('SBCL artifacts not in public/sbcl/ (run scripts/fetch-sbcl.mjs)')
    await page.addInitScript(() => { try { localStorage.setItem('martingalecell-engine-pref', 'sbcl') } catch { /* private mode */ } })
    const bootT0 = Date.now()
    await page.goto(`${base}/ide`, { waitUntil: 'domcontentloaded' })
    await page.getByText('SBCL · WASM').first().waitFor({ timeout: 180_000 })
    const bootSeconds = ((Date.now() - bootT0) / 1000).toFixed(1)
    await page.locator('.cm-content').first().waitFor()
    const label = await page.getByText('SBCL 2.4.8').first().count()
    check(`with the engine preference set to sbcl, the IDE boots SBCL/wasm from the .gz artifacts in ${bootSeconds} s (status bar SBCL · WASM, label SBCL 2.4.8)`, label >= 1, String(label))
    await setCode('(list :engine (lisp-implementation-type) (+ 40 2))')
    await page.keyboard.press('Control+Enter')
    await page.waitForFunction(`[...document.querySelectorAll('.cc-cell')].some((c) => c.textContent.replace(/\\s+/g, '').includes(';;=>(:ENGINE"SBCL"42)'))`, null, { timeout: 60_000 })
    check('a cell evaluates on SBCL: (:ENGINE "SBCL" 42)', true)

    /* Sprint 35 (review blocker 3): Interrupt while more cells are queued
     * behind a CPU-bound image. The third cell's submit waits for the old
     * mailbox to drain; it must be dropped when the worker is replaced,
     * not time out 30 s later and mark the fresh image crashed. */
    await setCode('(loop)')
    await page.keyboard.press('Control+Enter')
    const interrupt = page.locator('button[title^="Interrupt this cell"]').first()
    await interrupt.waitFor({ timeout: 20_000 })
    await setCode('(+ 1 1)')
    await page.keyboard.press('Control+Enter')
    await setCode('(+ 2 2)')
    await page.keyboard.press('Control+Enter')
    const queuedAt = Date.now()
    await interrupt.click()
    /* the image is replaced: the status bar leaves and comes back */
    await page.waitForFunction(`!(document.querySelector('[data-testid="status-engine"]')?.textContent || '').includes('SBCL · WASM')`, null, { timeout: 30_000 }).catch(() => {})
    await page.getByText('SBCL · WASM').first().waitFor({ timeout: 180_000 })
    await page.locator('.cm-content').first().waitFor()
    await setCode('(+ 40 2)')
    await page.keyboard.press('Control+Enter')
    const back = await page.waitForFunction(`[...document.querySelectorAll('.cc-cell')].some((c) => c.textContent.replace(/\\s+/g, '').includes(';;=>42'))`, null, { timeout: 60_000 }).then(() => true).catch(() => false)
    check('after Interrupt with two cells queued, the respawned SBCL evaluates (+ 40 2) → 42', back)
    /* past the old 30 s mailbox timeout: the image must still be healthy */
    const left = 31_000 - (Date.now() - queuedAt)
    if (left > 0) await page.waitForTimeout(left)
    await setCode('(+ 1 2)')
    await page.keyboard.press('Control+Enter')
    const stillUp = await page.waitForFunction(`[...document.querySelectorAll('.cc-cell')].some((c) => c.textContent.replace(/\\s+/g, '').includes(';;=>3'))`, null, { timeout: 60_000 }).then(() => true).catch(() => false)
    const faulted = await page.evaluate(`document.body.textContent.includes('RUNTIME-FAULT') || document.body.textContent.includes('sbcl submit failed')`)
    check('31 s after the queued submit the image is still healthy: (+ 1 2) → 3, no RUNTIME-FAULT, no "sbcl submit failed"', stillUp && !faulted, `stillUp=${stillUp} faulted=${faulted}`)
  },

  /* Sprint 27: Settings → Lisp implementation switches engines through Restart, ECL comes back, the choice survives a reload and resets with the workspace */
  async engine({ page, check, setCode }) {
    await page.goto(`${base}/ide`, { waitUntil: 'domcontentloaded' })
    /* the 1.0 default: SBCL (the core engine) boots with no preference set */
    const sbclProgress = await page.waitForFunction(`(document.querySelector('[data-testid="status-engine"]')?.textContent || '').includes('MB')`, null, { timeout: 60_000 }).then(() => true).catch(() => false)
    await page.getByText('SBCL · WASM').first().waitFor({ timeout: 180_000 })
    await page.locator('.cm-content').first().waitFor()
    check('with no preference set, the default engine is SBCL (download shown in the status bar)', sbclProgress)

    const closeDrawer = async () => {
      /* the drawer closes from its backdrop or X, not Escape */
      const backdrop = page.locator('div.fixed.inset-0.z-40')
      if (await backdrop.isVisible().catch(() => false)) await backdrop.click({ position: { x: 8, y: 8 } })
      await backdrop.waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {})
    }
    const choose = async (engine) => {
      await page.locator('button[title="Settings"]').click()
      await page.getByRole('button', { name: engine, exact: true }).click()
      await closeDrawer()
    }
    const restart = async () => {
      await page.locator('button[title="Restart Lisp image"]').click()
      await page.getByRole('button', { name: 'Restart', exact: true }).click()
    }
    await choose('ecl')
    await restart()
    await page.getByText('ECL 24.5 · wasm32').first().waitFor({ timeout: 90_000 })
    await setCode('(lisp-implementation-type)')
    await page.keyboard.press('Control+Enter')
    await page.waitForFunction(`[...document.querySelectorAll('.cc-cell')].some((c) => c.textContent.replace(/\\s+/g, '').includes(';;=>"ECL"'))`, null, { timeout: 30_000 })
    check('choosing ecl and Restart Lisp image brings ECL up: (lisp-implementation-type) → "ECL"', true)

    /* Sprint 28: the manual switch back to SBCL from an ECL session */
    await choose('sbcl')
    await restart()
    const barProgress = await page.waitForFunction(`(document.querySelector('[data-testid="status-engine"]')?.textContent || '').includes('MB')`, null, { timeout: 60_000 }).then(() => true).catch(() => false)
    await page.getByText('SBCL · WASM').first().waitFor({ timeout: 180_000 })
    check('choosing sbcl from an ECL session and Restart Lisp image boots SBCL; the status bar shows the download while it restarts', barProgress)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('SBCL · WASM').first().waitFor({ timeout: 180_000 })
    const prefAfterReload = await page.evaluate(`localStorage.getItem('martingalecell-engine-pref')`)
    check('the choice survives a reload (SBCL boots, preference still sbcl)', prefAfterReload === 'sbcl', String(prefAfterReload))

    await page.locator('button[title="Settings"]').click()
    await page.getByRole('button', { name: 'Reset workspace' }).click()
    await page.getByRole('button', { name: 'Reset everything', exact: true }).click() /* the confirm sits above the drawer; the drawer can stay open for the check */
    await page.waitForFunction(`localStorage.getItem('martingalecell-engine-pref') === 'auto'`, null, { timeout: 5_000 }).catch(() => {})
    const prefAfterReset = await page.evaluate(`localStorage.getItem('martingalecell-engine-pref')`)
    check('Reset workspace puts the choice back to auto', prefAfterReset === 'auto', String(prefAfterReset))
  },
}

/* scenarios that do not need the IDE booted first (sbcl and engine boot their own way) */
const NO_BOOT = new Set(['landing', 'sbcl', 'engine', 'offline'])

if (argv.includes('--list')) { console.log(Object.keys(scenarios).join('\n')); process.exit(0) }
const selected = only.length ? only : Object.keys(scenarios)
const unknown = selected.filter((s) => !scenarios[s])
if (unknown.length) { console.error(`unknown scenario(s): ${unknown.join(', ')} — available: ${Object.keys(scenarios).join(', ')}`); process.exit(2) }

/* ---- runner ---- */

const results = []
const report = { startedAt: new Date().toISOString(), base, scenarios: [] }
/* SMOKE_CHROMIUM: use an installed Chromium instead of the one this playwright version expects (a container with a different build) */
const browser = await chromium.launch({ headless: true, ...(process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM } : {}) })
for (const name of selected) {
  const entry = { name, seconds: 0, checks: [], skipped: null }
  report.scenarios.push(entry)
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const check = (label, ok, detail = '') => { entry.checks.push({ label, ok: !!ok, detail: ok ? '' : String(detail) }); results.push(`${ok ? '✓' : '✗'} [${name}] ${label}${ok || !detail ? '' : `\n    ${detail}`}`) }
  const t = tools(page, check)
  const t0 = Date.now()
  try {
    if (!NO_BOOT.has(name)) await t.bootIde()
    await scenarios[name](t)
    check('no uncaught page errors', errors.length === 0, errors.join(' | '))
  } catch (e) {
    if (e instanceof SkipScenario) {
      entry.skipped = e.message
      results.push(`– [${name}] skipped: ${e.message}`)
    } else {
      check('scenario completed', false, e?.message ?? String(e))
      const shot = path.join(root, 'dist', `smoke-failure-${name}.png`)
      await page.screenshot({ path: shot }).then(() => { entry.screenshot = shot }).catch(() => {})
    }
  } finally {
    entry.seconds = Number(((Date.now() - t0) / 1000).toFixed(1))
    console.error(`  ${name}: ${entry.seconds} s`)
    await context.close()
  }
}
await browser.close()
console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
const skipped = results.filter((r) => r.startsWith('–')).length
const passed = results.length - failed - skipped
report.passed = passed; report.failed = failed; report.skipped = skipped; report.finishedAt = new Date().toISOString()
if (jsonOut) { fs.mkdirSync(path.dirname(path.resolve(jsonOut)), { recursive: true }); fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + '\n'); console.error(`  report: ${jsonOut}`) }
console.log(failed ? `\nFAIL: ${failed} check(s) failed${skipped ? `, ${skipped} scenario(s) skipped` : ''}` : `\nPASS: ${passed} checks passed${skipped ? `, ${skipped} scenario(s) skipped` : ''}`)
process.exit(failed ? 1 : 0)
