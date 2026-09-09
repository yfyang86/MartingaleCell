/* module persistence: install → snapshot → FRESH worker → restore → use.
 * Mirrors the page flow: runtime.persistModules() after ;;MODULES-CHANGED,
 * runtime.restoreModules() on boot. Run: node scripts/pkg-persist-test.mjs */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const results = []
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}`); if (!ok) results.push('  ' + detail) }

/** Boot a fresh wecl worker in its own vm context; resolves {send, wait, out}. */
async function bootWorker() {
  const out = []
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
      if ((m.type === 'stdout' || m.type === 'stderr') && m.text !== undefined) out.push(`[${m.id}] ${m.text}`)
      else if (m.type === 'modules-data') out.push(`[modules-data] ${m.files.length} files: ${m.files.map((f) => f.path).join(', ')}`)
      else if (m.type === 'boot') out.push(`boot: ${m.line}`)
      else if (m.type !== 'done') out.push(`[${m.id ?? ''}] ${m.type}: ${m.message ?? ''}`)
    },
  }
  const ctx = vm.createContext(sandbox)
  vm.runInContext('Object.defineProperty(globalThis, "self", { get: function () { return globalThis }, configurable: false })', ctx)
  sandbox.importScripts = (...urls) => {
    for (const url of urls) vm.runInContext(fs.readFileSync(path.join(publicDir, String(url)), 'utf8'), ctx, { filename: String(url) })
  }
  let ready, readyP = new Promise((r) => (ready = r))
  const origPost = sandbox.postMessage
  sandbox.postMessage = (m) => { origPost(m); if (m.type === 'ready') ready() }
  vm.runInContext(fs.readFileSync(path.join(publicDir, 'wecl-worker.js'), 'utf8'), ctx, { filename: 'wecl-worker.js' })
  await readyP
  let lastModulesData = null
  const waiters = new Map()
  sandbox.postMessage = (m) => {
    origPost(m)
    if (m.type === 'modules-data') lastModulesData = m.files
    const w = waiters.get(m.id)
    if (w && m.type === 'done') { waiters.delete(m.id); w() }
    if (w && m.type === 'joberror') { waiters.delete(m.id); w(new Error(m.message)) }
  }
  return {
    out,
    send: (msg) => sandbox.onmessage({ data: msg }),
    wait: (id) => new Promise((res, rej) => waiters.set(id, () => res())),
    eval: async function (id, code) { this.send({ type: 'eval', id, code }); await this.wait(id) },
    modulesData: () => lastModulesData,
  }
}

/* phase 1 — load project, install, snapshot (the ;;MODULES-CHANGED flow) */
const w1 = await bootWorker()
const base = process.env.SAMPLE_PROJECT_DIR || '/tmp/clplot/cl-plot-master' /* unzip public/sample-projects/cl-plot.zip */
const files = fs.readdirSync(base).filter((n) => /\.(lisp|asd)$/i.test(n))
  .map((n) => ({ path: n, content: fs.readFileSync(path.join(base, n), 'utf8') }))
w1.send({ type: 'load-project', id: 1, files })
await w1.wait(1)
await w1.eval(2, '(package-install "cl-plot")')
check('install emits ;;MODULES-CHANGED', w1.out.some((l) => l.includes(';;MODULES-CHANGED')), w1.out.join('\n').slice(-500))

w1.send({ type: 'modules-snapshot', id: 1000 })
await w1.wait(1000)
const snap = w1.modulesData()
check('snapshot has registry + 5 module files', snap && snap.length === 6 && snap.some((f) => f.path.includes('registry')), (snap || []).map((f) => f.path).join(', '))

/* phase 2 — FRESH worker (simulated reload): restore, then use the module */
const w2 = await bootWorker()
w2.send({ type: 'modules-restore', id: 2000, files: snap })
await w2.wait(2000)
await w2.eval(3, '(package-list)')
check('fresh worker lists restored package', w2.out.some((l) => l.includes('cl-plot 0.1') && l.includes('5 files')), w2.out.join('\n').slice(-600))
await w2.eval(4, '(package-load "cl-plot")')
check('package-load (no project) loads from /modules', w2.out.some((l) => l.includes(';;FILE: /modules/cl-plot/plot.lisp|ok')) && w2.out.some((l) => l.includes(';; package cl-plot loaded')), w2.out.join('\n').slice(-800))
await w2.eval(7, '(package-load "nope")')
check('package-load unknown errors with installed list', w2.out.some((l) => l.includes('package "nope" is not installed') && l.includes('cl-plot')), w2.out.join('\n').slice(-400))
await w2.eval(8, '(package-install "whatever")')
check('install with no project gives helpful error', w2.out.some((l) => l.includes('no project is loaded') && l.includes('package-list')), w2.out.join('\n').slice(-400))
await w2.eval(5, '(let ((f (make-instance (quote figure)))) (xlabel f "move") (scatter f (quote ((0 4) (1 3))) :with "lines") (show f))')
check('figure generated after restore', w2.out.some((l) => l.includes(';;PLOT64')), w2.out.join('\n').slice(-800))
await w2.eval(6, '(package-uninstall "cl-plot")')
check('uninstall after restore works', w2.out.some((l) => l.includes('package cl-plot uninstalled')), w2.out.join('\n').slice(-400))

console.log(results.join('\n'))
process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0)
