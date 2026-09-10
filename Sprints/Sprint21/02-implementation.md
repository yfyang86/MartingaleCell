# Sprint 21 — Implementation notes

## AT. Cell history view

**Lineage.** `Cell.lineage` is the id of the first cell in a re-run
chain; a first run has none. It is set in three places:

- `rerunCell(cell)` passes `lineage: lineageOf(cell)` (the cell's own
  lineage, or its id) through the evaluation origin, for a linked buffer
  and for a plain re-run alike (the plain case now carries an origin with
  an empty buffer id; the definition callback ignores it as before).
- `evaluateCode` falls back to `lineageForBuffer(buffers, cells,
  origin.bufferId)`: an evaluation from a buffer whose origin is a cell
  (`cell-N.lisp`, opened with "Open as buffer") joins that cell's runs
  even when it is evaluated with Ctrl+Enter rather than the ↻ button.
- Cells restored from IndexedDB keep the field; imported transcript
  cells have none.

`src/session/lineage.ts` holds the rules: `lineageOf`, `runsOf` (by
cell number), `runIndex` / `runIndexAll` (k of N; the latter is one
pass over the cells for the list), `compareRuns(prev, cur)` — input
changed (trimmed), per-index value changed, count changed, status
changed — and `lineageForBuffer`.

**Chip.** `SessionPanel` computes `runIndexAll(cells)` once per cells
change and passes each cell its `k/N` as a string prop, so the memoised
`CellView` re-renders only when its own count changes. A cell whose N
is 2 or more shows `run k/N` next to `In [n]`; clicking it sets
`ui.cellHistory` to the lineage.

**View.** `CellHistoryModal` (in `Modals.tsx`, wide shell): one column
per run, oldest first; rows for when, status (+ duration, "changed"
when the status differs from the run before), input (`same as [n]` when
unchanged, else the text with a "changed" tag), one row per value index
with the value in the warning colour when it differs from the previous
run's value at that index, and an error row when any run has one.
`In [n]` in a column header closes the view and flashes that cell
(`gotoCell(n)`, the existing `conscell:goto-cell` event); "Re-run"
re-runs the newest run.

## AW. Smoke job on `dev` pushes

`.github/workflows/ci.yml`: the `smoke` job's condition is now
`push || (pull_request && label)`. On a push to `dev` it runs next to
`check` on the merge commit — a report, since the merge has happened;
the label path is unchanged.

## AY. Session-box history search

`filterHistory(history, query, cap = 8)` in `src/session/history.ts`:
case-insensitive substring, newest first, an empty query lists the
newest entries. `ReplInput` binds Ctrl+R (Ctrl on every platform — ⌘R
reloads) to open a popover above the box: an input with the matches
under it; ↑ / ↓ or Ctrl+R move the selection, Enter puts the entry in
the box and focuses it, Esc (or blur) closes. The history it searches
is the persisted one from Sprint 20.

## Tests

- `scripts/lineage-test.mjs` (16 checks): lineage, runs order, run
  index (single and all-at-once), comparison flags, lineage of a cell
  buffer. In `pnpm test` and CI.
- `scripts/session-history-test.mjs` +4: the filter.
- Browser smoke: new `history` scenario (4 checks + page errors): three
  runs through the ↻ button show chips 1/3 … 3/3 and the defvar cell
  none; the view has three columns with values 1, 2, 3, two marked
  changed and the input never; `In [2]` closes the view and flashes
  cell 2; Ctrl+R lists two entries, `remem` filters to one, Enter
  recalls it.

## Docs and README

Session cells: a "Run history" card. Shortcuts: Ctrl+R under Session.
README: the lineage test, the smoke on `dev` pushes; the smoke header
comment.
