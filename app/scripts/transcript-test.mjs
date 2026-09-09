/* Session export test: bundles src/session/transcript.ts with esbuild
 * (a dependency already) and checks the Markdown and .lisp transcripts
 * for a fixture session with values, output, a warning, an error with
 * frames, a resumed cell, a plot and a project-load cell.
 *
 * Usage: node scripts/transcript-test.mjs   (exit 0 iff every check passes)
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); return ok }

const built = await esbuild.build({
  stdin: {
    contents: "export * from './src/session/transcript'\nexport { parseGnuplot } from './src/plot/gnuplot'\n",
    resolveDir: root, loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
  alias: { '@': path.join(root, 'src') },
  logLevel: 'silent',
})
const mod = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const { buildMarkdownTranscript, buildLispTranscript, transcriptFileName, encodeBase64, parseGnuplot, parseMarkdownTranscript } = mod

const plotSpec = parseGnuplot('set title "squares"\nplot "/tmp/d.dat" using 1:2 with lines title "y = x^2"\n', [{ path: '/tmp/d.dat', content: '0 0\n1 1\n2 4\n3 9\n' }])
const base = { bufferName: undefined, warnings: [], values: [], stdout: '', durationMs: 12, startedAt: 0, restartsUsed: 0 }
const cells = [
  { ...base, id: 'c1', n: 1, pkg: 'CL-USER', status: 'done', input: '(defun sq (x) (* x x))\n(sq 12)', values: ['SQ', '144'] },
  { ...base, id: 'c2', n: 2, pkg: 'CL-USER', status: 'done', input: '(format t "hi~%there~%")\n(warn "careful")', stdout: 'hi\nthere\n', values: ['NIL', 'NIL'], warnings: ['careful'] },
  { ...base, id: 'c3', n: 3, pkg: 'CL-USER', status: 'error', input: '(defun boom () (/ 1 0))\n(boom)', error: 'Division by zero', errorType: 'DIVISION-BY-ZERO', frames: ['BOOM'], details: [{ key: 'operation', value: '/' }, { key: 'operands', value: '(1 0)' }], durationMs: 2300 },
  { ...base, id: 'c4', n: 4, pkg: 'MY-PKG', status: 'done', input: '(car x)', values: ['7'], resumedVia: 'STORE-VALUE', restartsUsed: 1 },
  { ...base, id: 'c5', n: 5, pkg: 'MY-PKG', status: 'done', input: '(plot fig)', values: ['NIL'], plots: [{ spec: plotSpec, script: '', outputName: undefined }] },
  { ...base, id: 'c6', n: 6, pkg: 'CL-USER', status: 'done', kind: 'project', input: '', project: { projectName: 'cl-plot', files: [{ path: 'src/a.lisp', status: 'ok', message: '3 forms' }, { path: 'src/b|c.lisp', status: 'warn', message: 'careful: HERE' }], packages: [{ name: 'CL-PLOT', externalCount: 9 }], hint: undefined } },
  { ...base, id: 'c7', n: 7, pkg: 'CL-USER', status: 'aborted', input: '(loop)', durationMs: 5000 },
  { ...base, id: 'c8', n: 8, pkg: 'CL-USER', status: 'done', input: '"a ``` b"', values: ['"a ``` b"'] },
]
const when = new Date(2026, 8, 9, 15, 30)
const md = buildMarkdownTranscript(cells, { engine: 'ECL 24.5 (WECL)', exportedAt: when })
const lisp = buildLispTranscript(cells, { engine: 'ECL 24.5 (WECL)', exportedAt: when })
if (process.argv.includes('--show')) { console.log(md); console.log(lisp) }

/* names */
check('file name carries the date and extension', transcriptFileName('md', when) === 'conscell-session-2026-09-09-1530.md' && transcriptFileName('lisp', when).endsWith('.lisp'), transcriptFileName('md', when))
check('encodeBase64 matches Buffer for UTF-8 text', encodeBase64('héllo ×') === Buffer.from('héllo ×').toString('base64') && encodeBase64('ab') === 'YWI=' && encodeBase64('a') === 'YQ==')

