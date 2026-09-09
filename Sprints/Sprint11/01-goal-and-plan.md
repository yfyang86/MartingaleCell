# Sprint 11 — Goal and plan

Date: 2026-09-09 · Branch: `sprint11` → PR into `dev` · Follows `Sprints/Sprint10/04-next-sprint.md`

## Goal

Make the definition index visible and durable: an outline of what a
buffer and the project define, with the same jump plumbing as F12, and
an index that survives a reload the way buffers and cells already do.

## Scope (from the Sprint 10 proposal: M + O, K if time)

### M. Symbol outline (small-medium)
- `src/outline/outline.ts`, pure: `scanDefinitions(src)` lists every
  `(def… name` in a buffer with line/col/offset — at any depth (a
  `defun` inside a `let` counts), skipping strings and both comment
  kinds (reusing `classifyChars`), handling `(setf name)` heads,
  `defstruct` option lists, `defpackage :keyword` names and
  `define-condition` / `deftype` / `defgeneric`.
- `OutlinePanel` in the explorer column (toggle button, Ctrl+Shift+O,
  palette): the active buffer's definitions in order, a tick on those the
  image has evaluated (from the index), then the project's definitions
  from the last load grouped by file, then session-box definitions.
  A filter box; click jumps (buffer position, `gotoLocation`, or the
  cell).
- `scripts/outline-test.mjs` for the scanner. In `pnpm test` and CI.

### O. Persist the definition index (small)
- The project store writes `definitions` and `bufferDefinitions` to
  IndexedDB (debounced) and restores them on hydrate. After both stores
  have hydrated, entries whose buffer id or cell number no longer exists
  are pruned (`pruneDefinitions`, pure, tested), and the completion
  registry is rebuilt.

### K. Replace in workspace (if time)
A replace box under the search query: rewrite open buffers through the
editor (one transaction per buffer, undoable) and project files through
the project store, after a per-file confirmation.

## Out of scope
Rebuilt WECL; value splitting on whitespace in the output parser (noted
in Sprint 10) — a separate small fix.

## Acceptance
- The outline of the Fibonacci example lists `fib-rec`, `fib-iter`,
  `fib-memo` (inside a `let`) and `bench`, and clicking one moves the
  caret to its form.
- After a reload, F12 on a name defined in a scratch buffer during the
  previous visit still jumps to it.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
