# Sprint 17 — Goal and plan

Date: 2026-09-10 · Branch: `sprint17` → PR into `dev` · Follows `Sprints/Sprint16/04-next-sprint.md`

## Goal

Tie a cell and the buffer it was opened into together, move the last
browser-only editor rule into the tested helper, and let the replace
confirm show what it is about to import.

## Scope (from the Sprint 16 proposal: AH + AJ, AI if time)

### AH. Cell ↔ buffer link (small-medium)
"Open as buffer" creates the buffer with origin `{ type: 'cell', cellId,
n }` and records `bufferId` on the cell. Re-running a linked cell
evaluates the buffer's *current* text (as an evaluation from that
buffer, so definitions index to it); the cell shows a link chip and the
tab a `[n]` badge. Opening again activates the linked buffer instead of
creating another. Smoke: open cell 1 as a buffer, edit the buffer to
`(+ 1 2)`, re-run the cell — the new cell evaluates `(+ 1 2)` → 3.

### AJ. Scroll-restore guard in the helper (small)
`scheduleScrollRestore(top, stillShown, apply, schedule)` in
`buffer-states.ts`; `EditorPanel` passes `requestAnimationFrame`, the
Node test a manual scheduler and checks both branches.

### AI. Replace confirm with a preview (small, if time)
The confirm body becomes a node: the counts plus the first inputs of the
transcript (first line each, at most three) so the decision is informed.

## Out of scope
Persisting editor states across reloads; rebuilt WECL.

## Acceptance
- Re-running a linked cell runs the buffer, not the stale input.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
