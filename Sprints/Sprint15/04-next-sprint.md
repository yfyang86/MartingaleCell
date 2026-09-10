# Sprint 16 — Proposed plan

## Candidates

### AD. Session cell → buffer round trip (small)
"Paste into editor" copies a cell's input; an "open as buffer" that
creates a buffer named after the cell and evaluates with the buffer's
path would make session-box definitions first-class in the outline.

### AE. Per-buffer selection & folds survive reload (small-medium)
Editor states are per buffer now but live only in memory; persisting
the selection and scroll offset per buffer id alongside the buffers in
IndexedDB would restore the exact view after a reload.

### AF. Transcript import into a chosen position (small)
Imported cells are appended; importing "after the current cell" or
"replacing the session" are the two other things people want.

### AG. Harness for the editor swap rules (medium)
The stash/restore rules are covered by the browser smoke only; a
jsdom-free unit test would need CodeMirror's state package alone —
`EditorState` works without a DOM, so the stash logic could move into a
pure helper and be tested in Node.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 16 scope
AG + AD, with AF if time allows. Same loop.
