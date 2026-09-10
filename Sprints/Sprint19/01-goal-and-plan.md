# Sprint 19 — Goal and plan

Date: 2026-09-10 · Branch: `sprint19` → PR into `dev` · Follows `Sprints/Sprint18/04-next-sprint.md`

## Goal

Make the browser smoke readable and selectable, document the editor on
the docs site, and stop re-serialising unchanged buffers on every save.

## Scope (from the Sprint 18 proposal: AQ + AR, AO if time)

### AQ. Smoke scenarios (small-medium)
`browser-smoke.mjs` becomes a set of named scenarios — `debugger`,
`stdin`, `definitions`, `transcript`, `persistence`, `replace`,
`landing` — each run in its own browser context (fresh IndexedDB), each
booting the IDE and setting up its own state, with a page-error check
per scenario. `--only a,b` runs a subset, `--list` prints the names.
Every check of the current 33-check sequence is carried over; the stale
build guard stays.

### AR. Editor section in the docs (small)
A docs section "Editor & buffers": buffers and tabs, per-buffer undo and
scroll, persistence across reloads, cells opened as linked buffers,
search/replace and the outline pointers. Sidebar entry and page order.

### AO. Persist only what changed (small, if time)
`statesToJSON` takes an optional cache keyed by buffer id; a stash whose
`EditorState` is the same object as at the last save reuses its JSON.
Node checks: reuse on identity, re-serialise on change.

## Out of scope
Rebuilt WECL.

## Acceptance
- `node scripts/browser-smoke.mjs --only replace` runs that scenario alone
  and passes; the full run passes with the same checks as before.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
