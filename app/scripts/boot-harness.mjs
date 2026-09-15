/* Node harness: boot the REAL wecl-worker.js against the REAL wecl.wasm,
 * outside a browser. Mocks the worker globals (self, postMessage,
 * importScripts) and maps emscripten's fs reads of "/wecl/*" into public/.
 *
 * Usage: node scripts/boot-harness.mjs [--timeout-ms N]
 * Exit 0 iff the boot message sequence ends with {type:'ready'}.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'
import { loadSampleProject } from './lib/sample-project.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sampleProject = process.argv.includes('--exercise') ? await loadSampleProject() : null
const publicDir = path.join(root, 'public')
const timeoutIdx = process.argv.indexOf('--timeout-ms')
const timeoutMs = timeoutIdx >= 0 ? Number(process.argv[timeoutIdx + 1]) || 90_000 : 90_000

const messages = []
const t0 = Date.now()
const log = (m) => {
  messages.push(m)
  const dt = ((Date.now() - t0) / 1000).toFixed(1).padStart(6)
  if (m.type === 'boot') console.log(`${dt}s  boot: ${m.line}`)
  else if (m.type === 'stdout') console.log(`${dt}s  out[${m.id}]: ${m.text}`)
  else if (m.type === 'stderr') console.log(`${dt}s  err[${m.id}]: ${m.text}`)
  else console.log(`${dt}s  ${m.type}: ${m.message ?? ''}`)
}

/* patched fs: emscripten (node mode) reads locateFile() paths — the worker's
 * Module.locateFile returns "/wecl/<name>", so map that into public/. */
const patchedFs = Object.create(fs)
patchedFs.readFileSync = function (p, opts) {
  const s = String(p)
  if (s.startsWith('/wecl/')) return fs.readFileSync(path.join(publicDir, s), opts)
  return fs.readFileSync(p, opts)
}

const sandbox = {
  console,
  process,
  setTimeout, clearTimeout, setInterval, clearInterval,
  TextDecoder, TextEncoder, WebAssembly, Uint8Array, ArrayBuffer, Buffer, URL, performance,
  Promise, Error, TypeError, RegExp, JSON, Math, Date, Map, Set, String, Number, Boolean, Array, Object,
  queueMicrotask,
  fetch,
  require: (m) => (m === 'fs' ? patchedFs : null),
  __dirname: path.join(publicDir, 'wecl'),
  __filename: path.join(publicDir, 'wecl', 'wecl.js'),
  postMessage: (m) => log(m),
}
sandbox.importScripts = (...urls) => {
  for (const url of urls) {
    const file = path.join(publicDir, String(url))
    const src = fs.readFileSync(file, 'utf8')
    vm.runInContext(src, context, { filename: String(url) })
  }
}

const context = vm.createContext(sandbox)
/* Browser-faithful `self`: a read-only alias of the global object. The WECL
 * glue contains `self = new cl_object_ref` (an implicit-global assignment in
 * an ASM_CONSTS callback); in a real worker this silently no-ops, but in a
 * plain vm sandbox it would clobber `self`. */
vm.runInContext(
  'Object.defineProperty(globalThis, "self", { get: function () { return globalThis }, configurable: false })',
  context,
)

let workerSrc = fs.readFileSync(path.join(publicDir, 'wecl-worker.js'), 'utf8')
if (process.env.HARNESS_CORRUPT_TAIL) {
  /* resilience check: an eval-erroring form + a form with an unreadable
   * symbol appended to the helper — boot must still reach ready (the core
   * cc:eval-string is defined earlier) and report ;;BOOT-ERROR lines. */
  workerSrc = workerSrc.replace(
    "].join('\\n')",
    "  '(this-boot-form-has-no-function 1 2)',\n  '(defun cc-bad-read () (ext:cd \"/\"))',\n].join('\\n')",
  )
  if (!workerSrc.includes('cc-bad-read')) throw new Error('corrupt-tail patch did not apply')
}
if (process.env.HARNESS_CORRUPT_HELPER) {
  /* resilience check: cc:eval-string never gets defined — boot must post
   * bootfail FAST (not hang in the debugger, not spin for 30s). */
  workerSrc = workerSrc.replace("'(defun eval-string (src)',", "'(defun eval-string-xxx (src)',")
  if (workerSrc.includes('(defun eval-string (src)')) throw new Error('corrupt-helper patch did not apply')
}
if (process.env.HARNESS_DEBUG) {
  workerSrc = workerSrc.replace(
    ".catch(function () {\n        if (attempts < 60) {",
    ".catch(function (e) {\n        console.log('WARMUP CATCH attempt=' + attempts + ':', e && (e.stack || e.message || e), '| self===globalThis:', self === globalThis, '| typeof postMessage:', typeof self.postMessage);\n        if (attempts < 60) {",
  )
}

