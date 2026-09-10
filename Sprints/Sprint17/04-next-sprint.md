# Sprint 18 — Proposed plan

## Candidates

### AK. Persist editor states across reloads (medium)
`EditorState.toJSON` / `fromJSON` with the history field serialise; the
per-buffer stash could be saved alongside buffers so undo history,
selection and scroll survive a reload. `BufferStates` is the natural
home (`toJSON` / `fromJSON` with the extensions list).

### AL. Transcript: linked cells (small)
A cell re-run from its linked buffer records `bufferName = cell-N.lisp`;
the transcript could say "from buffer cell-1.lisp" so a reader knows
the input was the buffer's text at that moment.

### AM. Cell chip → outline (small)
The `↗ cell-N.lisp` chip activates the buffer; the outline panel could
list "cells with buffers" as a section, one row per link, jumping the
same way.

### AN. Smoke: build guard (small)
`browser-smoke.mjs` runs against whatever is in `dist/`; a stale build
gave one misleading failure this sprint. The script could compare
`dist/index.html`'s mtime with the newest file under `src/` and refuse
to run (or warn) when the build is older than the sources.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 18 scope
AN + AK, with AL if time allows. Same loop.
