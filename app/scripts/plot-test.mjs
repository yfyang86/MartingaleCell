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
    contents: "export { parseGnuplot, splitPlotSegments } from './src/plot/gnuplot'\nexport { buildSvg, plotXRange } from './src/plot/build-svg'\nexport { compileExpression, sampleFunction } from './src/plot/expr'\n",
    resolveDir: root, loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
  alias: { '@': path.join(root, 'src') },
  logLevel: 'silent',
})
const { parseGnuplot, splitPlotSegments, buildSvg, plotXRange, compileExpression, sampleFunction } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))

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

/* 7. the SVG names a series it cannot draw and still draws the data series */
const s7 = parseGnuplot('plot "/tmp/a" using 1:2 title "a" with lines, foo(x) title "s" with lines\n', files)
const svg7 = buildSvg(s7)
check('buildSvg draws the data series (polyline with 2 points)', /<polyline[^>]*points="[^"]+ [^"]+"/.test(svg7))
check('buildSvg footnote names the unknown-function series', /not drawn: s \(function\)/.test(svg7), svg7.match(/not drawn:[^<]*/)?.[0] ?? '(no footnote)')
check('buildSvg legend marks that series "(not drawn)"', /s \(not drawn\)/.test(svg7))
check('the footnote carries the count for the UI', /data-plot-missing="1"/.test(svg7))

/* 8. no-data footnote wording, and no footnote at all when every series is drawn */
const svg8 = buildSvg(s4)
check('a no-data series is footnoted with "(no data)"', /not drawn: \/tmp\/missing \(no data\)/.test(svg8), svg8.match(/not drawn:[^<]*/)?.[0] ?? '(no footnote)')
const svgAll = buildSvg(parseGnuplot('plot "/tmp/a" using 1:2 with lines, "/tmp/b" using 1:2 with points\n', files))
check('two fully drawn series: no footnote, no data-plot-missing', !/not drawn/.test(svgAll) && !/data-plot-missing/.test(svgAll))

/* 9. set nokey: no legend, but the footnote still tells the truth */
const svg9 = buildSvg(parseGnuplot('set nokey\nplot "/tmp/a" using 1:2 with lines, bar(x)\n', files))
check('with set nokey the footnote still names bar(x)', /not drawn: bar\(x\) \(function\)/.test(svg9) && !/\(not drawn\)/.test(svg9))

/* 10. the untitled unknown-function series in a legend is listed under its expression */
const svg10 = buildSvg(parseGnuplot('plot "/tmp/a" using 1:2 title "a" with lines, bar(x)\n', files))
check('an untitled unknown-function series appears in the legend as bar(x) (not drawn)', /bar\(x\) \(not drawn\)/.test(svg10))

/* ---- Sprint 31: the expression evaluator ---- */
const at = (src, x) => { const f = compileExpression(src); return f ? f(x) : null }
const near = (a, b) => a !== null && Math.abs(a - b) < 1e-9
check('precedence: 2+3*4 = 14', near(at('2+3*4', 0), 14), String(at('2+3*4', 0)))
check('-x**2 is -(x**2), as in gnuplot: -9 at x=3', near(at('-x**2', 3), -9), String(at('-x**2', 3)))
check('** is right-associative: 2**3**2 = 512', near(at('2**3**2', 0), 512), String(at('2**3**2', 0)))
check('sin(pi/2) = 1', near(at('sin(pi/2)', 0), 1))
check('atan2(x, 1) at 1 = pi/4', near(at('atan2(x, 1)', 1), Math.PI / 4))
check('abs(x-1) at 0 = 1; exp(-x)/2 at 0 = 0.5; 10 % 3 = 1', near(at('abs(x-1)', 0), 1) && near(at('exp(-x)/2', 0), 0.5) && near(at('10 % 3', 0), 1))
check('1.5e2*x + .5 at 2 = 300.5', near(at('1.5e2*x + .5', 2), 300.5), String(at('1.5e2*x + .5', 2)))
check('unknown function, dangling operator, unbalanced paren, wrong arity, unknown name → null',
  compileExpression('foo(x)') === null && compileExpression('x +') === null && compileExpression('sin(') === null && compileExpression('sin(x, 1)') === null && compileExpression('y') === null)

/* sampling */
const segLog = sampleFunction(compileExpression('log(x)'), -1, 1, 41)
check('log(x) over [-1,1]: one segment, only x > 0', segLog.length === 1 && segLog[0].every((p) => p.x > 0) && segLog[0].length === 20, `${segLog.length} segs, ${segLog[0]?.length} pts`)
const segInv = sampleFunction(compileExpression('1/x'), -1, 1, 41)
check('1/x over [-1,1]: the asymptote splits the line into two segments', segInv.length === 2, `${segInv.length} segs`)
const segSin = sampleFunction(compileExpression('sin(x)'), -10, 10)
check('sin(x): one continuous segment of 200 samples', segSin.length === 1 && segSin[0].length === 200)

/* rendering */
const only = parseGnuplot('plot sin(x)\n', files)
check('a function-only plot uses gnuplot\'s default x-range [-10:10]', plotXRange(only).join(',') === '-10,10', plotXRange(only).join(','))
const svgOnly = buildSvg(only)
check('plot sin(x) is drawn: a polyline, no footnote, ticks at -10 and 10', /<polyline /.test(svgOnly) && !/not drawn/.test(svgOnly) && />-10<\/text>/.test(svgOnly) && />10<\/text>/.test(svgOnly))
check('its legend entry is the expression, without "(not drawn)"', />sin\(x\)<\/text>/.test(svgOnly) && !/\(not drawn\)/.test(svgOnly))
const ranged = parseGnuplot('set xrange [0:1]\nplot x**2\n', files)
check('set xrange bounds the sampling: x**2 over [0:1]', plotXRange(ranged).join(',') === '0,1' && /<polyline /.test(buildSvg(ranged)))
const mixed = parseGnuplot('plot "/tmp/a" using 1:2 title "a" with lines, x**2 title "sq"\n', files)
const svgMixed = buildSvg(mixed)
check('data + function: the function is sampled over the data range and drawn; no footnote', (svgMixed.match(/<polyline /g) ?? []).length === 2 && !/not drawn/.test(svgMixed) && />sq<\/text>/.test(svgMixed))
check('a function series defaults to lines; "with points" is honoured', only.series[0].style === 'lines' && parseGnuplot('plot sin(x) with points\n', files).series[0].style === 'points')
const both = buildSvg(parseGnuplot('plot sin(x) title "ok", foo(x) title "bad"\n', files))
check('drawn and not-drawn functions side by side: one polyline, footnote names only bad', /<polyline /.test(both) && /not drawn: bad \(function\)/.test(both) && !/ok \(not drawn\)/.test(both))

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} of ${results.length} checks failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
