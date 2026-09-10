# Sprint 22 — Goal and plan

Date: 2026-09-10 · Branch: `sprint22` → PR into `dev` · Follows `Sprints/Sprint21/04-next-sprint.md`

## Goal

Keep a cell's run history when a session is exported and imported, show
what changed between two runs' inputs, and stop the record-CI push from
cancelling the merge commit's run.

## Scope (from the Sprint 21 proposal: AZ + BA + BC, AX if time)

### AZ. Run history in the transcript (small)
The Markdown heading of a cell that has two or more runs gains
`· run k/N of cell m` (m = the first run's cell number); the `.lisp`
transcript's cell comment carries the same. The importer parses it into
`runOf` and the import re-links the runs: the cell numbered m (or, when
it is not in the transcript, the first imported run of that group)
becomes the lineage root of the others, so the run chips and the
history view work on an imported session.

### BA. Diff two runs' inputs (small-medium)
`src/session/diff.ts`: `diffLines(a, b)` — a line-level LCS diff
(inputs are cell-sized). In the history view the input row of a run
whose input changed shows the diff against the previous run instead of
the whole text: removed lines in red with `-`, added in green with `+`,
unchanged dimmed. Node checks for the diff; the smoke opens a run with a
changed input and counts the diff lines.

### BC. CI on `dev`: keep the merge-commit run (small)
`cancel-in-progress` becomes an expression true only for pull requests,
so pushes to `dev` never cancel each other; the push trigger ignores
`Sprints/**`, so a docs-only push (the record-CI commit) starts no run
at all. The merge commit keeps a completed run with both jobs.

### AX. Fold by kind (small, if time)
"Fold all top-level forms" (bodies stay foldable on their own) and
folding of multi-line `#| … |#` block comments.

## Out of scope
Rebuilt WECL; session-box search across cells (BB).

## Acceptance
- Export a session with three runs of a cell, import it: the imported
  cells show run 1/3 … 3/3 and the history view opens for them.
- A run whose input changed shows `-`/`+` lines against the run before.
- The merge commit of this PR has a completed CI run; the docs push
  after it starts none.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
