/* Unit test of the ANSI screen (src/terminal/ansi.ts), bundled with
 * esbuild like the plot modules in the boot harness. Exit 0 = pass.
 *
 *   node scripts/ansi-test.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entry = path.join(os.tmpdir(), `conscell-ansi-entry-${process.pid}.ts`)
const outfile = path.join(os.tmpdir(), `conscell-ansi-bundle-${process.pid}.mjs`)
fs.writeFileSync(entry, `export { AnsiScreen, hasAnsi } from ${JSON.stringify(path.join(root, 'src/terminal/ansi'))}\n`)
esbuild.buildSync({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' })
const { AnsiScreen, hasAnsi } = await import(outfile)

let fails = 0
const check = (ok, label) => { console.log((ok ? '✓ ' : '✗ ') + label); if (!ok) fails++ }

/* detection */
check(!hasAnsi('plain'), 'hasAnsi: plain text is not ANSI')
check(hasAnsi('x' + String.fromCharCode(27) + '[2J'), 'hasAnsi: ESC[ detected')

/* plain text lands row by row */
{
  const s = new AnsiScreen()
  s.feed('hello\nworld')
  check(s.text() === 'hello\nworld', 'plain text: two rows')
}

/* clear + cursor addressing */
{
  const s = new AnsiScreen()
  const E = String.fromCharCode(27)
  s.feed(E + '[2J' + E + '[H') /* clear + home */
  s.feed('alpha')
  s.feed(E + '[2;3H') /* row 2, col 3 */
  s.feed('beta')
  const t = s.text().split('\n')
  check(t[0] === 'alpha', 'clear/home: first row written from home')
  check(t[1] === '  beta', 'cursor addressing: ESC[2;3H places text at row 2 col 3')
}

/* colors: SGR applies per character */
{
  const s = new AnsiScreen()
  const E = String.fromCharCode(27)
  s.feed(E + '[32m' + 'g' + E + '[0m' + 'n')
  const f = s.frame()
  check(f.rows[0][0].s.includes('19c37d') || /green|32/.test(f.rows[0][0].s), 'SGR 32 styles the character')
  check(f.rows[0][1].s === '', 'SGR 0 resets the style')
}

/* erase to end of line */
{
  const s = new AnsiScreen()
  const E = String.fromCharCode(27)
  s.feed('abcdef')
  s.feed(E + '[1;4H' + E + '[K') /* cursor to col 4 of row 1, erase to EOL */
  check(s.text() === 'abc', 'ESC[K erases from the cursor to end of line')
}

/* the matrix pattern: clear, green, scattered cursor writes */
{
  const s = new AnsiScreen()
  const E = String.fromCharCode(27)
  s.feed(E + '[2J' + E + '[32m')
  for (const [r, c, ch] of [[0, 0, 'a'], [0, 2, 'b'], [3, 1, 'z']]) {
    s.feed(E + `[${r + 1};${c + 1}H` + ch)
  }
  const t = s.text().split('\n')
  check(t[0] === 'a b' && t[3] === ' z', 'matrix pattern: scattered writes land on the grid')
  check(s.frame().rows[3][1].s !== '', 'matrix pattern: the green style survived')
}

/* runaway writer is capped */
{
  const s = new AnsiScreen()
  s.feed('x'.repeat(100000))
  check(s.frame().rows.length <= 400, 'screen capped at 400 rows/500 cols')
}

console.log(fails ? `\nFAIL: ${fails} check(s)` : '\nPASS: ansi screen')
process.exit(fails ? 1 : 0)