let done = false
const finish = (ok, why) => {
  if (done) return
  done = true
  const seq = messages.map((m) => m.type)
  console.log('\n--- message type sequence ---')
  console.log(seq.join(' -> '))
  console.log(ok ? `\nPASS: ${why}` : `\nFAIL: ${why}`)
  process.exit(ok ? 0 : 1)
}

const origLog = log
sandbox.postMessage = (m) => {
  origLog(m)
  if (m.type === 'ready') {
    if (process.argv.includes('--exercise')) exercise()
    else finish(true, 'boot reached ready')
  }
  if (m.type === 'bootfail') finish(false, 'bootfail: ' + m.message)
  if (m.type === 'crash') finish(false, 'crash: ' + m.message)
}

/* --exercise: after ready, run an eval job, a full cl-plot project load,
 * and post-load acceptance evals against the real image. Asserts the loader
 * contract (asd-ordered loading, no EXT reader errors, no FIGURE ordering
 * error, honest package reporting, working project API) AND the gnuplot
 * capture contract: a ;;PLOT64 payload arrives during the load (from
 * plot-example's (show *fig*)), the script + referenced data file check out,
 * and a fresh (show …) in a later eval job attributes the plot to THAT job. */
/* Sprint 29: a gnuplot script whose plot line names two data files (with a
 * quoted title in between, which must not be mistaken for a path); Sprint 30
 * adds a third, function series whose quoted title must not ship as a file */
const TWO_SERIES_CODE = String.raw`(progn
  (with-open-file (o "/tmp/cc-two-a.dat" :direction :output :if-exists :overwrite :if-does-not-exist :create) (format o "1 2~%2 4~%"))
  (with-open-file (o "/tmp/cc-two-b.dat" :direction :output :if-exists :overwrite :if-does-not-exist :create) (format o "1 20~%2 40~%"))
  (with-open-file (o "/tmp/cc-two.sh" :direction :output :if-exists :overwrite :if-does-not-exist :create)
    (format o "cat << EOF | gnuplot -p~%set title \"two series\"~%plot \"/tmp/cc-two-a.dat\" using 1:2 title \"a\" with lines, \"/tmp/cc-two-b.dat\" using 1:2 title \"b\" with points, sin(x) title \"s\" with lines~%EOF~%"))
  (ext:shell "bash /tmp/cc-two.sh"))`

