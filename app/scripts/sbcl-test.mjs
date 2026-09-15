/* Node harness: boot the REAL sbcl-worker.js (public/sbcl-worker.js)
 * against the REAL SBCL wasm artifacts (public/sbcl/, copied in by
 * scripts/fetch-sbcl.mjs), outside a browser — in a real worker thread,
 * so Atomics.wait/SharedArrayBuffer behave exactly as they do in the
 * browser worker. The harness plays the page: it receives the shared
 * buffer, writes eval/load requests into its mailbox, and asserts the
 * marker protocol (;;=> values, ;;ERROR:, ;;PACKAGE:, ;;FILE:/;;PKG:,
 * per-job done attribution).
 *
 * Usage: node scripts/sbcl-test.mjs [--timeout-ms N]
 * Skips (exit 0) when the artifacts are not present (CI without them).
 */
import fs from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { loadSampleProject } from './lib/sample-project.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
/* plain or gzip'd (Sprint 26: only the .gz copies are tracked; the load hook below inflates them) */
const artifacts = ['sbcl.wasm', 'sbcl.core', 'sbcl-core.wasm']
  .map((f) => path.join(publicDir, 'sbcl', f))
if (!artifacts.every((p) => fs.existsSync(p) || fs.existsSync(p + '.gz'))) {
  console.log('sbcl artifacts not present (public/sbcl/) — run scripts/fetch-sbcl.mjs; skipping')
  process.exit(0)
}

const timeoutIdx = process.argv.indexOf('--timeout-ms')
const timeoutMs = timeoutIdx >= 0 ? Number(process.argv[timeoutIdx + 1]) || 180_000 : 180_000

const MAILBOX_OFF = 8192
let sab = null
let i32 = null
let u8 = null
const enc = new TextEncoder()

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

let done = false
const problems = []
let worker = null
function finish(ok, why) {
  if (done) return
  done = true
  console.log(ok ? `\nPASS: ${why}` : `\nFAIL: ${why}`)
  if (problems.length) problems.forEach((p) => console.log('  ✗ ' + p))
  if (worker) worker.terminate()
  process.exit(ok ? 0 : 1)
}
setTimeout(() => finish(false, `not finished within ${timeoutMs / 1000}s`), timeoutMs)

/* the page-side submit: one JSON request into the shared mailbox */
function submit(msg) {
  const bytes = enc.encode(JSON.stringify(msg))
  if (bytes.length + 1 > 8 << 20) throw new Error('request too large')
  u8.set(bytes, MAILBOX_OFF)
  u8[MAILBOX_OFF + bytes.length] = 0
  Atomics.store(i32, 4, 1)
  Atomics.notify(i32, 4)
}

/* a real worker thread with a browser-ish prelude: `self` + artifact
 * loading from disk; then the unmodified worker source */
const workerSrc = fs.readFileSync(path.join(publicDir, 'sbcl-worker.js'), 'utf8')
const prelude = `
const { parentPort } = require('node:worker_threads')
const nodeFs = require('node:fs')
const nodePath = require('node:path')
const nodeZlib = require('node:zlib')
const self = {
  postMessage: (m) => parentPort.postMessage(m),
  onmessage: null,
  __ccSbclLoadBytes: (p) => {
    const f = nodePath.join(${JSON.stringify(path.join(publicDir, 'sbcl'))}, nodePath.basename(p))
    if (nodeFs.existsSync(f)) return nodeFs.readFileSync(f)
    return nodeZlib.gunzipSync(nodeFs.readFileSync(f + '.gz')) /* only the .gz copies are tracked */
  },
}
globalThis.self = self
${process.env.CC_SBCL_TRACE ? 'self.__ccSbclTrace = (s) => parentPort.postMessage({ type: "boot", line: "[wasi] " + s })' : ''}
`
/* exnref (try_table/throw) is shipped but flagged off by default in Node;
 * worker threads inherit the main process's V8 flags, so re-exec ourselves
 * with it on (browsers ≥ Chrome 137 have it enabled by default) */
