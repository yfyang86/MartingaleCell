/* Sprint 4 regression test: standard input through the pause primitive,
 * against the REAL wecl-worker.js + wecl.wasm in a Node vm sandbox.
 *
 * A job that reads *standard-input* must print ;;READ-WAIT and suspend (no
 * 'done'); a {type:'input', id, text} message must resume it; text null is
 * end of file. Covered: read-line, a prompt printed before the read, read
 * of a form across two lines, y-or-n-p, an EOF-terminated read-line loop,
 * with-output-to-string around a read (marker must still arrive), and a
 * healthy eval after.
 *
 * Usage: node scripts/stdin-test.mjs        (exit 0 iff every check passes)
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
const stdoutOf = (id) => messages.filter((m) => m.type === 'stdout' && m.id === id).map((m) => m.text)
const isDone = (id) => messages.some((m) => (m.type === 'done' || m.type === 'joberror') && m.id === id)
const waits = (id) => linesOf(id).filter((l) => l.startsWith(';;READ-WAIT')).length
const waitFor = (pred, ms, what) => new Promise((resolve, reject) => {
  const t0 = Date.now()
  const tick = setInterval(() => {
    if (pred()) { clearInterval(tick); resolve() }
    else if (Date.now() - t0 > ms) { clearInterval(tick); reject(new Error(`${what} timed out`)) }
  }, 20)
})
function evalJob(id, code) {
  console.log(`\n--- job ${id}: ${code.replace(/\n/g, ' ').slice(0, 110)}`)
  send({ type: 'eval', id, code })
}
const untilWait = (id, n = 1) => waitFor(() => waits(id) >= n || isDone(id), 20000, `job ${id} read-wait #${n}`)
const untilDone = (id) => waitFor(() => isDone(id), 20000, `job ${id} done`)
const feed = (id, text) => send({ type: 'input', id, text })

async function run() {
  try {
    /* 1. read-line */
    evalJob(1, '(read-line)')
    await untilWait(1)
    check('1: (read-line) prints ;;READ-WAIT and does not finish', waits(1) === 1 && !isDone(1), linesOf(1).join(' | '))
    feed(1, 'hello, page')
    await untilDone(1)
    check('1: the fed line is the value (two values, one ;;=> line each)', linesOf(1).includes(';;=> "hello, page"') && linesOf(1).includes(';;=> NIL'), linesOf(1).join(' | '))

    /* 2. a prompt printed before the read reaches stdout BEFORE the wait */
    evalJob(2, '(progn (format t "Name? ") (finish-output) (let ((n (read-line))) (format t "~&hi ~A~%" n) n))')
    await untilWait(2)
    const all2 = linesOf(2)
    check('2: prompt reaches stdout BEFORE the read blocks (TTY flushed)', all2.findIndex((l) => /Name\?/.test(l)) >= 0 && all2.findIndex((l) => /Name\?/.test(l)) < all2.indexOf(';;READ-WAIT') && !isDone(2), all2.join(' | '))
    feed(2, 'Ada')
    await untilDone(2)
    check('2: program continues with the line → "hi Ada"', stdoutOf(2).some((l) => /hi Ada/.test(l)) && linesOf(2).includes(';;=> "Ada"'), linesOf(2).join(' | '))

    /* 3. (read) of a form split across two lines */
    evalJob(3, '(read)')
    await untilWait(3)
    feed(3, '(list 1')
    await untilWait(3, 2)
    check('3: an incomplete form asks for another line', waits(3) === 2 && !isDone(3), linesOf(3).join(' | '))
    feed(3, '  2 3)')
    await untilDone(3)
    check('3: (read) returns the whole form', linesOf(3).includes(';;=> (LIST 1 2 3)'), linesOf(3).join(' | '))

    /* 4. y-or-n-p via *query-io* */
    evalJob(4, '(y-or-n-p "Continue?")')
    await untilWait(4)
    const all4 = linesOf(4)
    check('4: y-or-n-p prompt precedes the wait', all4.findIndex((l) => /Continue\?/.test(l)) >= 0 && all4.findIndex((l) => /Continue\?/.test(l)) < all4.indexOf(';;READ-WAIT') && !isDone(4), all4.join(' | '))
    feed(4, 'y')
    await untilDone(4)
    check('4: y → T', linesOf(4).includes(';;=> T'), linesOf(4).join(' | '))

    /* 5. EOF ends a read-line loop */
    evalJob(5, '(loop for line = (read-line *standard-input* nil :eof) until (eq line :eof) collect line)')
    await untilWait(5)
    feed(5, 'one')
    await untilWait(5, 2)
    feed(5, 'two')
    await untilWait(5, 3)
    feed(5, null)
    await untilDone(5)
    check('5: EOF (text null) ends the loop → ("one" "two")', linesOf(5).includes(';;=> ("one" "two")'), linesOf(5).join(' | '))

    /* 6. a NEW job starts with a fresh stdin: EOF is per cell, not for ever */
    evalJob(6, '(read-line *standard-input* nil :still-eof)')
    await untilWait(6)
    check('6: the next job asks for input again (EOF is per job)', waits(6) === 1 && !isDone(6), linesOf(6).join(' | '))
    feed(6, 'again')
    await untilDone(6)
    check('6: … and gets the new line', linesOf(6).includes(';;=> "again"') && linesOf(6).includes(';;=> NIL'), linesOf(6).join(' | '))

    /* 7. leftover input from one job is not read by the next */
    evalJob(7, '(read)')
    await untilWait(7)
    feed(7, '1 2')
    await untilDone(7)
    check('7: (read) consumes the first form only', linesOf(7).includes(';;=> 1'), linesOf(7).join(' | '))
    evalJob(70, '(read)')
    await untilWait(70)
    check('7: the leftover " 2" was discarded — the next job waits', waits(70) === 1 && !isDone(70), linesOf(70).join(' | '))
    feed(70, '3')
    await untilDone(70)
    check('7: … and reads the new line', linesOf(70).includes(';;=> 3'), linesOf(70).join(' | '))

    /* 8. with-output-to-string around the read: the marker still arrives (stderr) */
    evalJob(8, '(with-output-to-string (*standard-output*) (princ (read-line)))')
    await untilWait(8)
    check('8: ;;READ-WAIT survives a rebound *standard-output*', waits(8) === 1 && !isDone(8))
    feed(8, 'captured')
    await untilDone(8)
    check('8: value is the captured string', linesOf(8).includes(';;=> "captured"'), linesOf(8).join(' | '))

    /* 9. still healthy */
    evalJob(9, '(+ 40 2)')
    await untilDone(9)
    check('9: image healthy after all reads', linesOf(9).includes(';;=> 42'))

    const failed = results.filter((r) => r.startsWith('✗')).length
    finish(failed === 0, failed === 0 ? `${results.length} checks passed` : `${failed} check(s) failed`)
  } catch (e) {
    finish(false, e?.message ?? String(e))
  }
}
setTimeout(() => finish(false, 'timeout (boot or job hung)'), 150000)
vm.runInContext(fs.readFileSync(path.join(publicDir, 'wecl-worker.js'), 'utf8'), context, { filename: 'wecl-worker.js' })
