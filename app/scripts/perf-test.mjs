/* Performance FLOOR (not a benchmark): the fast setjmp trampolines in
 * wecl-worker.js make the bytecodes interpreter ~30× faster. This test
 * fails if that ever regresses to stock speed — generous limits so slow
 * CI runners pass, tight enough that the stock glue (≈1450 ms for the
 * incf loop) cannot.
 *
 * Usage: node scripts/perf-test.mjs        (exit 0 iff every check passes)
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const messages = []
const results = []
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); return ok }
const patchedFs = Object.create(fs)
patchedFs.readFileSync = function (p, opts) {
  const s = String(p)
  if (s.startsWith('/wecl/')) return fs.readFileSync(path.join(publicDir, s), opts)
  return fs.readFileSync(p, opts)
}
const sandbox = {
  console, process, setTimeout, clearTimeout, setInterval, clearInterval,
  TextDecoder, TextEncoder, WebAssembly, Uint8Array, ArrayBuffer, Buffer, URL, performance,
  Promise, Error, TypeError, RegExp, JSON, Math, Date, Map, Set, String, Number, Boolean, Array, Object,
  queueMicrotask, fetch,
  require: (m) => (m === 'fs' ? patchedFs : null),
  __dirname: path.join(publicDir, 'wecl'), __filename: path.join(publicDir, 'wecl', 'wecl.js'),
  postMessage: (m) => {
    messages.push(m)
    if (m.type === 'boot') console.log(`  boot: ${m.line}`)
    else if (m.type === 'ready') run()
    else if (m.type === 'bootfail' || m.type === 'crash') finish(false, `${m.type}: ${m.message}`)
  },
}
sandbox.importScripts = (...urls) => { for (const url of urls) vm.runInContext(fs.readFileSync(path.join(publicDir, String(url)), 'utf8'), context, { filename: String(url) }) }
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
const isDone = (id) => messages.some((m) => (m.type === 'done' || m.type === 'joberror') && m.id === id)
async function timed(id, code) {
  const t0 = performance.now()
  send({ type: 'eval', id, code })
  await new Promise((res, rej) => {
    const tick = setInterval(() => {
      if (isDone(id)) { clearInterval(tick); res() }
      else if (performance.now() - t0 > 60000) { clearInterval(tick); rej(new Error(`job ${id} timed out`)) }
    }, 5)
  })
  return performance.now() - t0
}

async function run() {
  try {
    check('fast trampolines were installed at boot', messages.some((m) => m.type === 'boot' && /fast setjmp trampolines installed/.test(m.line)))
    /* warm-up (first job pays one-time costs) */
    await timed(1, '(+ 1 2)')
    const cases = [
      { code: '(let ((n 0)) (dotimes (i 20000) (incf n i)) n)', value: ';;=> 199990000', floorMs: 400, stockMs: 1450 },
      { code: '(defun perf-f (x) x) (let ((n 0)) (dotimes (i 20000) (setq n (perf-f i))) n)', value: ';;=> 19999', floorMs: 400, stockMs: 1470 },
      { code: '(length (loop for i below 20000 collect i))', value: ';;=> 20000', floorMs: 600, stockMs: 1360 },
    ]
    let id = 2
    for (const c of cases) {
      const ms = await timed(id, c.code)
      const ok = linesOf(id).includes(c.value)
      check(`${c.code.slice(0, 60)}… → correct value`, ok, linesOf(id).join(' | '))
      check(`  … in ${ms.toFixed(0)} ms (floor ${c.floorMs} ms; stock glue ≈ ${c.stockMs} ms)`, ms < c.floorMs, `took ${ms.toFixed(0)} ms`)
      id++
    }
    const failed = results.filter((r) => r.startsWith('✗')).length
    finish(failed === 0, failed === 0 ? `${results.length} checks passed` : `${failed} check(s) failed`)
  } catch (e) { finish(false, e?.message ?? String(e)) }
}
setTimeout(() => finish(false, 'timeout'), 120000)
vm.runInContext(fs.readFileSync(path.join(publicDir, 'wecl-worker.js'), 'utf8'), context, { filename: 'wecl-worker.js' })
