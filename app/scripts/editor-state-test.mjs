/* Editor per-buffer state rules, in Node: bundles src/editor/buffer-states.ts
 * with @codemirror/state and @codemirror/commands (both DOM-free) and checks
 * that a buffer switch never becomes an undo step and never drops history.
 *
 * Usage: node scripts/editor-state-test.mjs   (exit 0 iff every check passes)
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); return ok }

const built = await esbuild.build({
  stdin: {
    contents: "export { BufferStates, scheduleScrollRestore, statesToJSON, statesFromJSON } from './src/editor/buffer-states'\nexport { EditorState } from '@codemirror/state'\nexport { history, historyField, undo, redo, undoDepth, redoDepth } from '@codemirror/commands'\n",
    resolveDir: root, loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
  alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
})
const { BufferStates, scheduleScrollRestore, statesToJSON, statesFromJSON, EditorState, history, historyField, undo, redo, undoDepth, redoDepth } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))

/* newGroupDelay 0: adjacent edits are separate undo events (the default groups typing within 500 ms, which in Node is every edit) */
const ext = [history({ newGroupDelay: 0 })]
const fresh = (doc) => EditorState.create({ doc, extensions: ext })
/* run a command against a state without a view */
const run = (cmd, state) => { let out = state; cmd({ state, dispatch: (tr) => { out = tr.state } }); return out }
/* a user edit: append text as its own transaction */
const type = (state, text) => state.update({ changes: { from: state.doc.length, insert: text }, userEvent: 'input.type' }).state

const bs = new BufferStates()

/* buffer A: two user edits, then stashed */
let a = fresh('(a)')
a = type(a, '\n(b)')
a = type(a, '\n(c)')
check('setup: two undo steps in A', undoDepth(a) === 2, String(undoDepth(a)))
bs.stash('A', a, 1234)

/* switching to unknown B → fresh */
const rb = bs.resolve('B', '(x)', fresh)
check('unknown buffer → fresh state from the store content, no scroll, no history', rb.source === 'fresh' && rb.state.doc.toString() === '(x)' && rb.scrollTop === null && undoDepth(rb.state) === 0)

/* back to A, unchanged → restored, history intact, scroll back */
const ra = bs.resolve('A', '(a)\n(b)\n(c)', fresh)
check('same content → restored: the very same state, 2 undo steps, scroll 1234', ra.source === 'restored' && ra.state === a && undoDepth(ra.state) === 2 && ra.scrollTop === 1234)
const afterUndo = run(undo, ra.state)
check('undo after a restore undoes the last user edit, not a "switch"', afterUndo.doc.toString() === '(a)\n(b)' && undoDepth(afterUndo) === 1, afterUndo.doc.toString())

/* A edited through the store while away → updated: one extra undo step */
bs.stash('A', a, 77)
const ru = bs.resolve('A', '(a)\n(b)\n(C!)', fresh)
check('store edit while away → updated: shows the store content with 3 undo steps and the stashed scroll', ru.source === 'updated' && ru.state.doc.toString() === '(a)\n(b)\n(C!)' && undoDepth(ru.state) === 3 && ru.scrollTop === 77, `${ru.source} depth=${undoDepth(ru.state)}`)
const u1 = run(undo, ru.state)
const u2 = run(undo, u1)
check('undo reverts the store edit first, then the earlier user edit', u1.doc.toString() === '(a)\n(b)\n(c)' && u2.doc.toString() === '(a)\n(b)', `${JSON.stringify(u1.doc.toString())} → ${JSON.stringify(u2.doc.toString())}`)
const r1 = run(redo, u2)
check('redo works across the whole chain', r1.doc.toString() === '(a)\n(b)\n(c)' && redoDepth(r1) === 1, r1.doc.toString())

/* prune */
bs.stash('B', rb.state, 0)
bs.stash('C', fresh('c'), 0)
bs.prune(['A', 'C'])
check('prune drops states of closed buffers only', bs.has('A') && bs.has('C') && !bs.has('B') && bs.size === 2)

/* null id → fresh */
const rn = bs.resolve(null, '', fresh)
check('no active buffer → fresh empty state', rn.source === 'fresh' && rn.state.doc.toString() === '')

