# Sprint 17 — Proposed plan

## Candidates

### AH. Cell ↔ buffer link (small-medium)
A cell opened as a buffer could remember its cell, and the cell its
buffer: re-running the cell evaluates the buffer's current text, and the
buffer tab shows the cell number. The definition index would then point
at the buffer rather than the cell for names defined there.

### AI. Confirm modal with a preview (small)
The replace-session confirm names counts only; listing the first few
imported inputs would make the decision easier. The modal's `body` is a
string today — a small change to allow a node.

### AJ. Editor-state test for the scroll rule (small)
`resolve` returns the stashed scroll offset; the frame-guarded restore
in `EditorPanel` is browser-only. Moving the guard condition into the
helper (`shouldRestoreScroll(shownId, id)`) would let the Node test cover
it too.

### AK. Persist editor states across reloads (medium)
`EditorState.toJSON` / `fromJSON` with the history field serialise; the
per-buffer stash could be saved alongside buffers so undo history and
selection survive a reload.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 17 scope
AH + AJ, with AI if time allows. Same loop.
