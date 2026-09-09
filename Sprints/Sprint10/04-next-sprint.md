# Sprint 11 — Proposed plan

## Candidates

### K. Replace in workspace (medium)
The panel has every match; a replace box that rewrites open buffers
through the editor (one undoable transaction per buffer) and project
files through the project store, with a per-file preview and confirm.

### M. Symbol outline (small)
The definition index (loader, buffers, session) already knows every
definition and where it is; an outline panel per buffer / per project,
with the same jump plumbing, is mostly UI. The completion registry could
feed it as is.

### N. Cell-level diff on re-run (small)
When an imported or earlier cell is re-run, show what changed between
the recorded values/output and the new ones — the transcript import
made "recorded" cells a first-class thing.

### O. Persist the definition index (small)
Buffer and session definitions vanish on reload while buffers and cells
survive in IndexedDB; store them alongside, keyed by buffer id / cell
number, and drop entries whose buffer or cell is gone.

### I. Rebuilt WECL (separate environment)
Unchanged: `-sSUPPORT_LONGJMP=wasm`, JSPI, `-O2`, assertions off.

## Suggested Sprint 11 scope
M + O, with K if time allows. Same loop.
