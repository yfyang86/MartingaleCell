/* Sprint 2 spike (runnable proof for Sprint 3): can a Lisp handler PAUSE the
 * image, hand the choice to the page, and resume with a restart?
 *
 * Finding: yes. The WECL glue is Asyncify-built and exports
 *   eu.turtleware.wecl/implementation::js-wait  (string of JS source)
 * which evaluates the expression, awaits the resulting promise and calls
 * `.text()` on the value (it was written for fetch() Responses). While the
 * promise is pending the wasm is suspended at the call site, i.e. inside the
 * handler-bind handler, with the dynamic environment (restarts, frames)
 * intact. Resolving the promise with {text: () => "…"} resumes Lisp with that
 * string. There is also js-read*, which suspends until JS calls the glue's
 * global `read_promise(string)`.
 *
 * This script wires a global `__ccChoose` on the worker scope, has a Lisp
 * handler call js-wait on a promise that __ccChoose resolves, and drives two
 * scenarios: USE-VALUE with a value, and CONTINUE. It is NOT product code —
 * the production protocol (postMessage instead of a global, a debug marker
 * with the restart list, cell UI) is Sprint 3.
 *
 * Usage: node scripts/restart-spike.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const messages = []
const results = []
const check = (name, ok, detail = '') => results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`)

const patchedFs = Object.create(fs)
patchedFs.readFileSync = function (p, opts) {
  const s = String(p)
  if (s.startsWith('/wecl/')) return fs.readFileSync(path.join(publicDir, s), opts)
  return fs.readFileSync(p, opts)
}
/* the "page side": a pending choice the Lisp handler waits on */
let pendingChoice = null
const sandbox = {
  console, process,
  setTimeout, clearTimeout, setInterval, clearInterval,
  TextDecoder, TextEncoder, WebAssembly, Uint8Array, ArrayBuffer, Buffer, URL, performance,
  Promise, Error, TypeError, RegExp, JSON, Math, Date, Map, Set, String, Number, Boolean, Array, Object,
  queueMicrotask, fetch,
  require: (m) => (m === 'fs' ? patchedFs : null),
  __dirname: path.join(publicDir, 'wecl'),
  __filename: path.join(publicDir, 'wecl', 'wecl.js'),
  /* Lisp calls js-wait("__ccChoose()") → a promise the harness resolves later */
  __ccChoose: () => new Promise((resolve) => { pendingChoice = (s) => resolve({ text: () => s }) }),
  postMessage: (m) => {
    messages.push(m)
    if (m.type === 'stdout' || m.type === 'stderr') { if (m.id) console.log(`  [${m.id}] ${m.text}`) }
    else if (m.type === 'ready') run()
    else if (m.type === 'bootfail' || m.type === 'crash') finish(false, `${m.type}: ${m.message}`)
  },
}
sandbox.importScripts = (...urls) => {
  for (const url of urls) vm.runInContext(fs.readFileSync(path.join(publicDir, String(url)), 'utf8'), context, { filename: String(url) })
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
const waitFor = (pred, ms, what) => new Promise((resolve, reject) => {
  const t0 = Date.now()
  const tick = setInterval(() => {
    if (pred()) { clearInterval(tick); resolve() }
    else if (Date.now() - t0 > ms) { clearInterval(tick); reject(new Error(`${what} timed out`)) }
  }, 20)
})
const doneJob = (id) => () => messages.some((m) => (m.type === 'done' || m.type === 'joberror') && m.id === id)

const HANDLER =
  '(defun boom (x) (/ 10 x))' +
  '(defun page-restart-handler (e)' +
  '  (format t "~&;;DEBUG-SPIKE: ~A restarts=~{~A~^,~}~%" (type-of e) (mapcar (function restart-name) (compute-restarts e)))' +
  '  (finish-output)' +
  '  (let* ((choice (eu.turtleware.wecl/implementation::js-wait "__ccChoose()"))' +
  '         (sp (position #\\Space choice))' +
  '         (name (intern (string-upcase (subseq choice 0 sp)) :keyword))' +
  '         (arg (and sp (read-from-string (subseq choice (1+ sp))))))' +
  '    (format t "~&;;DEBUG-SPIKE: page chose ~A~%" choice)' +
  '    (let ((r (find-restart (intern (symbol-name name) :cl) e)))' +
  '      (cond ((null r) nil)' +
  '            (arg (invoke-restart r arg))' +
  '            (t (invoke-restart r))))))'

async function run() {
  try {
    send({ type: 'eval', id: 1, code: HANDLER })
    await waitFor(doneJob(1), 20000, 'handler definition')

    /* scenario A: USE-VALUE 99 chosen by the page while Lisp is suspended */
    send({ type: 'eval', id: 2, code:
      '(restart-case (handler-bind ((error (function page-restart-handler))) (list :got (boom 0)))' +
      '  (use-value (v) :report "Use a value" (list :used v)))' })
    await waitFor(() => pendingChoice !== null, 10000, 'Lisp pausing in the handler')
    const pausedA = !doneJob(2)()
    check('A: the job is suspended inside the handler (not done, choice pending)', pausedA)
    check('A: the pause reported the live restarts to the page', linesOf(2).some((l) => /;;DEBUG-SPIKE: DIVISION-BY-ZERO restarts=.*USE-VALUE/.test(l)), linesOf(2).join(' | '))
    await new Promise((r) => setTimeout(r, 300)) /* "the user thinks" */
    const chooseA = pendingChoice; pendingChoice = null; chooseA('use-value 99')
    await waitFor(doneJob(2), 10000, 'resume after USE-VALUE')
    check('A: USE-VALUE 99 resumed the computation → (:USED 99)', linesOf(2).includes(';;=> (:USED 99)'), linesOf(2).join(' | '))

    /* scenario B: CONTINUE via with-simple-restart */
    send({ type: 'eval', id: 3, code:
      '(handler-bind ((error (function page-restart-handler)))' +
      '  (list (with-simple-restart (continue "Skip it") (boom 0)) :after))' })
    await waitFor(() => pendingChoice !== null, 10000, 'Lisp pausing (B)')
    const chooseB = pendingChoice; pendingChoice = null; chooseB('continue')
    await waitFor(doneJob(3), 10000, 'resume after CONTINUE')
    check('B: CONTINUE resumed past the error → (NIL :AFTER)', linesOf(3).includes(';;=> (NIL :AFTER)'), linesOf(3).join(' | '))

    /* scenario C: the image is still fine afterwards */
    send({ type: 'eval', id: 4, code: '(+ 40 2)' })
    await waitFor(doneJob(4), 10000, 'sanity eval')
    check('C: image healthy after two pauses', linesOf(4).includes(';;=> 42'))

    const failed = results.filter((r) => r.startsWith('✗')).length
    finish(failed === 0, failed === 0 ? 'restart pause/resume protocol is viable (see header)' : `${failed} check(s) failed`)
  } catch (e) {
    finish(false, e?.message ?? String(e))
  }
}
setTimeout(() => finish(false, 'timeout'), 120000)
vm.runInContext(fs.readFileSync(path.join(publicDir, 'wecl-worker.js'), 'utf8'), context, { filename: 'wecl-worker.js' })
