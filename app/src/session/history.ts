/* Session-box input history (Sprint 20): the pure rules behind ↑/↓ in the
 * REPL prompt. The list is newest-first, capped, without adjacent
 * duplicates; it lives in the workspace store and is persisted with it.
 * A cursor of -1 means "not walking the history" (the live input). */

export const HISTORY_CAP = 100

/** push a submitted form; the newest entry comes first, an immediate repeat is not duplicated */
export function pushHistory(history: readonly string[], text: string, cap = HISTORY_CAP): string[] {
  const t = text.trim()
  if (!t) return history.slice()
  if (history[0] === t) return history.slice(0, cap)
  return [t, ...history].slice(0, cap)
}

export interface RecallState {
  /** current cursor: -1 = live input, 0 = newest entry */
  idx: number
  /** the input's text */
  text: string
  /** caret at the start of the input (anchor === head === 0) */
  atStart: boolean
}

/** the next cursor and text for ↑ (dir 1) or ↓ (dir -1); null when the key should fall through to the editor */
export function recallStep(history: readonly string[], s: RecallState, dir: 1 | -1): { idx: number; text: string } | null {
  if (dir === 1) {
    /* ↑ only from the start of a single-line input (or while already walking), so multi-line editing keeps its arrows */
    if (s.idx < 0 && (!s.atStart || s.text.includes('\n'))) return null
    const next = Math.min(s.idx + 1, history.length - 1)
    if (next === s.idx || next < 0) return null
    return { idx: next, text: history[next] }
  }
  if (s.idx < 0) return null
  const next = s.idx - 1
  return { idx: next, text: next < 0 ? '' : history[next] }
}

/** restore a persisted list: strings only, trimmed, capped */
export function sanitizeHistory(raw: unknown, cap = HISTORY_CAP): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const t = v.trim()
    if (!t || out[out.length - 1] === t) continue
    out.push(t)
    if (out.length >= cap) break
  }
  return out
}

/** entries containing `query` (case-insensitive substring), newest first, capped — an empty query lists the newest entries */
export function filterHistory(history: readonly string[], query: string, cap = 8): string[] {
  const q = query.trim().toLowerCase()
  const out: string[] = []
  for (const h of history) {
    if (q && !h.toLowerCase().includes(q)) continue
    out.push(h)
    if (out.length >= cap) break
  }
  return out
}
