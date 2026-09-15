# Sprint 13 — Goal and plan

Date: 2026-09-10 · Branch: `sprint13` → PR into `dev` · Follows `Sprints/Sprint12/04-next-sprint.md`

## Goal

Replace in workspace, carried over twice, gets built on the search panel:
the matches it already lists become edits, applied through the editor so
they are undoable, and never written to disk without the user saving.
If time allows, a value that the pretty printer wraps stays one value.

## Scope (from the Sprint 12 proposal: K, S if time)

### K. Replace in workspace (medium)
- Pure (`src/search/workspace-search.ts`): `replaceInText(content, re,
  replacement, opts)` rewrites the matches `searchText` would report
  (same case / whole-symbol / regex / code-only rules, so a hit inside a
  comment is skipped in code-only mode), expanding `$1`/`$&` in regex mode
  and inserting the text verbatim otherwise; returns the new text and
  the count. `replaceInSources` does it per source.
- Panel: a Replace toggle under the query reveals the replacement box, a
  preview on every hit (`old → new`), a per-file "replace in file" button
  and "Replace all (n in k files)" with an inline confirm step.
- Applying: the active buffer through the editor (one transaction, Ctrl+Z
  undoes it); other open buffers through the store; a project file that
  is not open is opened as a buffer first and edited there, left dirty —
  nothing reaches disk until Ctrl+S. The search re-runs afterwards.
- `search-test.mjs`: literal, regex with groups, `$` in a literal
  replacement, code-only skipping, whole-symbol, counts, and no change
  when nothing matches. Browser smoke: replace `sq` → `sq2` across two
  buffers, both change, Ctrl+Z restores the active one.

### S. Multi-line values (small, if time)
Check whether a long list value wraps under the pretty printer in this
image; if so, bind `*print-pretty*` to nil around the `;;=>` print in
`eval-one` and add a harness check that a 60-element list is one line.

## Out of scope
Writing project files to disk from the panel; rebuilt WECL.

## Acceptance
- Replace-all across open buffers and unopened project files leaves the
  edits in buffers, undoable in the active one, nothing on disk.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
