/* Sprint 3 regression test: the interactive debugger protocol, against the
 * REAL wecl-worker.js + wecl.wasm in a Node vm sandbox.
 *
 * A job sent with debug:true that signals an unhandled error must PAUSE
 * (;;DEBUG: … ;;RESTART: … ;;DEBUG-WAIT, no 'done'), and a {type:'restart'}
 * message must resume it with the chosen restart. Covered: USE-VALUE with a
 * value, CONTINUE, a user restart-case restart, RETRY, ABORT, decline, a bad
 * value form (re-pause), debug:false (no pause), and a healthy eval after.
 *
 * Usage: node scripts/debugger-test.mjs        (exit 0 iff every check passes)
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
const isDone = (id) => messages.some((m) => (m.type === 'done' || m.type === 'joberror') && m.id === id)
const waitCount = (id) => linesOf(id).filter((l) => l.startsWith(';;DEBUG-WAIT')).length
const waitFor = (pred, ms, what) => new Promise((resolve, reject) => {
  const t0 = Date.now()
  const tick = setInterval(() => {
    if (pred()) { clearInterval(tick); resolve() }
    else if (Date.now() - t0 > ms) { clearInterval(tick); reject(new Error(`${what} timed out`)) }
  }, 20)
})
/** restarts announced in the LAST pause block of a job: [{index,name,report}] */
function restartsOf(id) {
  const lines = linesOf(id)
  const start = lines.lastIndexOf(lines.filter((l) => l.startsWith(';;DEBUG:')).pop())
  return lines.slice(start).filter((l) => l.startsWith(';;RESTART:')).map((l) => {
    const [i, name, ...rest] = l.slice(10).trim().split('|')
    return { index: parseInt(i, 10), name, report: rest.join('|') }
  })
}
const byName = (id, name) => restartsOf(id).find((r) => r.name === name)
async function evalJob(id, code, extra = {}) {
  console.log(`\n--- job ${id}${extra.debug === false ? ' (debug off)' : ''}: ${code.replace(/\n/g, ' ').slice(0, 110)}`)
  send({ type: 'eval', id, code, debug: true, ...extra })
}
async function untilPaused(id, n = 1) { await waitFor(() => waitCount(id) >= n || isDone(id), 20000, `job ${id} pause #${n}`) }
async function untilDone(id) { await waitFor(() => isDone(id), 20000, `job ${id} done`) }