function exercise() {
  const send = (msg) => sandbox.onmessage({ data: msg })
  const loadLines = [] /* stdout+stderr lines of job 101 */
  const evalLines = [] /* stdout+stderr lines of job 102 */
  const plotMsgs = [] /* {id, text} for every ;;PLOT64 stdout marker */
  const shellErrLines = [] /* stdout+stderr lines of job 104 */
  let isClPlot = false
  const watch = sandbox.postMessage
  sandbox.postMessage = (m) => {
    watch(m)
    if ((m.type === 'stdout' || m.type === 'stderr') && m.id === 101) loadLines.push(m.text)
    if ((m.type === 'stdout' || m.type === 'stderr') && m.id === 102) evalLines.push(m.text)
    if ((m.type === 'stdout' || m.type === 'stderr') && m.id === 104) shellErrLines.push(m.text)
    if (m.type === 'stdout' && m.text.startsWith(';;PLOT64 ')) plotMsgs.push({ id: m.id, text: m.text })
    if (m.type === 'done' && m.id === 100) {
      // load the bundled sample project: SAMPLE_PROJECT_DIR, /tmp/clplot, or the zip read in memory (Sprint 28)
      const files = sampleProject ?? []
      if (!files.length) {
        console.log('(sample project not available — skipping load-project exercise)')
        finish(true, 'boot ready + eval job done')
        return
      }
      isClPlot = files.some((f) => /cl-plot\.asd$/i.test(f.path))
      console.log(`\n--- sending load-project (${files.length} files) ---`)
      send({ type: 'load-project', id: 101, files })
      setTimeout(() => finish(false, 'load-project did not finish within 60s'), 60000)
    }
    if (m.type === 'done' && m.id === 101) {
      if (isClPlot) {
        console.log('\n--- sending acceptance eval (make-instance (quote figure)) ---')
        send({ type: 'eval', id: 102, code: "(make-instance 'figure)" })
        setTimeout(() => finish(false, 'acceptance eval did not finish within 30s'), 30000)
      } else {
        checkGeneric(loadLines)
      }
    }
    if (m.type === 'done' && m.id === 102) {
      /* job 103: a FRESH figure shown from a plain eval — its ;;PLOT64 must
       * carry this job's id (plot attribution to the triggering cell). */
      console.log('\n--- sending plot eval job 103 (fresh figure + show) ---')
      send({
        type: 'eval', id: 103,
        code: '(defparameter *fig2* (make-instance (quote figure)))\n' +
          '(xlabel *fig2* "text")\n' +
          '(scatter *fig2* (quote ((1 1) (2 4) (3 9))) :with "lines")\n' +
          '(show *fig2*)',
      })
      setTimeout(() => finish(false, 'plot eval job 103 did not finish within 30s'), 30000)
    }
    if (m.type === 'done' && m.id === 103) {
      /* job 104: a NON-gnuplot shell command must keep the clean-error
       * behavior (no debugger, no hang) */
      shellErrLines.length = 0
      send({ type: 'eval', id: 104, code: '(ext:shell "echo hello")' })
      setTimeout(() => finish(false, 'non-gnuplot shell eval (104) did not finish within 30s'), 30000)
    }
    if (m.type === 'done' && m.id === 104) {
      /* job 105 (Sprint 29): a hand-written two-series plot line — both
       * data files must ship in the payload, not just the first one */
      send({ type: 'eval', id: 105, code: TWO_SERIES_CODE })
      setTimeout(() => finish(false, 'two-series plot eval (105) did not finish within 30s'), 30000)
    }
    if (m.type === 'done' && m.id === 105) void checkPlots(loadLines, evalLines, plotMsgs, shellErrLines)
    if (m.type === 'joberror') finish(false, `joberror id=${m.id}: ${m.message}`)
  }
  send({ type: 'eval', id: 100, code: '(+ 2 3) (format t "hello ~a" :world)' })
}

/* Generic (non-cl-plot) sample: loader must complete with per-file events,
 * no reader errors, at least one honest package report, and a hint. */
function checkGeneric(loadLines) {
  const problems = []
  const fileEvents = loadLines.filter((l) => l.includes(';;FILE:'))
  const blob = loadLines.join('\n')
  console.log('\n--- acceptance (generic sample) ---')
  if (!fileEvents.length) problems.push('no ;;FILE: events at all')
  if (/;;FILE:.*\|error\|/.test(blob)) {
    problems.push('a file failed: ' + (loadLines.find((l) => /;;FILE:.*\|error\|/.test(l)) || '').slice(0, 160))
  }
  if (/Reader error/.test(blob)) problems.push('a reader error occurred during load')
  if (!loadLines.some((l) => l.includes(';;PKG:'))) problems.push('no ;;PKG: report')
  if (loadLines.some((l) => /;;PKG:\s*ASDF\|/.test(l))) problems.push('ASDF reported as a project package')
  if (!loadLines.some((l) => l.includes(';;HINT:'))) problems.push('no ;;HINT: emitted')
  if (problems.length) {
    problems.forEach((p) => console.log('  ✗ ' + p))
    finish(false, `${problems.length} acceptance problem(s)`)
  } else {
    console.log('  ✓ files ok, no reader errors, honest packages, hint emitted')
    finish(true, 'boot ready + eval + project load (generic acceptance) passed')
  }
}

