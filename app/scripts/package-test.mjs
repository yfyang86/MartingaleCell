/* Regression test: (in-package …) must persist across eval jobs, and every
 * eval job must end with a ;;PACKAGE: marker naming the package the next job
 * reads in. Boots the REAL wecl-worker.js + wecl.wasm in a Node vm sandbox
 * (same technique as boot-harness.mjs).
 *
 * Usage: node scripts/package-test.mjs        (exit 0 iff every check passes)
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
const packageOf = (id) => {
  const marker = linesOf(id).filter((l) => l.startsWith(';;PACKAGE:')).pop()
  return marker ? marker.slice(';;PACKAGE:'.length).trim() : null
}
function evalJob(id, code) {
  return new Promise((resolve, reject) => {
    console.log(`\n--- job ${id}: ${code.replace(/\n/g, ' ')}`)
    send({ type: 'eval', id, code })
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
    await evalJob(1, '(+ 1 2)')
    check('plain eval ends with ;;PACKAGE: CL-USER (shortest nickname)', packageOf(1) === 'CL-USER', `got ${packageOf(1)}`)
    check('plain eval still returns its value', linesOf(1).includes(';;=> 3'))

    await evalJob(2, '(defpackage :cc-test (:use :cl)) (in-package :cc-test) (defun bar () 42)')
    check('job with (in-package :cc-test) reports ;;PACKAGE: CC-TEST', packageOf(2) === 'CC-TEST', `got ${packageOf(2)}`)

    await evalJob(3, '*package* (bar)')
    const l3 = linesOf(3)
    check('next job reads in CC-TEST (*package*)', l3.some((l) => /;;=> #<"CC-TEST" package>/.test(l)), l3.join(' | '))
    check('next job can call BAR defined in CC-TEST', l3.includes(';;=> 42'), l3.join(' | '))
    check('no undefined-function error', !l3.some((l) => /undefined/i.test(l)))

    await evalJob(4, '(in-package :no-such-package-xyz)')
    check('switching to a missing package signals a caught error', linesOf(4).some((l) => l.startsWith(';;ERROR:')))
    check('…and the reader package is unchanged (CC-TEST)', packageOf(4) === 'CC-TEST', `got ${packageOf(4)}`)

    await evalJob(5, '(in-package "CL-USER")')
    check('string designator switches back to CL-USER', packageOf(5) === 'CL-USER', `got ${packageOf(5)}`)

    await evalJob(6, '(cc-test::bar)')
    check('definitions survive the switch (cc-test::bar → 42)', linesOf(6).includes(';;=> 42'))

    const failed = results.filter((r) => r.startsWith('✗')).length
    finish(failed === 0, failed === 0 ? `${results.length} checks passed` : `${failed} check(s) failed`)
  } catch (e) {
    finish(false, e?.message ?? String(e))
  }
}

setTimeout(() => finish(false, 'timeout (boot or job hung)'), 120000)
vm.runInContext(fs.readFileSync(path.join(publicDir, 'wecl-worker.js'), 'utf8'), context, { filename: 'wecl-worker.js' })
