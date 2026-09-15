# Sprint 15 — Goal and plan

Date: 2026-09-10 · Branch: `sprint15` → PR into `dev` · Follows `Sprints/Sprint14/04-next-sprint.md`

## Goal

Finish what per-buffer editor state started: an edit made to a buffer
while it was not shown becomes an undo step of that buffer instead of
wiping its history, and each buffer keeps its scroll position. If time
allows, transcripts can cap long values.

## Scope (from the Sprint 14 proposal: Z + AA, AB if time)

### Z. Store edits into stashed states (small)
When the incoming buffer's stashed document differs from the store
(a replace through the store, a transcript loaded into it), apply the
difference as a transaction on the stashed state (`state.update`) and
show that, instead of building a fresh state. Ctrl+Z then reverts the
store edit in that buffer too, and the rest of its history is intact.
Smoke: after the replace, Ctrl+Z in the other buffer restores its
pre-replace text (it changed nothing in Sprint 14); Ctrl+Y re-applies.

### AA. Per-buffer scroll position (small)
Stash `scrollDOM.scrollTop` with the state and restore it after
`setState`. Smoke: a 300-line buffer scrolled down, switch away and
back, the scroll offset is back.

### AB. Transcript export: value limit (small, if time)
A setting "transcript value limit" (0 = whole values) truncates each
value in the Markdown and `.lisp` exports at N characters with an
ellipsis and the original length; off by default. Tests for both
builders.

## Out of scope
Rebuilt WECL.

## Acceptance
- No edit path leaves a buffer without its undo history.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
