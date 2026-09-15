# Sprint 16 — Goal and plan

Date: 2026-09-10 · Branch: `sprint16` → PR into `dev` · Follows `Sprints/Sprint15/04-next-sprint.md`

## Goal

Pin the editor's per-buffer state rules down in CI without a browser,
let a session cell become a buffer in one click, and let a transcript
replace the session instead of only appending to it.

## Scope (from the Sprint 15 proposal: AG + AD, AF if time)

### AG. Editor stash rules in Node (medium)
Move the stash/restore logic out of `EditorPanel` into
`src/editor/buffer-states.ts` (`BufferStates`: `stash`, `prune`,
`resolve`) that depends on `@codemirror/state` only. `resolve` returns
the state to show and how it was obtained — *restored* (document equals
the store), *updated* (store edit applied as one transaction),
*fresh* — plus the stashed scroll offset. `scripts/editor-state-test.mjs`
bundles it with esbuild together with `@codemirror/state` and
`@codemirror/commands` (both DOM-free) and checks: restore keeps undo
history; an updated state undoes the store edit and then the earlier
edit; a fresh state for an unknown buffer; prune drops closed buffers;
scroll offsets round-trip. In `pnpm test` and CI.

### AD. Open a session cell as a buffer (small)
A cell header button opens the cell's input as a new buffer named after
the cell (`cell-7.lisp`) and activates it; definitions evaluated from
there are then indexed with a buffer position like any other. Smoke:
the button adds a tab whose document equals the cell input.

### AF. Import a transcript replacing the session (small, if time)
A second palette command imports a Markdown transcript after clearing
the session, behind the existing confirm modal (a new confirm kind that
carries the parsed cells), so a destructive import is never one click.

## Out of scope
Rebuilt WECL; inserting imported cells at an arbitrary position.

## Acceptance
- The stash rules have a Node test that fails if a switch ever produces
  an undo step or drops history.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
