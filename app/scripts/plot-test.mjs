/* gnuplot-subset parser + SVG builder test (Sprint 30): bundles
 * src/plot/gnuplot.ts and src/plot/build-svg.ts with esbuild and checks
 * how a plot line is split into series, that function expressions and
 * missing data files are kept as "not drawn" series (named in the SVG
 * instead of dropped), that `""` reuses the previous file, and that data
 * series are still drawn.
 *
 * Usage: node scripts/plot-test.mjs   (exit 0 iff every check passes)
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); return ok }

const built = await esbuild.build({
  stdin: {
    contents: "export { parseGnuplot, splitPlotSegments } from './src/plot/gnuplot'\nexport { buildSvg } from './src/plot/build-svg'\n",
    resolveDir: root, loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
  alias: { '@': path.join(root, 'src') },
  logLevel: 'silent',
})
const { parseGnuplot, splitPlotSegments, buildSvg } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))

const files = [
  { path: '/tmp/a', content: '1 2 3\n2 4 6\n' },
  { path: '/tmp/b', content: '1 20\n2 40\n' },
]
const shape = (spec) => spec.series.map((s) => `${s.title ?? s.label ?? '?'}:${s.missing ?? s.style}:${s.points.length}`).join(' ')

/* 1. splitting: commas inside quotes and parentheses do not separate series */
const segs = splitPlotSegments('"/tmp/a" using 1:2 title "x, y" with lines, f(x, 2) title "f", "/tmp/b" u 1:2')
check('splitPlotSegments keeps commas inside quotes and parentheses', segs.length === 3 && segs[0].includes('"x, y"') && segs[1] === 'f(x, 2) title "f"', JSON.stringify(segs))

/* 2. a data series followed by a function: both kept, the function not drawn */
const s2 = parseGnuplot('plot "/tmp/a" using 1:2 title "a" with lines, sin(x) title "s" with lines\n', files)
check('data series + function series: a:lines:2 s:function:0', shape(s2) === 'a:lines:2 s:function:0', shape(s2))
check('the function series carries its expression as label', s2.series[1].label === 'sin(x)', String(s2.series[1].label))

/* 3. a function-only plot: one not-drawn series, labelled by the expression */
const s3 = parseGnuplot('plot sin(x)\n', files)
check('plot sin(x) yields one function series labelled sin(x)', shape(s3) === 'sin(x):function:0', shape(s3))

/* 4. a data file that was not shipped: kept as no-data, labelled by its path */
const s4 = parseGnuplot('plot "/tmp/missing" using 1:2 with points\n', files)
check('a data file not in the payload becomes a no-data series labelled by its path', shape(s4) === '/tmp/missing:no-data:0' && s4.series[0].sourcePath === '/tmp/missing', shape(s4))

/* 5. "" reuses the previous series' file (gnuplot semantics) */
const s5 = parseGnuplot('plot "/tmp/a" using 1:2 title "y", "" using 1:3 title "z"\n', files)
check('"" reuses the previous file: second series reads column 3 of /tmp/a', s5.series.length === 2 && s5.series[1].sourcePath === '/tmp/a' && s5.series[1].points.map((p) => p.y).join(',') === '3,6' && !s5.series[1].missing, shape(s5))

/* 6. a leading "" with nothing before it stays a no-data series (nothing to reuse) */
const s6 = parseGnuplot('plot "" using 1:2\n', files)
check('a leading "" has nothing to reuse and is a no-data series', shape(s6) === '"":no-data:0', shape(s6))

/* 7. the SVG names the not-drawn series and still draws the data series */
const svg7 = buildSvg(s2)
check('buildSvg draws the data series (polyline with 2 points)', /<polyline[^>]*points="[^"]+ [^"]+"/.test(svg7))
check('buildSvg footnote names the function series', /not drawn: s \(function\)/.test(svg7), svg7.match(/not drawn:[^<]*/)?.[0] ?? '(no footnote)')
check('buildSvg legend marks the function series "(not drawn)"', /s \(not drawn\)/.test(svg7))
check('the footnote carries the count for the UI', /data-plot-missing="1"/.test(svg7))

/* 8. no-data footnote wording, and no footnote at all when every series is drawn */
const svg8 = buildSvg(s4)
check('a no-data series is footnoted with "(no data)"', /not drawn: \/tmp\/missing \(no data\)/.test(svg8), svg8.match(/not drawn:[^<]*/)?.[0] ?? '(no footnote)')
const svgAll = buildSvg(parseGnuplot('plot "/tmp/a" using 1:2 with lines, "/tmp/b" using 1:2 with points\n', files))
check('two fully drawn series: no footnote, no data-plot-missing', !/not drawn/.test(svgAll) && !/data-plot-missing/.test(svgAll))

/* 9. set nokey: no legend, but the footnote still tells the truth */
const svg9 = buildSvg(parseGnuplot('set nokey\nplot "/tmp/a" using 1:2 with lines, cos(x)\n', files))
check('with set nokey the footnote still names cos(x)', /not drawn: cos\(x\) \(function\)/.test(svg9) && !/\(not drawn\)/.test(svg9))

/* 10. the untitled function series in a legend is listed under its expression */
const svg10 = buildSvg(parseGnuplot('plot "/tmp/a" using 1:2 title "a" with lines, cos(x)\n', files))
check('an untitled function series appears in the legend as cos(x) (not drawn)', /cos\(x\) \(not drawn\)/.test(svg10))

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} of ${results.length} checks failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
