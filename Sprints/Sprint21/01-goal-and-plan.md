# Sprint 21 — Goal and plan

Date: 2026-09-10 · Branch: `sprint21` → PR into `dev` · Follows `Sprints/Sprint20/04-next-sprint.md`

## Goal

Show the runs of a re-evaluated cell side by side with their values
compared, run the browser scenarios on every merge to `dev`, and make
the session-box history searchable.

## Scope (from the Sprint 20 proposal: AT, with AW and AY if time)

### AT. Cell history view (medium)
A cell records its lineage: the id of the first cell in its re-run
chain (`Cell.lineage`), set by the re-run button, by evaluating a
linked `cell-N.lisp` buffer (Ctrl+Enter / Ctrl+Shift+Enter in it), and
by the transcript "re-run" affordances that go through `rerunCell`.
Cells sharing a lineage form its runs. A cell with two or more runs
shows a "run k of N" chip; clicking it opens the history view: one
column per run (oldest left), rows for cell number, time, status,
duration, input and values, with a value marked when it differs from
the previous run and the input marked when it changed. Each column can
jump to its cell; the newest run can be re-run from the view. The
rules (`lineageOf`, `runsOf`, `compareRuns`) live in
`src/session/lineage.ts` with a Node test.

### AW. Smoke job on `dev` pushes (small)
The `smoke` job also runs on pushes to `dev` (not a merge gate — the
merge has already happened — but a browser regression that slipped
through an unlabelled PR is seen within minutes, on the merge commit).

### AY. Session-box history search (small, if time)
Ctrl+R in the session box opens a search over the persisted history:
type to filter (case-insensitive substring, newest first), ↑/↓ or
Ctrl+R to move, Enter recalls the entry into the box, Esc closes.
`filterHistory(history, query, cap)` joins the history rules module and
its Node test.

## Out of scope
Rebuilt WECL; fold by kind (AX).

## Acceptance
- Re-running a cell three times and opening the chip shows three
  columns; a changed value is marked; "go to cell" flashes that cell.
- The `smoke` job runs on the merge commit of this PR on `dev`.
- After a reload, Ctrl+R + a substring + Enter recalls a submitted form.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
