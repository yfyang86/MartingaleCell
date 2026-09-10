# Sprint 16 — Implementation notes

## AG. Editor stash rules in Node

`src/editor/buffer-states.ts` holds the per-buffer state logic that
`EditorPanel` grew over Sprints 14 and 15, with no DOM in sight:

- `stash(id, state, scrollTop)` remembers the outgoing buffer;
- `prune(liveIds)` drops states of closed buffers;
- `resolve(id, content, makeFresh)` returns the state to show and how it
  was obtained: *restored* (the stashed state itself, its document
  equals the store), *updated* (the store content applied to the stashed
  state as one `input.replace` transaction — an undo step of that
  buffer), or *fresh* (no stash: `makeFresh(content)`), plus the stashed
  scroll offset or null.

`EditorPanel` now stashes, prunes, resolves and calls `view.setState`
with the result; the scroll restore on the next frame is unchanged.

`scripts/editor-state-test.mjs` bundles the helper with
`@codemirror/state` and `@codemirror/commands` — both work without a
DOM; `undo`/`redo` accept a `{state, dispatch}` target — and drives the
rules directly: two user edits stashed and restored keep two undo
steps and undo the last edit rather than any "switch"; a store edit
while away yields an *updated* state with one more undo step that undoes
the store edit first and the earlier edit second; redo walks back; an
unknown buffer gets a fresh state with no history; prune keeps live
buffers only; a null id yields an empty fresh state. One fixture detail
worth knowing: CodeMirror groups adjacent typing within 500 ms into one
undo event, which in Node is every edit, so the fixture's history uses
`newGroupDelay: 0`.

## AD. Open a session cell as a buffer

A cell header button ("Open as buffer", eval cells only) calls
`openCellAsBuffer(n, input)`: a buffer named `cell-N.lisp` with the input
(newline-terminated) is created and activated; if a buffer of that name
with that content already exists it is activated instead. Definitions
evaluated from it are then indexed with buffer positions like any other
buffer's.

## AF. Import replacing the session

`importTranscriptText(name, text, mode)` gained `mode: 'append' |
'replace'`. With `replace` and a non-empty session, the parsed cells are
parked in a module variable and the confirm modal opens with a new kind,
`import-replace`, whose body names both counts ("8 current cells will be
cleared, then 8 imported cells appended"); confirming runs
`applyPendingImport`, which clears the session and appends. An empty
session imports directly. The palette has the second command "Import
transcript replacing the session"; the append path is unchanged and the
cell-appending code is shared.

## Tests

- `editor-state-test.mjs` (9, new; in `pnpm test` and CI).
- `browser-smoke.mjs` (+2, 31): "Open as buffer" on the first cell adds
  a tab whose document is `(/ 1 0)`; the replacing import shows the
  confirm modal and leaves exactly the transcript's cells, all marked
  imported.