async function run() {
  try {
    await evalJob(1, '(defun boom (x) (/ 10 x)) (defun caller (y) (list :got (boom y)))')
    await untilDone(1)

    /* A: USE-VALUE with a value, from a user restart-case */
    await evalJob(2, '(restart-case (caller 0) (use-value (v) :report "Use a value for the whole form" (list :used v)))')
    await untilPaused(2)
    check('A: job paused (no done) with a ;;DEBUG: block', !isDone(2) && linesOf(2).some((l) => l.startsWith(';;DEBUG:')), linesOf(2).join(' | '))
    check('A: ;;ERRTYPE:/;;FRAME: precede the pause', linesOf(2).some((l) => l === ';;ERRTYPE: DIVISION-BY-ZERO') && linesOf(2).some((l) => l === ';;FRAME: BOOM'))
    const rs = restartsOf(2)
    check('A: live restarts = USE-VALUE (user), RETRY, ABORT — in that order', rs.map((r) => r.name).join(',') === 'USE-VALUE,RETRY,ABORT', JSON.stringify(rs))
    check('A: restart reports carry text', rs.every((r) => r.report.length > 0), JSON.stringify(rs))
    await new Promise((r) => setTimeout(r, 200))
    send({ type: 'restart', id: 2, index: byName(2, 'USE-VALUE').index, value: '(* 7 7)' })
    await untilDone(2)
    check('A: value form is evaluated and passed → (:USED 49)', linesOf(2).includes(';;=> (:USED 49)'), linesOf(2).join(' | '))
    check('A: no ;;ERROR: after a successful restart', !linesOf(2).some((l) => l.startsWith(';;ERROR:')))

    /* B: CONTINUE via with-simple-restart */
    await evalJob(3, '(list (with-simple-restart (continue "Skip the boom") (boom 0)) :after)')
    await untilPaused(3)
    check('B: CONTINUE is offered', !!byName(3, 'CONTINUE'), JSON.stringify(restartsOf(3)))
    send({ type: 'restart', id: 3, index: byName(3, 'CONTINUE').index })
    await untilDone(3)
    check('B: CONTINUE resumed → (NIL :AFTER)', linesOf(3).includes(';;=> (NIL :AFTER)'), linesOf(3).join(' | '))

    /* C: RETRY (the eval-one restart) re-runs THE failing top-level form; the
     * counter must therefore live inside that form (progn), not in a sibling */
    await evalJob(4, '(defvar *tries* 0) (progn (incf *tries*) (if (< *tries* 3) (error "not yet (~D)" *tries*) (list :ok *tries*)))')
    await untilPaused(4)
    check('C: user error pauses with RETRY offered', !!byName(4, 'RETRY'), JSON.stringify(restartsOf(4)))
    send({ type: 'restart', id: 4, index: byName(4, 'RETRY').index })
    await untilPaused(4, 2)
    check('C: RETRY re-ran the form and paused again (second error)', waitCount(4) === 2 && !isDone(4), linesOf(4).join(' | '))
    send({ type: 'restart', id: 4, index: byName(4, 'RETRY').index })
    await untilDone(4)
    check('C: third try succeeds → (:OK 3)', linesOf(4).includes(';;=> (:OK 3)'), linesOf(4).join(' | '))

    /* D: ABORT → the error is reported, no values */
    await evalJob(5, '(caller 0)')
    await untilPaused(5)
    send({ type: 'restart', id: 5, index: byName(5, 'ABORT').index })
    await untilDone(5)
    check('D: ABORT reports ;;ERROR: with the original condition', linesOf(5).some((l) => /^;;ERROR: .*DIVISION-BY-ZERO/.test(l)), linesOf(5).join(' | '))
    check('D: ABORT produces no values', !linesOf(5).some((l) => l.startsWith(';;=>')))

    /* E: decline (index -1) → ordinary error path */
    await evalJob(6, '(undefined-fn-q 1)')
    await untilPaused(6)
    send({ type: 'restart', id: 6, index: -1 })
    await untilDone(6)
    check('E: decline → ;;ERROR: as without a debugger', linesOf(6).some((l) => l.startsWith(';;ERROR: The function UNDEFINED-FN-Q is undefined')), linesOf(6).join(' | '))

    /* F: bad value form → ;;DEBUG-NOTE: and a second pause; then a good one */
    await evalJob(7, '(restart-case (boom 0) (use-value (v) v))')
    await untilPaused(7)
    send({ type: 'restart', id: 7, index: byName(7, 'USE-VALUE').index, value: '(this-does-not-exist)' })
    await untilPaused(7, 2)
    check('F: bad value form → ;;DEBUG-NOTE: and re-pause', linesOf(7).some((l) => l.startsWith(';;DEBUG-NOTE: value form failed')) && waitCount(7) === 2 && !isDone(7), linesOf(7).join(' | '))
    send({ type: 'restart', id: 7, index: byName(7, 'USE-VALUE').index, value: '"fixed"' })
    await untilDone(7)
    check('F: second, good value resumes → "fixed"', linesOf(7).includes(';;=> "fixed"'), linesOf(7).join(' | '))

    /* G: debug:false → no pause at all */
    await evalJob(8, '(caller 0)', { debug: false })
    await untilDone(8)
    check('G: debug:false never pauses and reports the error', waitCount(8) === 0 && linesOf(8).some((l) => l.startsWith(';;ERROR:')), linesOf(8).join(' | '))

    /* H: a user handler-case still wins (no pause) */
    await evalJob(9, '(handler-case (caller 0) (error () :handled))')
    await untilDone(9)
    check('H: user handler-case handles it — no pause, value :HANDLED', waitCount(9) === 0 && linesOf(9).includes(';;=> :HANDLED'), linesOf(9).join(' | '))

    /* J: condition details for a type-error */
    await evalJob(11, '(car 5)')
    await untilPaused(11)
    const det = linesOf(11).filter((l) => l.startsWith(';;DETAIL:')).map((l) => l.slice(9).trim())
    /* ECL signals SIMPLE-TYPE-ERROR expecting CONS for (car 5) */
    check('J: type-error carries datum and expected-type details', det.some((d) => /^datum\|5$/.test(d)) && det.some((d) => /^expected\|(CONS|LIST)$/.test(d)), JSON.stringify(det))
    check('J: STORE-VALUE / DEFINE-FUNCTION are NOT offered for a type-error', !byName(11, 'STORE-VALUE') && !byName(11, 'DEFINE-FUNCTION'), JSON.stringify(restartsOf(11)))
    send({ type: 'restart', id: 11, index: byName(11, 'ABORT').index })
    await untilDone(11)

    /* K: unbound variable → STORE-VALUE sets it and retries the form */
    await evalJob(12, '(list :twice (* 2 *cc-missing*))')
    await untilPaused(12)
    check('K: unbound-variable offers STORE-VALUE with the name detail', !!byName(12, 'STORE-VALUE') && linesOf(12).includes(';;DETAIL: name|*CC-MISSING*'), linesOf(12).join(' | '))
    send({ type: 'restart', id: 12, index: byName(12, 'STORE-VALUE').index, value: '21' })
    await untilDone(12)
    check('K: STORE-VALUE 21 → (:TWICE 42)', linesOf(12).includes(';;=> (:TWICE 42)'), linesOf(12).join(' | '))
    await evalJob(13, '*cc-missing*')
    await untilDone(13)
    check('K: the variable stays set afterwards', linesOf(13).includes(';;=> 21'), linesOf(13).join(' | '))

    /* L: undefined function → DEFINE-FUNCTION binds a lambda and retries */
    await evalJob(14, '(cc-triple 7)')
    await untilPaused(14)
    check('L: undefined-function offers DEFINE-FUNCTION', !!byName(14, 'DEFINE-FUNCTION') && !byName(14, 'STORE-VALUE'), JSON.stringify(restartsOf(14)))
    send({ type: 'restart', id: 14, index: byName(14, 'DEFINE-FUNCTION').index, value: '(lambda (x) (* 3 x))' })
    await untilDone(14)
    check('L: DEFINE-FUNCTION (lambda …) → 21', linesOf(14).includes(';;=> 21'), linesOf(14).join(' | '))
    await evalJob(15, '(cc-triple 10)')
    await untilDone(15)
    check('L: the function stays defined afterwards', linesOf(15).includes(';;=> 30') && waitCount(15) === 0, linesOf(15).join(' | '))

    /* M: an error inside a chosen restart's body pauses AGAIN (nested) */
    await evalJob(17, '(restart-case (boom 0) (use-value (v) :report "then fail" (error "nested ~A" v)))')
    await untilPaused(17)
    send({ type: 'restart', id: 17, index: byName(17, 'USE-VALUE').index, value: '5' })
    await untilPaused(17, 2)
    check('M: error inside the chosen restart re-pauses', waitCount(17) === 2 && !isDone(17) && linesOf(17).some((l) => l === ';;DEBUG: nested 5'), linesOf(17).join(' | '))
    send({ type: 'restart', id: 17, index: byName(17, 'ABORT').index })
    await untilDone(17)
    check('M: ABORT from the nested pause reports the nested error', linesOf(17).some((l) => /^;;ERROR: nested 5/.test(l)), linesOf(17).join(' | '))

    /* N: project load through the debugger */
    const files = [
      { path: 'a.lisp', content: '(defun helper (x) (* 2 x))\n(defparameter *loaded-a* (needs-def 21))\n' },
      { path: 'b.lisp', content: '(defparameter *loaded-b* (helper 5))\n' },
    ]
    console.log('\n--- job 18: load-project (debug) with an undefined function in a.lisp')
    send({ type: 'load-project', id: 18, files, debug: true })
    await untilPaused(18)
    const nr = restartsOf(18).map((r) => r.name)
    check('N: the load pauses with the load restarts', nr.join(',') === 'SKIP-FORM,RETRY,DEFINE-FUNCTION,ABORT-LOAD', JSON.stringify(restartsOf(18)))
    send({ type: 'restart', id: 18, index: byName(18, 'DEFINE-FUNCTION').index, value: '(lambda (x) (+ x 1))' })
    await untilDone(18)
    const fileLines18 = linesOf(18).filter((l) => l.startsWith(';;FILE:'))
    check('N: DEFINE-FUNCTION resumes the load — both files ok', fileLines18.some((l) => /a\.lisp\|ok\|/.test(l)) && fileLines18.some((l) => /b\.lisp\|ok\|/.test(l)), fileLines18.join(' | '))
    await evalJob(19, '(list *loaded-a* *loaded-b*)')
    await untilDone(19)
    check('N: definitions from the resumed load are live → (22 10)', linesOf(19).includes(';;=> (22 10)'), linesOf(19).join(' | '))

    console.log('\n--- job 20: load-project (debug) → SKIP-FORM keeps loading')
    send({ type: 'load-project', id: 20, files: [{ path: 'c.lisp', content: '(defparameter *c1* (no-such-fn))\n(defparameter *c2* :after)\n' }, { path: 'd.lisp', content: '(defparameter *d* :d-loaded)\n' }], debug: true })
    await untilPaused(20)
    send({ type: 'restart', id: 20, index: byName(20, 'SKIP-FORM').index })
    await untilDone(20)
    const fl20 = linesOf(20).filter((l) => l.startsWith(';;FILE:'))
    check('N: SKIP-FORM → c.lisp warn (1/2 forms), d.lisp ok', fl20.some((l) => /c\.lisp\|warn\|1\/2/.test(l)) && fl20.some((l) => /d\.lisp\|ok\|/.test(l)), fl20.join(' | '))

    console.log('\n--- job 21: load-project (debug) → ABORT-LOAD stops before the next file')
    send({ type: 'load-project', id: 21, files: [{ path: 'e.lisp', content: '(defparameter *e* (no-such-fn-2))\n' }, { path: 'f.lisp', content: '(defparameter *f-should-not-load* t)\n' }], debug: true })
    await untilPaused(21)
    send({ type: 'restart', id: 21, index: byName(21, 'ABORT-LOAD').index })
    await untilDone(21)
    const fl21 = linesOf(21).filter((l) => l.startsWith(';;FILE:'))
    check('N: ABORT-LOAD → e.lisp error, f.lisp reported as not loaded', fl21.some((l) => /e\.lisp\|error\|/.test(l)) && fl21.some((l) => /f\.lisp\|error\|not loaded/.test(l)), fl21.join(' | '))
    await evalJob(22, '(boundp (quote *f-should-not-load*))')
    await untilDone(22)
    check('N: the file after ABORT-LOAD really did not load', linesOf(22).includes(';;=> NIL'), linesOf(22).join(' | '))

    console.log('\n--- job 23: load-project WITHOUT debug never pauses')
    send({ type: 'load-project', id: 23, files: [{ path: 'g.lisp', content: '(defparameter *g* (no-such-fn-3))\n(defparameter *g2* 2)\n' }], debug: false })
    await untilDone(23)
    check('N: debug:false → no pause, file warn as before', waitCount(23) === 0 && linesOf(23).some((l) => /;;FILE:.*g\.lisp\|warn\|/.test(l)), linesOf(23).join(' | '))

    /* O: definitions and located warnings from a project load (Sprint 6) */
    console.log('\n--- job 25: load-project reports ;;DEF: and located ;;WARNING:')
    send({ type: 'load-project', id: 25, files: [
      { path: 'src/defs.lisp', content: ';;; a file with definitions\n\n(defun twice (x) (* 2 x))\n\n(defparameter *answer* 42)\n\n(defclass point () ((x :initarg :x)))\n\n(defmethod (setf px) (v (p point)) (setf (slot-value p (quote x)) v))\n\n(warn "careful: ~A" :here)\n(defstruct (pt (:constructor mk-pt)) a b)\n' },
    ], debug: false })
    await untilDone(25)
    const defs = linesOf(25).filter((l) => l.startsWith(';;DEF:')).map((l) => l.slice(6).trim().split('|'))
    const defNamed = (n) => defs.find((d) => d[2] === n)
    check('O: ;;DEF: for defun / defparameter / defclass / defstruct with the file path', ['TWICE', '*ANSWER*', 'POINT', 'PT'].every((n) => defNamed(n) && defNamed(n)[0] === '/project/src/defs.lisp'), JSON.stringify(defs))
    check('O: (setf px) method is reported as (SETF PX)', !!defNamed('(SETF PX)') && defNamed('(SETF PX)')[3] === 'defmethod', JSON.stringify(defs))
    const twiceOff = parseInt((defNamed('TWICE') || [])[1], 10)
    const answerOff = parseInt((defNamed('*ANSWER*') || [])[1], 10)
    check('O: offsets are increasing and point past the header comment', twiceOff >= 28 && answerOff > twiceOff, `twice=${twiceOff} answer=${answerOff}`)
    const lw = linesOf(25).find((l) => /^;;WARNING: \/project\/src\/defs\.lisp\|\d+\|careful: HERE/.test(l))
    check('O: a (warn …) in the file arrives as a located warning path|offset|text', !!lw, linesOf(25).filter((l) => l.startsWith(';;WARNING')).join(' | '))
    check('O: the file still loads ok (a warning is not an error)', linesOf(25).some((l) => /;;FILE:.*defs\.lisp\|ok\|/.test(l)), linesOf(25).filter((l) => l.startsWith(';;FILE')).join(' | '))

    /* I: still healthy; in-package still persists */
    await evalJob(24, '(+ 40 2)')
    await untilDone(24)
    check('I: image healthy after all pauses', linesOf(24).includes(';;=> 42') && linesOf(24).includes(';;PACKAGE: CL-USER'))

    const failed = results.filter((r) => r.startsWith('✗')).length
    finish(failed === 0, failed === 0 ? `${results.length} checks passed` : `${failed} check(s) failed`)
  } catch (e) {
    finish(false, e?.message ?? String(e))
  }
}
setTimeout(() => finish(false, 'timeout (boot or job hung)'), 240000)
vm.runInContext(fs.readFileSync(path.join(publicDir, 'wecl-worker.js'), 'utf8'), context, { filename: 'wecl-worker.js' })
