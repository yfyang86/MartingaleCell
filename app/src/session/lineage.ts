/* Cell lineage (Sprint 21): the runs of a re-evaluated cell. A cell's
 * lineage is the id of the first cell in its re-run chain; the cells that
 * share it are its runs, in evaluation order. Pure rules — the store and
 * the history view use them. */

export interface RunLike {
  id: string
  n: number
  input: string
  status: string
  values: string[]
  error?: string
  lineage?: string
  startedAt?: number
  durationMs?: number
}

/** the lineage id of a cell: its own id when it is the first run */
export const lineageOf = (cell: { id: string; lineage?: string }): string => cell.lineage ?? cell.id

/** all cells of a lineage in evaluation order (by cell number) */
export function runsOf<T extends RunLike>(cells: readonly T[], lineage: string): T[] {
  return cells.filter((c) => lineageOf(c) === lineage).sort((a, b) => a.n - b.n)
}

/** 1-based position of a cell among its runs, and the run count */
export function runIndex(cells: readonly RunLike[], cell: RunLike): { k: number; total: number } {
  const runs = runsOf(cells, lineageOf(cell))
  return { k: Math.max(1, runs.findIndex((c) => c.id === cell.id) + 1), total: runs.length }
}

/** run position for every cell at once, as "k/N" strings — one pass, for the cell list */
export function runIndexAll(cells: readonly RunLike[]): Map<string, string> {
  const counts = new Map<string, number>()
  for (const c of cells) { const l = lineageOf(c); counts.set(l, (counts.get(l) ?? 0) + 1) }
  const seen = new Map<string, number>()
  const out = new Map<string, string>()
  for (const c of [...cells].sort((a, b) => a.n - b.n)) {
    const l = lineageOf(c)
    const k = (seen.get(l) ?? 0) + 1
    seen.set(l, k)
    out.set(c.id, `${k}/${counts.get(l)}`)
  }
  return out
}

export interface RunComparison {
  /** input text differs from the previous run */
  inputChanged: boolean
  /** per value index: true when it differs from the previous run's value at that index (or that run had none) */
  valueChanged: boolean[]
  /** the runs disagree on the value count */
  countChanged: boolean
  /** status differs (e.g. done → error) */
  statusChanged: boolean
}

/** how a run differs from the one before it; every flag false for the first run */
export function compareRuns(prev: RunLike | undefined, cur: RunLike): RunComparison {
  if (!prev) return { inputChanged: false, valueChanged: cur.values.map(() => false), countChanged: false, statusChanged: false }
  return {
    inputChanged: prev.input.trim() !== cur.input.trim(),
    valueChanged: cur.values.map((v, i) => prev.values[i] !== v),
    countChanged: prev.values.length !== cur.values.length,
    statusChanged: prev.status !== cur.status,
  }
}

/** the lineage a new cell should carry when evaluated from a buffer opened from a cell, else undefined */
export function lineageForBuffer(
  buffers: readonly { id: string; origin?: { type: string; cellId?: string } }[],
  cells: readonly { id: string; lineage?: string }[],
  bufferId: string | undefined,
): string | undefined {
  if (!bufferId) return undefined
  const buf = buffers.find((b) => b.id === bufferId)
  if (!buf || buf.origin?.type !== 'cell' || !buf.origin.cellId) return undefined
  const origin = cells.find((c) => c.id === buf.origin!.cellId)
  return origin ? lineageOf(origin) : buf.origin.cellId
}
