/* Per-buffer editor states (Sprint 14/15), as a DOM-free helper so the
 * rules can be tested in Node with @codemirror/state alone
 * (scripts/editor-state-test.mjs). EditorPanel owns the view; this owns
 * the map of stashed states and decides what to show on a switch. */

import { EditorState } from '@codemirror/state'

export interface Stashed {
  state: EditorState
  scrollTop: number
}

export interface Resolved {
  state: EditorState
  /** stashed scroll offset, null for a fresh state */
  scrollTop: number | null
  /** restored: stash shown as is · updated: store edit applied to the stash as one transaction · fresh: no stash */
  source: 'restored' | 'updated' | 'fresh'
}

export class BufferStates {
  private map = new Map<string, Stashed>()

  /** remember the outgoing buffer's state */
  stash(id: string, state: EditorState, scrollTop: number): void {
    this.map.set(id, { state, scrollTop })
  }

  /** drop states of buffers that no longer exist */
  prune(liveIds: Iterable<string>): void {
    const live = new Set(liveIds)
    for (const id of [...this.map.keys()]) if (!live.has(id)) this.map.delete(id)
  }

  has(id: string): boolean { return this.map.has(id) }
  get size(): number { return this.map.size }
  entries(): IterableIterator<[string, Stashed]> { return this.map.entries() }

  /**
   * The state to show for `id` whose store content is `content`. A stashed
   * state whose document differs from the store gets the difference as one
   * transaction (an undo step of that buffer) rather than being discarded.
   */
  resolve(id: string | null, content: string, makeFresh: (doc: string) => EditorState): Resolved {
    const saved = id ? this.map.get(id) : undefined
    if (!saved) return { state: makeFresh(content), scrollTop: null, source: 'fresh' }
    const st = saved.state
    if (st.doc.toString() === content) return { state: st, scrollTop: saved.scrollTop, source: 'restored' }
    const updated = st.update({ changes: { from: 0, to: st.doc.length, insert: content }, userEvent: 'input.replace' }).state
    return { state: updated, scrollTop: saved.scrollTop, source: 'updated' }
  }
}

/**
 * Restore a stashed scroll offset once the view has laid the new state
 * out — on the next frame — but only if the buffer it belongs to is still
 * the one shown (a switch may have happened in between). `schedule` is
 * requestAnimationFrame in the browser and a plain callback in tests.
 */
export function scheduleScrollRestore(
  top: number,
  stillShown: () => boolean,
  apply: (top: number) => void,
  schedule: (fn: () => void) => unknown,
): void {
  schedule(() => { if (stillShown()) apply(top) })
}

/* ---- persistence (Sprint 18) ---- */

export interface SerializedStates {
  version: 1
  buffers: Record<string, { state: unknown; scrollTop: number }>
}

/** Serialisable state fields (e.g. `{ history: historyField }`), supplied by the caller so this file stays state-only. */
export type StateFields = Record<string, import('@codemirror/state').StateField<unknown>>

export function statesToJSON(bs: BufferStates, fields: StateFields, live?: { id: string; state: EditorState; scrollTop: number } | null): SerializedStates {
  const buffers: SerializedStates['buffers'] = {}
  for (const [id, s] of bs.entries()) buffers[id] = { state: s.state.toJSON(fields), scrollTop: s.scrollTop }
  if (live) buffers[live.id] = { state: live.state.toJSON(fields), scrollTop: live.scrollTop }
  return { version: 1, buffers }
}

/** Rebuild stashes from JSON for the buffers that still exist; malformed entries are skipped. */
export function statesFromJSON(json: unknown, extensions: import('@codemirror/state').Extension, fields: StateFields, liveIds: Iterable<string>): BufferStates {
  const bs = new BufferStates()
  const j = json as Partial<SerializedStates> | null
  if (!j || j.version !== 1 || !j.buffers) return bs
  const live = new Set(liveIds)
  for (const [id, entry] of Object.entries(j.buffers)) {
    if (!live.has(id) || !entry || typeof entry !== 'object') continue
    try {
      bs.stash(id, EditorState.fromJSON(entry.state as Parameters<typeof EditorState.fromJSON>[0], { extensions }, fields), Number(entry.scrollTop) || 0)
    } catch { /* an entry from another version of the extensions: start fresh for that buffer */ }
  }
  return bs
}