/* markdown */
check('md: header with export time, engine and cell count', md.startsWith('# ConsCell session\n\nExported 2026-09-09 15:30 · ECL 24.5 (WECL) · 8 cells'), md.slice(0, 80))
check('md: cell 1 is a lisp fence with the input and the values', /## Cell 1 · `CL-USER` · 12 ms\n\n```lisp\n\(defun sq \(x\) \(\* x x\)\)\n\(sq 12\)\n```\n\n```lisp\n;;=> SQ\n;;=> 144\n```/.test(md))
check('md: output block and a warning quote', md.includes('**Output**\n```text\nhi\nthere\n```') && md.includes('> ⚠️ careful'))
check('md: error with type, report, details and frames; no values', md.includes('**Error** `DIVISION-BY-ZERO`\n```text\nDivision by zero\n```') && md.includes('- operation: `/`') && md.includes('Frames (innermost first): `BOOM`') && !md.includes('## Cell 3 · `CL-USER` · 2.30 s\n\n```lisp\n(defun boom () (/ 1 0))\n(boom)\n```\n\n```lisp\n;;=>'), md.split('## Cell 3')[1]?.split('## Cell 4')[0])
check('md: duration over a second is shown in seconds', md.includes('## Cell 3 · `CL-USER` · 2.30 s'))
check('md: resumed cell says which restart', md.includes('_Resumed via `STORE-VALUE`._'))
const img = md.match(/!\[squares\]\(data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)\)/)
check('md: the plot is an inline SVG data-URI image titled from the spec', !!img)
const svg = img ? Buffer.from(img[1], 'base64').toString('utf8') : ''
check('md: the embedded SVG is a real plot (svg root, a series path, the title)', svg.startsWith('<svg') && /<path/.test(svg) && svg.includes('squares'), svg.slice(0, 120))
check('md: project cell renders a file table with | escaped, packages and no code fence', md.includes('## Cell 6 · project load `cl-plot`') && md.includes('| `src/b\\|c.lisp` | warn | careful: HERE |') && md.includes('Packages: `CL-PLOT` (9 external)') && !/## Cell 6[^#]*```lisp/.test(md), md.split('## Cell 6')[1]?.split('## Cell 7')[0])
check('md: aborted cell is marked', md.includes('_Evaluation aborted._'))
check('md: a value containing ``` gets a longer fence', md.includes('````lisp\n;;=> "a ``` b"\n````'), md.split('## Cell 8')[1])

/* lisp */
check('lisp: header and cell banners', lisp.startsWith(';;;; ConsCell session — exported 2026-09-09 15:30 · ECL 24.5 (WECL)\n;;;; 8 cells.') && lisp.includes(';;; ---- cell 1 · CL-USER · 12 ms ----\n(defun sq (x) (* x x))\n(sq 12)\n;;=> SQ\n;;=> 144'), lisp.slice(0, 200))
check('lisp: OUT and WARNING lines are comments', lisp.includes(';; OUT hi\n;; OUT there\n;; WARNING: careful'))
check('lisp: an error replaces the values and carries the type', lisp.includes('(boom)\n;; ERROR (DIVISION-BY-ZERO): Division by zero') && !lisp.includes('(boom)\n;;=>'))
check('lisp: in-package is emitted when the package changes, not for the first CL-USER cell', lisp.includes(';;; ---- cell 4 · MY-PKG · 12 ms ----\n(in-package :my-pkg)\n(car x)') && !lisp.includes('cell 1 · CL-USER · 12 ms ----\n(in-package') && !lisp.includes('cell 5 · MY-PKG · 12 ms ----\n(in-package') && lisp.includes('cell 7 · CL-USER · 5.00 s ----\n(in-package :cl-user)'), lisp)
check('lisp: resumed / plot / aborted notes', lisp.includes(';; resumed via STORE-VALUE') && lisp.includes(';; 1 plot captured') && lisp.includes('(loop)\n;; Evaluation aborted.'))
check('lisp: project cell lists files as comments only', lisp.includes(';;; ---- cell 6 · project load cl-plot · 12 ms ----\n;;   ok      src/a.lisp  ; 3 forms\n;;   warn    src/b|c.lisp  ; careful: HERE'), lisp.split('cell 6')[1]?.split('cell 7')[0])
check('lisp: every non-comment line is one of the inputs (the file evaluates as it is)', lisp.split('\n').filter((l) => l && !l.startsWith(';')).every((l) => l.startsWith('(in-package') || cells.some((c) => c.input.split('\n').includes(l))), lisp.split('\n').filter((l) => l && !l.startsWith(';')).join(' | '))

/* Markdown import: the export round-trips */
const back = parseMarkdownTranscript(md)
check('import: one cell per section, numbers and packages preserved', back.length === 8 && back.map((c) => c.n).join() === '1,2,3,4,5,6,7,8' && back[3].pkg === 'MY-PKG' && back[0].pkg === 'CL-USER', JSON.stringify(back.map((c) => [c.n, c.pkg])))
check('import: inputs and values round-trip', back[0].input === cells[0].input && back[0].values.join('|') === 'SQ|144' && back[7].values[0] === '"a ``` b"' && back[7].input === '"a ``` b"', JSON.stringify([back[0], back[7]]))
check('import: output and warnings', back[1].stdout === 'hi\nthere\n' && back[1].warnings.join() === 'careful' && back[1].values.join() === 'NIL,NIL', JSON.stringify(back[1]))
check('import: error with type, no values, duration in seconds', back[2].status === 'error' && back[2].error === 'Division by zero' && back[2].errorType === 'DIVISION-BY-ZERO' && back[2].values.length === 0 && back[2].durationMs === 2300, JSON.stringify(back[2]))
check('import: resumed-via and aborted state', back[3].resumedVia === 'STORE-VALUE' && back[3].status === 'done' && back[6].status === 'aborted' && back[6].input === '(loop)', JSON.stringify([back[3], back[6]]))
check('import: a plot cell keeps its input and values (the image is dropped)', back[4].input === '(plot fig)' && back[4].values.join() === 'NIL', JSON.stringify(back[4]))
check('import: project cell with file table, | unescaped, no input', back[5].kind === 'project' && back[5].project.projectName === 'cl-plot' && back[5].project.files.length === 2 && back[5].project.files[1].path === 'src/b|c.lisp' && back[5].project.files[1].status === 'warn' && back[5].project.files[1].message === 'careful: HERE' && back[5].input === '', JSON.stringify(back[5]))
const hand = `# Notes I wrote by hand

Some prose before the first cell that must be ignored, with a stray \`\`\`lisp fence:

\`\`\`lisp
(not-a-cell)
\`\`\`

## Cell 3 · \`CL-USER\`

Explanation of what I am about to do.

\`\`\`\`lisp
(defun f (x)
  "has \`\`\` inside"
  x)
\`\`\`\`

\`\`\`\`lisp
;;=> F
\`\`\`\`

> ⚠️ first line
> second line

## Cell 4 · \`CL-USER\` · 1.50 s
\`\`\`lisp
(f 1)
\`\`\`
**Output**
\`\`\`text
printed
\`\`\`
\`\`\`lisp
;;=> 1
\`\`\`
`
const h = parseMarkdownTranscript(hand)
check('import: hand-edited transcript — prose and a fence before the first cell are ignored', h.length === 2 && h[0].n === 3 && h[1].n === 4, JSON.stringify(h.map((c) => c.n)))
check('import: four-backtick fences and a multi-line warning', h[0].input === '(defun f (x)\n  "has ``` inside"\n  x)' && h[0].values.join() === 'F' && h[0].warnings[0] === 'first line\nsecond line', JSON.stringify(h[0]))
check('import: output fence and duration without a package label', h[1].stdout === 'printed\n' && h[1].durationMs === 1500 && h[1].values.join() === '1', JSON.stringify(h[1]))
check('import: an empty or unrelated document yields no cells', parseMarkdownTranscript('').length === 0 && parseMarkdownTranscript('# just a title\n\ntext').length === 0)

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} check(s) failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
