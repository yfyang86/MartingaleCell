/* Line diff (Sprint 22): what changed between two runs' inputs. A plain
 * LCS over lines — inputs are cell-sized, so the quadratic table is fine. */

export type DiffKind = 'same' | 'del' | 'add'
export interface DiffLine { kind: DiffKind; text: string }

/** line-level diff of `a` → `b`: deletions come before insertions at the same spot */
export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.replace(/\n$/, '').split('\n')
  const B = b.replace(/\n$/, '').split('\n')
  const n = A.length, m = B.length
  /* lcs[i][j] = LCS length of A[i..] and B[j..] */
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ kind: 'same', text: A[i] }); i++; j++ }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ kind: 'del', text: A[i] }); i++ }
    else { out.push({ kind: 'add', text: B[j] }); j++ }
  }
  while (i < n) { out.push({ kind: 'del', text: A[i] }); i++ }
  while (j < m) { out.push({ kind: 'add', text: B[j] }); j++ }
  return out
}

/** counts of changed lines, for a summary */
export function diffSummary(d: DiffLine[]): { added: number; removed: number } {
  let added = 0, removed = 0
  for (const l of d) { if (l.kind === 'add') added++; else if (l.kind === 'del') removed++ }
  return { added, removed }
}