/* scroll restore guard (Sprint 17) */
{
  const applied = []
  let queued = null
  const schedule = (fn) => { queued = fn }
  scheduleScrollRestore(2000, () => true, (t) => applied.push(t), schedule)
  check('scroll restore is deferred to the scheduler, not applied immediately', applied.length === 0 && typeof queued === 'function')
  queued()
  check('…and applied on the frame when the buffer is still shown', applied.join() === '2000')
  scheduleScrollRestore(500, () => false, (t) => applied.push(t), schedule)
  queued()
  check('…but skipped when another buffer took over in between', applied.join() === '2000')
}

/* persistence round trip (Sprint 18) */
{
  const src = new BufferStates()
  let p = fresh('(p)')
  p = type(p, '\n(q)')
  p = type(p, '\n(r)')
  src.stash('P', p, 321)
  let live = fresh('(live)')
  live = type(live, ' more')
  const json = statesToJSON(src, { history: historyField }, { id: 'L', state: live, scrollTop: 9 })
  const text = JSON.stringify(json)
  check('toJSON: version 1, one entry per stash plus the live buffer, JSON-serialisable', json.version === 1 && Object.keys(json.buffers).sort().join() === 'L,P' && text.length > 0)
  const back = statesFromJSON(JSON.parse(text), ext, { history: historyField }, ['P', 'L'])
  const rp = back.resolve('P', '(p)\n(q)\n(r)', fresh)
  check('fromJSON: the stash is restored with its document, 2 undo steps and scroll 321', rp.source === 'restored' && rp.state.doc.toString() === '(p)\n(q)\n(r)' && undoDepth(rp.state) === 2 && rp.scrollTop === 321, `${rp.source} depth=${undoDepth(rp.state)} scroll=${rp.scrollTop}`)
  const u = run(undo, rp.state)
  check('…and undo after the round trip undoes the last edit made before it', u.doc.toString() === '(p)\n(q)', u.doc.toString())
  const rl = back.resolve('L', '(live) more', fresh)
  check('the live buffer round-trips too (1 undo step)', rl.source === 'restored' && undoDepth(rl.state) === 1)
  const pruned = statesFromJSON(JSON.parse(text), ext, { history: historyField }, ['P'])
  check('entries whose buffer no longer exists are dropped on load', pruned.has('P') && !pruned.has('L') && pruned.size === 1)
  check('garbage or an older version yields an empty stash set', statesFromJSON(null, ext, { history: historyField }, ['P']).size === 0 && statesFromJSON({ version: 0, buffers: {} }, ext, { history: historyField }, ['P']).size === 0 && statesFromJSON({ version: 1, buffers: { P: { state: 'nope', scrollTop: 0 } } }, ext, { history: historyField }, ['P']).size === 0)
}

/* serialisation cache (Sprint 19) */
{
  const src = new BufferStates()
  const a = type(fresh('(a)'), ' 1')
  const b = type(fresh('(b)'), ' 2')
  src.stash('A', a, 0); src.stash('B', b, 0)
  const cache = new Map()
  const j1 = statesToJSON(src, { history: historyField }, null, cache)
  const j2 = statesToJSON(src, { history: historyField }, null, cache)
  check('cache: unchanged states reuse the same JSON objects on the next save', j1.buffers.A.state === j2.buffers.A.state && j1.buffers.B.state === j2.buffers.B.state && cache.size === 2)
  const a2 = type(a, ' more')
  src.stash('A', a2, 5)
  const j3 = statesToJSON(src, { history: historyField }, null, cache)
  check('cache: a changed state is re-serialised, the other still reused; the new JSON restores the new document', j3.buffers.A.state !== j1.buffers.A.state && j3.buffers.B.state === j1.buffers.B.state && j3.buffers.A.scrollTop === 5 && statesFromJSON(JSON.parse(JSON.stringify(j3)), ext, { history: historyField }, ['A']).resolve('A', '(a) 1 more', fresh).source === 'restored')
  src.prune(['A'])
  statesToJSON(src, { history: historyField }, null, cache)
  check('cache: entries for dropped buffers are evicted', cache.size === 1 && cache.has('A'))
}

console.log(results.join('\n'))
const failed = results.filter((x) => x.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} check(s) failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
