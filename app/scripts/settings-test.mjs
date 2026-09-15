/* Regression test for Sprint 2: settings that reach the image, and honest
 * condition reporting. Boots the REAL wecl-worker.js + wecl.wasm in a Node
 * vm sandbox (same technique as boot-harness.mjs / package-test.mjs).
 *
 * Usage: node scripts/settings-test.mjs        (exit 0 iff every check passes)
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const messages = []
const results = []
const check = (name, ok, detail = '') => {
  results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`)
  return ok
}

const patchedFs = Object.create(fs)
patchedFs.readFileSync = function (p, opts) {
  const s = String(p)
  if (s.startsWith('/wecl/')) return fs.readFileSync(path.join(publicDir, s), opts)
  return fs.readFileSync(p, opts)
}
const sandbox = {
  console, process,
  setTimeout, clearTimeout, setInterval, clearInterval,
  TextDecoder, TextEncoder, WebAssembly, Uint8Array, ArrayBuffer, Buffer, URL, performance,
  Promise, Error, TypeError, RegExp, JSON, Math, Date, Map, Set, String, Number, Boolean, Array, Object,
  queueMicrotask, fetch,
  require: (m) => (m === 'fs' ? patchedFs : null),
  __dirname: path.join(publicDir, 'wecl'),
  __filename: path.join(publicDir, 'wecl', 'wecl.js'),
  postMessage: (m) => {
    messages.push(m)
    if (m.type === 'stdout' || m.type === 'stderr') { if (m.id) console.log(`  [${m.id}] ${m.text}`) }
    else if (m.type === 'ready') run()
    else if (m.type === 'bootfail' || m.type === 'crash') finish(false, `${m.type}: ${m.message}`)
  },
}
sandbox.importScripts = (...urls) => {
  for (const url of urls) {
    vm.runInContext(fs.readFileSync(path.join(publicDir, String(url)), 'utf8'), context, { filename: String(url) })
  }
}
const context = vm.createContext(sandbox)
vm.runInContext('Object.defineProperty(globalThis, "self", { get: function () { return globalThis }, configurable: false })', context)

let done = false
function finish(ok, why) {
  if (done) return
  done = true
  console.log('\n' + results.join('\n'))
  console.log(ok ? `\nPASS: ${why}` : `\nFAIL: ${why}`)
  process.exit(ok ? 0 : 1)
}

const send = (msg) => sandbox.onmessage({ data: msg })
const linesOf = (id) => messages.filter((m) => (m.type === 'stdout' || m.type === 'stderr') && m.id === id).map((m) => m.text)
const marker = (id, prefix) => linesOf(id).filter((l) => l.startsWith(prefix)).map((l) => l.slice(prefix.length).trim())
function evalJob(id, code, extra = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n--- job ${id}${extra.compile ? ' (compile)' : ''}: ${code.replace(/\n/g, ' ').slice(0, 110)}`)
    send({ type: 'eval', id, code, ...extra })
    const t0 = Date.now()
    const tick = setInterval(() => {
      if (messages.some((m) => m.type === 'done' && m.id === id)) { clearInterval(tick); resolve() }
      else if (messages.some((m) => m.type === 'joberror' && m.id === id)) { clearInterval(tick); reject(new Error('joberror')) }
      else if (Date.now() - t0 > 20000) { clearInterval(tick); reject(new Error(`job ${id} timed out`)) }
    }, 20)
  })
}

async function run() {
  try {
    /* ---- print length: a global setf that persists across jobs ---- */
    await evalJob(1, '(setf *print-length* 4)')
    await evalJob(2, '(loop for i below 20 collect i)')
    check('print length applies to values in a LATER job', linesOf(2).includes(';;=> (0 1 2 3 ...)'), linesOf(2).join(' | '))
    await evalJob(3, '(setf *print-length* nil)')
    await evalJob(4, '(loop for i below 6 collect i)')
    check('print length nil = unlimited again', linesOf(4).includes(';;=> (0 1 2 3 4 5)'), linesOf(4).join(' | '))

    /* ---- compile mode: every form goes through compile nil ---- */
    await evalJob(5, '(defun sq (x) (* x x)) (sq 9)', { compile: true })
    check('compile mode: defun + call work', linesOf(5).includes(';;=> SQ') && linesOf(5).includes(';;=> 81'), linesOf(5).join(' | '))
    await evalJob(6, '(sq 12)')
    check('definition made in compile mode survives into an eval-mode job', linesOf(6).includes(';;=> 144'), linesOf(6).join(' | '))
    await evalJob(7, '(defpackage :cc-cmp (:use :cl)) (in-package :cc-cmp) (defun hi () :hi)', { compile: true })
    check('compile mode: in-package still persists (;;PACKAGE: CC-CMP)', marker(7, ';;PACKAGE:').pop() === 'CC-CMP', linesOf(7).join(' | '))
    await evalJob(8, '(in-package :cl-user)')

    /* ---- honest condition reporting ---- */
    await evalJob(9, '(defun boom (x) (/ 10 x)) (defun caller (y) (list :got (boom y))) (caller 0)')
    check('real condition type reported (;;ERRTYPE: DIVISION-BY-ZERO)', marker(9, ';;ERRTYPE:').includes('DIVISION-BY-ZERO'), linesOf(9).join(' | '))
    const frames = marker(9, ';;FRAME:')
    check('frames name the user functions, innermost first (BOOM, CALLER)', frames[0] === 'BOOM' && frames[1] === 'CALLER', `frames = ${JSON.stringify(frames)}`)
    check('no loader/eval-loop frames leak (CC::, SI:)', !frames.some((f) => /^CC:|^SI:|BYTECODES/.test(f)), `frames = ${JSON.stringify(frames)}`)
    check(';;ERROR: still follows the markers', linesOf(9).some((l) => l.startsWith(';;ERROR:')))

    await evalJob(10, '(undefined-fn-xyz 1)')
    check('undefined function → ;;ERRTYPE: UNDEFINED-FUNCTION', marker(10, ';;ERRTYPE:').includes('UNDEFINED-FUNCTION'), linesOf(10).join(' | '))

    await evalJob(11, '(handler-case (caller 0) (division-by-zero () :handled-by-user))')
    check('a user handler-case that catches the error produces NO markers', marker(11, ';;ERRTYPE:').length === 0 && marker(11, ';;FRAME:').length === 0 && linesOf(11).includes(';;=> :HANDLED-BY-USER'), linesOf(11).join(' | '))

    await evalJob(12, '(caller 0)', { compile: true })
    check('compile mode: type + frames still reported', marker(12, ';;ERRTYPE:').includes('DIVISION-BY-ZERO') && marker(12, ';;FRAME:').includes('BOOM'), linesOf(12).join(' | '))

    await evalJob(13, '(+ 1 2)')
    check('image still healthy after all of that', linesOf(13).includes(';;=> 3'))

    const failed = results.filter((r) => r.startsWith('✗')).length
    finish(failed === 0, failed === 0 ? `${results.length} checks passed` : `${failed} check(s) failed`)
  } catch (e) {
    finish(false, e?.message ?? String(e))
  }
}

setTimeout(() => finish(false, 'timeout (boot or job hung)'), 120000)
vm.runInContext(fs.readFileSync(path.join(publicDir, 'wecl-worker.js'), 'utf8'), context, { filename: 'wecl-worker.js' })
