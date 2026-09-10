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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const artifacts = ['sbcl.wasm', 'sbcl.core', 'sbcl-core.wasm']
  .map((f) => path.join(publicDir, 'sbcl', f))
if (!artifacts.every((p) => fs.existsSync(p))) {
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
const self = {
  postMessage: (m) => parentPort.postMessage(m),
  onmessage: null,
  __ccSbclLoadBytes: (p) => {
    const f = nodePath.join(${JSON.stringify(path.join(publicDir, 'sbcl'))}, nodePath.basename(p))
    return nodeFs.readFileSync(f)
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
let stdinAnswered = false
const out = (id) => messages.filter((m) => (m.type === 'stdout' || m.type === 'stderr') && m.id === id).map((m) => m.text)
const step = { expectDone: new Set([100, 101, 102, 103]) }

function startExercise() {
  exercising = true
  submit({ type: 'eval', id: 100, code: '(+ 2 3) (format t "hello ~a" :world)' })
  setTimeout(() => finish(false, 'eval job 100 did not finish'), 30_000)
}

function onExerciseMessage(m) {
  if (m.type === 'done' && m.id === 100) {
    const l = out(100)
    if (!l.some((x) => x.startsWith(';;=> 5'))) problems.push('job 100: no ;;=> 5 — got: ' + l.join(' | ').slice(0, 200))
    if (!l.some((x) => x === 'hello WORLD')) problems.push('job 100: no printed output line "hello WORLD" — got: ' + l.join(' | ').slice(0, 200))
    if (!l.some((x) => x.startsWith(';;PACKAGE: CL-USER'))) problems.push('job 100: no ;;PACKAGE: CL-USER marker')
    submit({ type: 'eval', id: 101, code: '(/ 1 0)' })
    setTimeout(() => finish(false, 'error job 101 did not finish'), 30_000)
  }
  if (m.type === 'done' && m.id === 101) {
    const l = out(101)
    if (!l.some((x) => x.startsWith(';;ERROR:'))) problems.push('job 101: no ;;ERROR: marker — got: ' + l.join(' | ').slice(0, 200))
    if (!l.some((x) => x.startsWith(';;ERRTYPE: DIVISION-BY-ZERO'))) problems.push('job 101: no ;;ERRTYPE: DIVISION-BY-ZERO — got: ' + l.filter((x) => x.startsWith(';;ERRTYPE')).join(' | '))
    submit({ type: 'eval', id: 102, code: '(defpackage :cc-tst (:use :cl) (:export #:greet))\n(in-package :cc-tst)\n(defun greet () :hi)' })
    setTimeout(() => finish(false, 'defpackage job 102 did not finish'), 30_000)
  }
  if (m.type === 'done' && m.id === 102) {
    const l = out(102)
    if (!l.some((x) => x.startsWith(';;PACKAGE: CC-TST'))) problems.push('job 102: package did not switch (no ;;PACKAGE: CC-TST) — got: ' + l.filter((x) => x.startsWith(';;PACKAGE')).join(' | '))
    /* package persists across jobs AND the defun really happened */
    submit({ type: 'eval', id: 103, code: '(cc-tst:greet)' })
    setTimeout(() => finish(false, 'cross-job eval 103 did not finish'), 30_000)
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
    setTimeout(() => finish(false, 'load-project 104 did not finish'), 60_000)
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
    setTimeout(() => finish(false, 'post-load eval 105 did not finish'), 30_000)
  }
  if (m.type === 'done' && m.id === 105) {
    const l = out(105)
    if (!l.some((x) => x.startsWith(';;=> 42'))) problems.push('job 105: (cc-main) did not return 42 — got: ' + l.join(' | ').slice(0, 200))
    /* stdin: (read-line) must block with ;;READ-WAIT and consume the answer */
    submit({ type: 'eval', id: 106, code: '(read-line)' })
    setTimeout(() => finish(false, 'stdin job 106 did not finish'), 30_000)
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
    /* clean shutdown */
    submit({ type: 'quit' })
    setTimeout(() => finish(false, 'image did not exit after quit'), 30_000)
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