if (!process.execArgv.includes('--experimental-wasm-exnref') && !process.env.CC_SBCL_NO_REEXEC) {
  const { spawn } = await import('node:child_process')
  const child = spawn(process.execPath,
    ['--experimental-wasm-exnref', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, CC_SBCL_NO_REEXEC: '1' } })
  child.on('exit', (code) => process.exit(code ?? 0))
} else {
worker = new Worker(prelude + workerSrc, {
  eval: true, stdout: true, stderr: true,
  resourceLimits: { maxOldGenerationSizeMb: 8192, stackSizeMb: 512 },
})
/* the bundled cl-plot sample: SAMPLE_PROJECT_DIR, /tmp/clplot, or the zip read in memory (Sprint 28) */
const sampleProject = await loadSampleProject()

worker.on('message', (m) => {
  log(m)
  if (m.type === 'sbcl-sab') {
    sab = m.sab
    i32 = new Int32Array(sab)
    u8 = new Uint8Array(sab)
  }
  if (m.type === 'ready') startExercise()
  if (m.type === 'bootfail') finish(false, 'bootfail: ' + m.message)
  if (m.type === 'crash' && !exercising) finish(false, 'crash during boot: ' + m.message)
  if (exercising) onExerciseMessage(m)
})
worker.on('error', (e) => finish(false, 'worker thread error: ' + (e?.stack || e)))

/* ---- the exercise: one eval, one error, a package switch, a project load ---- */
let exercising = false
let stepTimer = null
const stepTimeout = (msg, ms) => { clearTimeout(stepTimer); stepTimer = setTimeout(() => finish(false, msg), ms) }
let stdinAnswered = false
let debugAnswered = null /* null = not paused yet, false = answered a pause */
let interruptRequested = false
let snapshotFiles = null
/* Sprint 29: a gnuplot script whose plot line names two data files (a quoted
 * title sits between them and must not be taken for a path); Sprint 30 adds a
 * third, function series whose quoted title must not ship as a file */
const TWO_SERIES_CODE = String.raw`(progn
  (with-open-file (o "/tmp/cc-two-a.dat" :direction :output :if-exists :overwrite :if-does-not-exist :create) (format o "1 2~%2 4~%"))
  (with-open-file (o "/tmp/cc-two-b.dat" :direction :output :if-exists :overwrite :if-does-not-exist :create) (format o "1 20~%2 40~%"))
  (with-open-file (o "/tmp/cc-two.sh" :direction :output :if-exists :overwrite :if-does-not-exist :create)
    (format o "cat << EOF | gnuplot -p~%set title \"two series\"~%plot \"/tmp/cc-two-a.dat\" using 1:2 title \"a\" with lines, \"/tmp/cc-two-b.dat\" using 1:2 title \"b\" with points, sin(x) title \"s\" with lines~%EOF~%"))
  (ext:shell "bash /tmp/cc-two.sh"))`
const out = (id) => messages.filter((m) => (m.type === 'stdout' || m.type === 'stderr') && m.id === id).map((m) => m.text)
const step = { expectDone: new Set([100, 101, 102, 103]) }

function startExercise() {
  exercising = true
  submit({ type: 'eval', id: 100, code: '(+ 2 3) (format t "hello ~a" :world)' })
  stepTimeout('eval job 100 did not finish', 30_000)
}

function onExerciseMessage(m) {
  if (m.type === 'done' && m.id === 100) {
    const l = out(100)
    if (!l.some((x) => x.startsWith(';;=> 5'))) problems.push('job 100: no ;;=> 5 — got: ' + l.join(' | ').slice(0, 200))
    if (!l.some((x) => x === 'hello WORLD')) problems.push('job 100: no printed output line "hello WORLD" — got: ' + l.join(' | ').slice(0, 200))
    if (!l.some((x) => x.startsWith(';;PACKAGE: CL-USER'))) problems.push('job 100: no ;;PACKAGE: CL-USER marker')
    submit({ type: 'eval', id: 101, code: '(/ 1 0)' })
    stepTimeout('error job 101 did not finish', 30_000)
  }
  if (m.type === 'done' && m.id === 101) {
    const l = out(101)
    if (!l.some((x) => x.startsWith(';;ERROR:'))) problems.push('job 101: no ;;ERROR: marker — got: ' + l.join(' | ').slice(0, 200))
    if (!l.some((x) => x.startsWith(';;ERRTYPE: DIVISION-BY-ZERO'))) problems.push('job 101: no ;;ERRTYPE: DIVISION-BY-ZERO — got: ' + l.filter((x) => x.startsWith(';;ERRTYPE')).join(' | '))
    submit({ type: 'eval', id: 102, code: '(defpackage :cc-tst (:use :cl) (:export #:greet))\n(in-package :cc-tst)\n(defun greet () :hi)' })
    stepTimeout('defpackage job 102 did not finish', 30_000)
  }
  if (m.type === 'done' && m.id === 102) {
    const l = out(102)
    if (!l.some((x) => x.startsWith(';;PACKAGE: CC-TST'))) problems.push('job 102: package did not switch (no ;;PACKAGE: CC-TST) — got: ' + l.filter((x) => x.startsWith(';;PACKAGE')).join(' | '))
    /* package persists across jobs AND the defun really happened */
    submit({ type: 'eval', id: 103, code: '(cc-tst:greet)' })
    stepTimeout('cross-job eval 103 did not finish', 30_000)
  }
  if (m.type === 'done' && m.id === 103) {
    const l = out(103)
    if (!l.some((x) => x.startsWith(';;=> :HI'))) problems.push('job 103: (cc-tst:greet) did not return :HI — got: ' + l.join(' | ').slice(0, 200))
    submit({
      type: 'load-project', id: 104,
      files: [
        { path: 'cc-demo.asd', content: '(defsystem :cc-demo :components ((:file "util") (:file "main")))' },
        { path: 'util.lisp', content: '(defun cc-util () (* 6 7))' },
        { path: 'main.lisp', content: '(in-package :cl-user)\n(defun cc-main () (cc-util))' },
      ],
    })
    stepTimeout('load-project 104 did not finish', 60_000)
  }
  if (m.type === 'done' && m.id === 104) {
    const l = out(104)
    const blob = l.join('\n')
    if (!/;;FILE: \/project\/cc-demo\.asd\|ok\|parsed/.test(blob)) problems.push('load 104: .asd not parsed — ' + blob.slice(0, 300))
    if (!/;;FILE: \/project\/util\.lisp\|ok\|loaded \(1 form\)/.test(blob)) problems.push('load 104: util.lisp not loaded — ' + blob.slice(0, 300))
    if (!/;;FILE: \/project\/main\.lisp\|ok\|loaded \(2 forms\)/.test(blob)) problems.push('load 104: main.lisp not loaded — ' + blob.slice(0, 300))
    if (!/;;SYM: CL-USER\|CC-UTIL/.test(blob)) problems.push('load 104: symbols not reported')
    if (!/;;HINT:/.test(blob)) problems.push('load 104: no hint emitted')
    /* post-load acceptance: the system's function works in a fresh job
     * (back in CL-USER — the package pill persists, exactly like a REPL) */
    submit({ type: 'eval', id: 105, code: '(in-package :cl-user)\n(cc-main)' })
    stepTimeout('post-load eval 105 did not finish', 30_000)
  }
  if (m.type === 'done' && m.id === 105) {
    const l = out(105)
    if (!l.some((x) => x.startsWith(';;=> 42'))) problems.push('job 105: (cc-main) did not return 42 — got: ' + l.join(' | ').slice(0, 200))
    /* stdin: (read-line) must block with ;;READ-WAIT and consume the answer */
    submit({ type: 'eval', id: 106, code: '(read-line)' })
    stepTimeout('stdin job 106 did not finish', 30_000)
  }
  if ((m.type === 'stdout' || m.type === 'stderr') && m.id === 106) {
    if (m.text.trim() === ';;READ-WAIT' && !stdinAnswered) {
      stdinAnswered = true
      submit({ type: 'input', id: 106, text: 'hello stdin' })
    }
  }
  if (m.type === 'done' && m.id === 106) {
    const l = out(106)
    if (!stdinAnswered) problems.push('job 106: no ;;READ-WAIT seen before the job ended')
    if (!l.some((x) => x.startsWith(';;=> "hello stdin"'))) {
      problems.push('job 106: (read-line) did not return "hello stdin" — got: ' + l.join(' | ').slice(0, 200))
    }
    /* Sprint 25 AV: timers — with-timeout through set_timer + the
     * interrupt-pending word's timer bit */
    submit({ type: 'eval', id: 107, code: '(handler-case (sb-ext:with-timeout 0.3 (sleep 3) :no) (sb-ext:timeout () :timeout))' })
    stepTimeout('with-timeout job 107 did not finish', 30_000)
  }
  if (m.type === 'done' && m.id === 107) {
    const l = out(107)
    if (!l.some((x) => x.startsWith(';;=> :TIMEOUT'))) problems.push('job 107: with-timeout did not fire — got: ' + l.join(' | ').slice(0, 200))
    /* Sprint 25 AV: the debugger pause + a decline answer */
    submit({ type: 'eval', id: 108, code: '(/ 1 0)', debug: true })
    stepTimeout('debug-pause job 108 did not finish', 30_000)
  }
  if ((m.type === 'stdout' || m.type === 'stderr') && m.id === 108) {
    if (m.text.trim() === ';;DEBUG-WAIT' && debugAnswered == null) {
      debugAnswered = false
      submit({ type: 'restart', id: 108, index: -1 })
    }
  }
  if (m.type === 'done' && m.id === 108) {
    const l = out(108)
    if (debugAnswered !== false) problems.push('job 108: no ;;DEBUG-WAIT pause seen (debug pause did not engage)')
    if (!l.some((x) => x.startsWith(';;DEBUG:'))) problems.push('job 108: no ;;DEBUG: marker — got: ' + l.join(' | ').slice(0, 200))
    if (!l.some((x) => x.startsWith(';;RESTART:'))) problems.push('job 108: no restart list')
    if (!l.some((x) => x.startsWith(';;ERROR:'))) problems.push('job 108: decline did not fall through to ;;ERROR:')
    /* Sprint 25 AV: runaway recursion is a Lisp storage-condition, not an
     * engine crash */
    submit({ type: 'eval', id: 109, code: '(defun cc-rec (n) (1+ (cc-rec n)))\n(cc-rec 0)' })
    stepTimeout('recursion job 109 did not finish (storage-condition expected)', 120_000)
  }
  if (m.type === 'done' && m.id === 109) {
    const l = out(109)
    if (!l.some((x) => /;;ERRTYPE: .*STORAGE-CONDITION|;;ERRTYPE: CONTROL-STACK-EXHAUSTED/.test(x))) {
      problems.push('job 109: runaway recursion did not report a storage-condition — got: ' + l.join(' | ').slice(0, 250))
    }
    /* Sprint 25 AV: the interrupt bit (Ctrl-C). The PORT acknowledges the
     * request at a safe point but Lisp delivery is not implemented yet
     * (wasm-arch.c prints "; interrupt request seen"); the page's
     * interrupt() therefore respawns the image, like ECL. Assert the
     * request plumbing end to end: the flag is consumed and the port's
     * acknowledgment appears. */
    submit({ type: 'eval', id: 110, code: '(sleep 1)' })
    Atomics.store(i32, 5, 1)
    interruptRequested = true
    stepTimeout('interrupt job 110 did not finish', 30_000)
  }
  if (m.type === 'done' && m.id === 110) {
    const l = out(110)
    if (!l.some((x) => /interrupt request seen/.test(x))) {
      problems.push('job 110: the port did not acknowledge the interrupt request — got: ' + l.join(' | ').slice(0, 250))
    }
    /* Sprint 25 AV: modules snapshot/restore round trip */
    submit({ type: 'eval', id: 111, code: '(in-package :cl-user)\n(package-install "cc-demo")' })
    stepTimeout('package-install job 111 did not finish', 60_000)
  }
  if (m.type === 'done' && m.id === 111) {
    const l = out(111)
    if (!l.some((x) => x.startsWith(';;MODULES-CHANGED'))) problems.push('job 111: no ;;MODULES-CHANGED — got: ' + l.join(' | ').slice(0, 250))
    submit({ type: 'modules-snapshot', id: 1_000_000 })
    stepTimeout('modules-snapshot did not finish', 30_000)
  }
  if (m.type === 'modules-data' && m.id === 1_000_000) {
    snapshotFiles = m.files
    if (!m.files.some((f) => f.path === 'registry.sexp')) problems.push('snapshot: no registry.sexp — got: ' + m.files.map((f) => f.path).join(','))
    if (!m.files.some((f) => f.path.includes('util.lisp'))) problems.push('snapshot: no module sources')
    submit({ type: 'modules-restore', id: 1_000_001, files: m.files })
    stepTimeout('modules-restore did not finish', 30_000)
  }
  if (m.type === 'done' && m.id === 1_000_001) {
    /* the restored registry is live: package-list sees the module */
    submit({ type: 'eval', id: 112, code: '(package-list)' })
    stepTimeout('package-list job 112 did not finish', 30_000)
  }
  if (m.type === 'done' && m.id === 112) {
    const l = out(112)
    if (!l.some((x) => /cc-demo/.test(x))) problems.push('job 112: restored registry lost cc-demo — got: ' + l.join(' | ').slice(0, 250))
    /* the bundled cl-plot sample (ECL-targeted, with ext-compat.lisp):
     * loads on SBCL too — compat shim first, asd-ordered components, and
     * (show …) reports the wasi-p1 subprocess limitation cleanly */
    const sample = sampleProject
    if (!sample) {
      console.log('(cl-plot sample not present — skipping the sample exercise)')
      submit({ type: 'quit' })
      stepTimeout('image did not exit after quit', 30_000)
      return
    }
    submit({ type: 'load-project', id: 113, files: sample })
    stepTimeout('cl-plot load 113 did not finish', 60_000)
  }
  if (m.type === 'done' && m.id === 113) {
    const l = out(113)
    const blob = l.join('\n')
    for (const f of ['ext-compat.lisp|ok', 'cl-plot.asd|ok|parsed', 'utils.lisp|ok|loaded', 'plot.lisp|ok|loaded', 'init.lisp|ok', 'load-on-sbcl.lisp|ok']) {
      if (!blob.includes(';;FILE: /project/' + f)) problems.push(`cl-plot: ${f} did not load cleanly — ` + blob.slice(0, 250))
    }
    if (/;;FILE: \/project\/plot\.lisp\|error/.test(blob)) problems.push('cl-plot: plot.lisp failed (EXT package missing at read time?)')
    if (/;;FILE: \/project\/plot-example\.lisp\|(error|warn)/.test(blob)) problems.push('cl-plot: plot-example.lisp did not load cleanly (gnuplot capture should intercept (show *fig*))')
    if (blob.includes(';;PKG: ASDF')) problems.push('cl-plot: the dummy ASDF leaked into the project package report')
    if (!/;;PLOT64 /.test(blob)) problems.push('cl-plot: no ;;PLOT64 gnuplot capture during the load')
    /* non-gnuplot shells keep the clean, catchable subprocess error */
    submit({ type: 'eval', id: 115, code: '(handler-case (ext:shell "echo hello") (error (e) (princ-to-string e)))' })
    stepTimeout('non-gnuplot shell check 115 did not finish', 30_000)
  }
  if (m.type === 'done' && m.id === 115) {
    const l = out(115)
    if (!l.some((x) => /subprocesses are not supported|EXT:SHELL/.test(x))) {
      problems.push('job 115: (ext:shell \"echo hello\") did not surface the clean subprocess error — got: ' + l.join(' | ').slice(0, 200))
    }
    submit({ type: 'eval', id: 114, code: "(make-instance 'figure)" })
    stepTimeout('figure acceptance 114 did not finish', 30_000)
  }
  if (m.type === 'done' && m.id === 114) {
    const l = out(114)
    if (!l.some((x) => /;;=> #<FIGURE/i.test(x))) problems.push('cl-plot: (make-instance \'figure) did not return a FIGURE — got: ' + l.join(' | ').slice(0, 200))
    /* job 116 (Sprint 29): a two-series plot line ships both data files */
    submit({ type: 'eval', id: 116, code: TWO_SERIES_CODE })
    stepTimeout('two-series plot check 116 did not finish', 30_000)
  }
  if (m.type === 'done' && m.id === 116) {
    const marker = out(116).find((x) => x.startsWith(';;PLOT64 '))
    if (!marker) problems.push('job 116: no ;;PLOT64 capture for the two-series script — got: ' + out(116).join(' | ').slice(0, 200))
    else {
      const payload = Buffer.from(marker.slice(';;PLOT64 '.length).trim(), 'base64').toString('utf8')
      for (const want of ['"/tmp/cc-two-a.dat"', '"1 2\n2 4\n"', '"/tmp/cc-two-b.dat"', '"1 20\n2 40\n"']) {
        if (!payload.includes(want)) problems.push(`job 116: payload lacks ${want} (both series' data files must ship)`)
      }
      if (payload.includes('\n"a"\n') || payload.includes('\n"b"\n') || payload.includes('\n"s"\n')) problems.push('job 116: a series title was shipped as a data file')
      if (payload.includes('sin(x)"\n"')) problems.push('job 116: the function series shipped as a data file')
    }
    /* clean shutdown */
    submit({ type: 'quit' })
    stepTimeout('image did not exit after quit', 30_000)
  }
  if (m.type === 'crash' && exercising) {
    if (/SBCL image exited \(code 0\)}/.test(m.message) || /exited \(code 0\)/.test(m.message)) {
      if (problems.length) finish(false, `${problems.length} acceptance problem(s)`)
      else finish(true, 'boot ready + eval/error/package/project-load/acceptance against the real SBCL image')
    } else {
      problems.push('unexpected crash: ' + m.message)
      finish(false, 'unexpected crash')
    }
  }
}
}
