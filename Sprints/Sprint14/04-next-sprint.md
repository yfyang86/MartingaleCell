# Sprint 15 — Proposed plan

## Candidates

### Z. Apply store edits into stashed states (small)
When a buffer that is not shown is changed through the store (replace,
transcript load), dispatch the change into its stashed `EditorState`
instead of discarding the state, so its undo history survives too.

### AA. Per-buffer scroll position (small)
The stashed state restores selection but the viewport scroll is the
view's; remember `scrollDOM.scrollTop` per buffer alongside the state.

### AB. Transcript export: long values (small)
Values now arrive whole; a transcript with a 5 000-element list value is
a long line. An export option "truncate values to N characters" with an
ellipsis, off by default.

### AC. Search panel: replace preview for regex with groups (small)
The preview expands `$1` per hit already; a malformed replacement
(unbalanced `$`) is shown as is. Validate and hint.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 15 scope
Z + AA, with AB if time allows. Same loop.