function collectAcceptanceProblems(loadLines, evalLines) {
  const problems = []
  const fileEvents = loadLines.filter((l) => l.includes(';;FILE:')).map((l) => {
    const [p = '', status = '', ...rest] = l.split(';;FILE:')[1].trim().split('|')
    return { path: p, status, message: rest.join('|') }
  })
  const order = fileEvents.map((e) => e.path)
  const idx = (suffix) => order.findIndex((p) => p.endsWith(suffix))
  console.log('\n--- acceptance ---')
  console.log('file events: ' + fileEvents.map((e) => `${e.path.split('/').pop()}=${e.status}`).join(' '))

  /* 1. asd-ordered loading: utils before plot before plot-example */
  if (!(idx('utils.lisp') !== -1 && idx('plot.lisp') !== -1 && idx('plot-example.lisp') !== -1
      && idx('utils.lisp') < idx('plot.lisp') && idx('plot.lisp') < idx('plot-example.lisp'))) {
    problems.push(`load order wrong: ${order.join(', ')} (want utils < plot < plot-example)`)
  }
  /* 2. the .asd was parsed, not loaded as plain lisp */
  const asd = fileEvents.find((e) => e.path.endsWith('.asd'))
  if (!asd) problems.push('no ;;FILE: event for the .asd at all')
  else if (asd.status === 'error' || !/parsed/.test(asd.message)) {
    problems.push(`.asd mishandled: ${asd.status} — ${asd.message}`)
  }
  /* 3. no EXT reader errors, no FIGURE ordering error */
  const blob = loadLines.join('\n')
  if (/Cannot find the external symbol CD/.test(blob)) problems.push('EXT:CD reader error still present')
  if (/No class named FIGURE/.test(blob)) problems.push('plot-example loaded before plot.lisp (FIGURE error)')
  if (/Reader error/.test(blob)) problems.push('a reader error occurred during load: ' +
    (loadLines.find((l) => /Reader error/.test(l)) || '').slice(0, 160))
  /* 4. init.lisp and plot-example.lisp loaded (at most warn) */
  for (const f of ['init.lisp', 'plot-example.lisp']) {
    const ev = fileEvents.find((e) => e.path.endsWith(f))
    if (!ev) problems.push(`no ;;FILE: event for ${f}`)
    else if (ev.status === 'error') problems.push(`${f} failed: ${ev.message}`)
  }
  /* 5. honest package report: project symbols under CL-USER/CL-PLOT, not ASDF */
  const pkgLines = loadLines.filter((l) => l.includes(';;PKG:'))
  if (pkgLines.some((l) => /;;PKG:\s*ASDF\|/.test(l))) problems.push('ASDF reported as a project package')
  if (!pkgLines.some((l) => /;;PKG:\s*CL-USER\|/.test(l))) problems.push('CL-USER definitions not reported')
  const symLines = loadLines.filter((l) => l.includes(';;SYM:'))
  if (symLines.some((l) => /;;SYM:\s*ASDF\|/.test(l))) problems.push('project symbols exported from ASDF')
  if (!symLines.some((l) => /\|FIGURE\s*$/.test(l))) problems.push('FIGURE not among reported symbols')
  /* 6. hint names a real project callable */
  const hint = loadLines.find((l) => l.includes(';;HINT:'))
  if (!hint) problems.push('no ;;HINT: emitted')
  else if (!/make-instance \(quote figure\)/i.test(hint)) problems.push(`hint does not suggest the figure class: ${hint.trim()}`)
  /* 7. post-load: (make-instance 'figure) returns a FIGURE instance */
  if (!evalLines.some((l) => /;;=>\s*#<[^>]*FIGURE/i.test(l))) {
    problems.push(`(make-instance 'figure) did not return a FIGURE: ${evalLines.join(' | ').slice(0, 200)}`)
  }
  return problems
}

/* Bundle the REAL main-thread plot modules (src/plot/gnuplot.ts +
 * src/plot/build-svg.ts) with esbuild so the harness exercises the same
 * code the browser runs. */
async function buildPlotModule() {
  const entry = path.join(os.tmpdir(), `conscell-plot-entry-${process.pid}.ts`)
  const outfile = path.join(os.tmpdir(), `conscell-plot-bundle-${process.pid}.mjs`)
  fs.writeFileSync(entry,
    `export { unpackPlotPayload, parseGnuplot } from ${JSON.stringify(path.join(root, 'src/plot/gnuplot'))}\n` +
    `export { buildSvg } from ${JSON.stringify(path.join(root, 'src/plot/build-svg'))}\n`)
  esbuild.buildSync({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node',
    outfile, logLevel: 'silent',
  })
  return import(outfile)
}

/* gnuplot-capture acceptance: the load-time (show *fig*) must have emitted a
 * ;;PLOT64 whose script + data files check out; the fresh-figure eval (job
 * 103) must attribute its plot to 103; and the real parser/renderer must
 * turn the payload into an <svg> with the 6 example points. */
async function checkPlots(loadLines, evalLines, plotMsgs, shellErrLines) {
  console.log('\n--- acceptance (cl-plot + gnuplot capture) ---')
  const problems = collectAcceptanceProblems(loadLines, evalLines)

  /* 8. plot payload during the load, attributed to the load job (101) */
  const loadPlot = plotMsgs.find((p) => p.id === 101)
  if (!loadPlot) problems.push('no ;;PLOT64 captured during the project load (plot-example (show *fig*))')
  /* 9. plot payload attributed to the later eval job (103) */
  const evalPlot = plotMsgs.find((p) => p.id === 103)
  if (!evalPlot) problems.push('no ;;PLOT64 attributed to the post-load eval job 103')
  /* 9b. non-gnuplot shell still errors cleanly (no hang — reaching this
   * point already proves the worker answered; assert the condition text) */
  if (!shellErrLines.some((l) => /;;ERROR:.*subprocesses are not supported/.test(l))) {
    problems.push(`(ext:shell "echo hello") did not surface the clean subprocess error: ${shellErrLines.join(' | ').slice(0, 160)}`)
  }

  let mod = null
  try {
    mod = await buildPlotModule()
  } catch (e) {
    problems.push('could not bundle src/plot modules with esbuild: ' + (e?.message ?? e))
  }

  if (loadPlot && mod) {
    const b64 = loadPlot.text.slice(';;PLOT64 '.length).trim()
    const payload = Buffer.from(b64, 'base64').toString('utf8')
    let unpacked = null
    try {
      unpacked = mod.unpackPlotPayload(payload)
    } catch (e) {
      problems.push('plot payload did not unpack: ' + (e?.message ?? e))
    }
    if (unpacked) {
      const { script, files } = unpacked
      /* 10. the captured script is the cl-plot gnuplot program */
      if (!/cat << EOF \| gnuplot -p/.test(script)) problems.push('script lacks the `cat << EOF | gnuplot -p` wrapper')
      if (!/set nokey/.test(script)) problems.push('script lacks `set nokey`')
      if (!/set\s+x\s*label\s+"text"/.test(script)) problems.push('script lacks `set x label "text"` (cl-plot spacing tolerated)')
      if (!/set\s+arrow\s+from\s+0\s*,\s*0\s+to\s+10\s*,\s*10\s+nohead/.test(script)) {
        problems.push('script lacks `set arrow from 0,0 to 10,10 nohead` (cl-plot spacing tolerated)')
      }
      const plotCmd = script.match(/plot\s+"(\/tmp\/[^"]+)"\s+using\s+([\d:]+)\s+with\s+(\w+)/)
      if (!plotCmd) problems.push('script lacks `plot "/tmp/…" using … with …`')
      else {
        if (!/^1:2:?$/.test(plotCmd[2])) problems.push(`unexpected using columns: ${plotCmd[2]}`)
        if (plotCmd[3] !== 'lines') problems.push(`unexpected with style: ${plotCmd[3]}`)
        /* 11. the referenced data file was captured with the 6 example points */
        const df = files.find((f) => f.path === plotCmd[1])
        if (!df) problems.push(`data file ${plotCmd[1]} was not shipped in the payload`)
        else {
          const rows = df.content.split('\n').map((l) => l.trim())
          for (const row of ['1 1', '1 3', '10 1', '1 4', '11 -4', '1 34']) {
            if (!rows.includes(row)) problems.push(`data file is missing the example point: ${row}`)
          }
        }
      }
      /* 12. the real parser produces the expected PlotSpec */
      const spec = mod.parseGnuplot(script, files)
      if (spec.legend !== false) problems.push('parser: `set nokey` not honored')
      if (spec.xlabel !== 'text') problems.push(`parser: xlabel not parsed (got ${JSON.stringify(spec.xlabel)})`)
      if (!(spec.arrows.length === 1 && spec.arrows[0].head === false
          && spec.arrows[0].x1 === 0 && spec.arrows[0].y1 === 0
          && spec.arrows[0].x2 === 10 && spec.arrows[0].y2 === 10)) {
        problems.push('parser: nohead arrow (0,0)→(10,10) not parsed')
      }
      if (!(spec.series.length === 1 && spec.series[0].style === 'lines' && spec.series[0].points.length === 6)) {
        problems.push(`parser: expected 1 lines series with 6 points, got ${spec.series.length} series / ${spec.series[0]?.points.length ?? 0} points`)
      }
      /* 12b. the `save` path: set output / set term png size / series title */
      const saveSpec = mod.parseGnuplot(
        'cat << EOF | gnuplot -p\nset output "fig.png"\nset term png size 600,400\nset nokey\n' +
        'plot  "/tmp/x" using 1:2  with   linespoints ps 2 pt 7 title "data"\nEOF\n',
        [{ path: '/tmp/x', content: '1 1\n2 4\n' }],
      )
      if (saveSpec.outputName !== 'fig.png') problems.push('parser: set output not parsed')
      if (!(saveSpec.termSize && saveSpec.termSize.w === 600 && saveSpec.termSize.h === 400)) {
        problems.push('parser: set term png size 600,400 not parsed')
      }
      if (!(saveSpec.series.length === 1 && saveSpec.series[0].style === 'linespoints'
          && saveSpec.series[0].title === 'data' && saveSpec.series[0].points.length === 2)) {
        problems.push('parser: titled linespoints series not parsed')
      }
      /* 14. (Sprint 29) the two-series script ships BOTH data files and the
       * real parser sees two series with their own points */
      const twoPlot = plotMsgs.find((p) => p.id === 105)
      if (!twoPlot) problems.push('no ;;PLOT64 attributed to the two-series eval job 105')
      else {
        let two = null
        try {
          two = mod.unpackPlotPayload(Buffer.from(twoPlot.text.slice(';;PLOT64 '.length).trim(), 'base64').toString('utf8'))
        } catch (e) {
          problems.push('two-series payload did not unpack: ' + (e?.message ?? e))
        }
        if (two) {
          const paths = two.files.map((f) => f.path)
          if (paths.join(',') !== '/tmp/cc-two-a.dat,/tmp/cc-two-b.dat') {
            problems.push(`two-series payload shipped ${JSON.stringify(paths)} (want both data files, in order, and no title)`)
          }
          const b = two.files.find((f) => f.path === '/tmp/cc-two-b.dat')
          if (b && !/1 20\n2 40/.test(b.content)) problems.push('two-series payload: second data file content wrong: ' + JSON.stringify(b.content))
          const twoSpec = mod.parseGnuplot(two.script, two.files)
          const shape = twoSpec.series.map((sr) => `${sr.title}:${sr.missing ?? sr.style}:${sr.points.length}`).join(' ')
          if (shape !== 'a:lines:2 b:points:2 s:function:0') problems.push(`parser: series shape ${JSON.stringify(shape)} (want "a:lines:2 b:points:2 s:function:0")`)
          else if (twoSpec.series[1].points[1].y !== 40) problems.push('parser: second series did not read its own file')
          /* Sprint 30: the function series is named in the SVG, not dropped */
          const twoSvg = mod.buildSvg(twoSpec)
          if (!/not drawn: s \(function\)/.test(twoSvg)) problems.push('buildSvg: the function series sin(x) is not named in the footnote')
          if (!/s \(not drawn\)/.test(twoSvg)) problems.push('buildSvg: the function series has no "(not drawn)" legend entry')
        }
      }
      /* 13. the real renderer emits an <svg> with the 6 points */
      const svg = mod.buildSvg(spec)
      if (!svg.startsWith('<svg')) problems.push('buildSvg output does not start with <svg')
      const poly = svg.match(/<polyline[^>]*points="([^"]*)"/)
      const nPts = poly ? poly[1].trim().split(/\s+/).length : 0
      if (nPts !== 6) problems.push(`buildSvg: expected a polyline with 6 points, got ${nPts}`)
      if (!problems.length) {
        console.log('  ✓ gnuplot script captured: cat|gnuplot wrapper, set nokey, x label, nohead arrow, plot "/tmp/…" using 1:2 with lines')
        console.log('  ✓ data file captured with all 6 example points')
        console.log('  ✓ eval job 103 attributed its own plot (fresh figure show)')
        console.log('  ✓ parseGnuplot + buildSvg (real modules, esbuild-bundled) → <svg> polyline with 6 points')
        console.log('  ✓ two-series plot line ships both data files, the function series ships nothing; parser sees a:lines:2 b:points:2 s:function:0, SVG names sin(x) as not drawn (Sprints 29–30)')
      }
    }
  }

  if (problems.length) {
    problems.forEach((p) => console.log('  ✗ ' + p))
    finish(false, `${problems.length} acceptance problem(s)`)
  } else {
    console.log('  ✓ asd order, parsed asd, no reader/FIGURE errors, honest packages, verified hint, working FIGURE class')
    finish(true, 'boot ready + eval + cl-plot load + gnuplot capture + SVG smoke all passed')
  }
}

setTimeout(() => finish(false, `no ready within ${timeoutMs / 1000}s (boot hung)`), timeoutMs)

try {
  vm.runInContext(workerSrc, context, { filename: 'wecl-worker.js' })
} catch (e) {
  finish(false, 'worker script threw synchronously: ' + (e?.stack || e))
}
