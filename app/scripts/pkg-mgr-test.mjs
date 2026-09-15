/* test the in-runtime package manager: install → list → plot → uninstall */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const messages = []
const t0 = Date.now()
const log = (m) => { const dt=((Date.now()-t0)/1000).toFixed(1)
  if (m.text !== undefined) console.log(`${dt}s out[${m.id}]: ${m.text}`)
  else if (m.type === 'boot') console.log(`${dt}s boot: ${m.line}`)
  else if (m.type !== 'stdout' && m.type !== 'stderr') console.log(`${dt}s ${m.type}: ${m.message ?? ''}`) }

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
  postMessage: (m) => log(m),
}
sandbox.importScripts = (...urls) => {
  for (const url of urls) vm.runInContext(fs.readFileSync(path.join(publicDir, String(url)), 'utf8'), context, { filename: String(url) })
}
const context = vm.createContext(sandbox)
vm.runInContext('Object.defineProperty(globalThis, "self", { get: function () { return globalThis }, configurable: false })', context)

let done = false
const finish = (ok, why) => { if (done) return; done = true; console.log(ok ? `\nPASS: ${why}` : `\nFAIL: ${why}`); process.exit(ok ? 0 : 1) }
sandbox.postMessage = (m) => {
  log(m)
  if (m.type === 'ready') exercise()
  if (m.type === 'bootfail' || m.type === 'crash') finish(false, m.type + ': ' + m.message)
}
const send = (msg) => sandbox.onmessage({ data: msg })
let step = 0
const STEPS = [
  { code: '(package-install "cl-plot")', check: (out) => /package cl-plot 0\.1 installed/.test(out) && /;;FILE: .*cl-plot\.asd\|ok/.test(out), name: 'install' },
  { code: '(package-list)', check: (out) => /cl-plot 0\.1/.test(out) && /5 files/.test(out) && /interface for gnuplot/i.test(out), name: 'list' },
  { code: '(let ((f (make-instance (quote figure)))) (xlabel f "move") (scatter f (quote ((0 4) (1 3) (2 3) (3 2))) :with "lines") (show f))', check: (out) => out.includes(';;PLOT64'), name: 'plot via installed module' },
  { code: '(package-uninstall "cl-plot")', check: (out) => /package cl-plot uninstalled/.test(out), name: 'uninstall' },
  { code: '(package-uninstall "cl-plot")', check: (out) => /is not installed/.test(out), name: 'uninstall-missing-errors' },
  { code: '(package-list)', check: (out) => /No packages installed/.test(out), name: 'list-empty' },
  { code: '(package-install "no-such")', check: (out) => /not found/.test(out) && /cl-plot/.test(out), name: 'install-unknown-errors-with-hint' },
]
let buf = []
function exercise() {
  const base = process.env.SAMPLE_PROJECT_DIR || '/tmp/clplot/cl-plot-master' /* unzip public/sample-projects/cl-plot.zip */
  const files = fs.readdirSync(base).filter((n) => /\.(lisp|asd)$/i.test(n))
    .map((n) => ({ path: n, content: fs.readFileSync(path.join(base, n), 'utf8') }))
  send({ type: 'load-project', id: 101, files })
  setTimeout(() => finish(false, 'timeout'), 120000)
  sandbox.postMessage = (m) => {
    log(m)
    if ((m.type === 'stdout' || m.type === 'stderr') && m.id === 200 + step) buf.push(m.text)
    if (m.type === 'joberror') { console.log(`JOBERROR id=${m.id}: ${m.message}`); finish(false, 'joberror') }
    if (m.type === 'done' && m.id === 101) next()
    if (m.type === 'done' && m.id === 200 + step) {
      const out = buf.join('\n'); buf = []
      const ok = STEPS[step].check(out)
      console.log(`  ${ok ? '✓' : '✗'} step "${STEPS[step].name}"`)
      if (!ok) { fs.writeFileSync('/tmp/step-out.txt', JSON.stringify({step: STEPS[step].name, out}, null, 2)); finish(false, `step "${STEPS[step].name}" output mismatch:\n${out.slice(0, 2000)}`) }
      step++
      if (step < STEPS.length) next()
      else finish(true, 'all package-manager steps passed')
    }
  }
  function next() { buf = []; send({ type: 'eval', id: 200 + step, code: STEPS[step].code }) }
}
vm.runInContext(fs.readFileSync(path.join(publicDir, 'wecl-worker.js'), 'utf8'), context, { filename: 'wecl-worker.js' })
setTimeout(() => finish(false, 'global timeout'), 180000)
