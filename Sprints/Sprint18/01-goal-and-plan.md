# Sprint 18 — Goal and plan

Date: 2026-09-10 · Branch: `sprint18` → PR into `dev` · Follows `Sprints/Sprint17/04-next-sprint.md`

## Goal

A smoke run can never report on a stale build; the editor's per-buffer
state — undo history, selection, scroll — survives a reload the way
buffers do; a transcript says which buffer a cell ran from.

## Scope (from the Sprint 17 proposal: AN + AK, AL if time)

### AN. Smoke build guard (small)
`browser-smoke.mjs` compares `dist/index.html`'s mtime with the newest
file under `src/`, `public/wecl-worker.js` and `index.html`; when the
build is older it exits 2 with a message naming the newer file, unless
`--allow-stale` is passed.

### AK. Persist editor states across reloads (medium)
`BufferStates.toJSON(fields, live?)` / `fromJSON(json, extensions,
fields, liveIds)` serialise every stashed state (and the shown one) with
`EditorState.toJSON` / `fromJSON` and the history field, plus scroll
offsets; entries whose buffer no longer exists are dropped on load.
`EditorPanel` saves to IndexedDB (debounced, on switches and edits) and,
after mounting, restores: the active buffer's stash replaces the fresh
state when the stored document still matches the store (the *updated*
rule applies otherwise), never during the welcome animation. Node test:
round trip keeps undo depth and scroll; dead ids dropped. Smoke: after
the reload, Ctrl+Z in the first buffer reverts the edit made before the
reload; Ctrl+Y restores it.

### AL. Transcript: the buffer a cell ran from (small, if time)
Cell headings gain `· from <buffer>` when the cell was evaluated from a
buffer; the importer ignores the extra part. Tests for both builders and
the round trip.

## Out of scope
Rebuilt WECL.

## Acceptance
- `pnpm smoke:browser` against a build older than the sources refuses
  to run.
- Undo after a reload undoes the last edit made before it.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
