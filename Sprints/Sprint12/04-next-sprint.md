# Sprint 13 — Proposed plan

## Candidates

### K. Replace in workspace (medium)
Carried over twice; the search panel has every match and the jump
plumbing. A replace box, per-file preview, one undoable transaction per
open buffer, project files through the project store.

### S. Multi-line values (small)
A value printed by `~S` may wrap over several lines when the pretty
printer is on (a long list with `*print-pretty*`); only the first line is
taken as the value today. Print with `*print-pretty*` bound to nil in
`eval-one`, or continue a value until the next marker.

### T. Outline: jump in unloaded project files opens at the form (small)
`gotoLocation` opens a project file and jumps to line/col; for files the
scan produced the position is exact already. What is missing is the
tick's second meaning — "this file's definitions are current in the
image" — after a partial reload; a per-file "loaded at" stamp from the
loader would give the outline a stale marker.

### U. Session-box definitions in the outline's buffer section (small)
When the session box defines a name that a buffer also defines, the
buffer row is ticked by name; showing which one the image currently has
(the most recent entry) would resolve the ambiguity noted in Sprint 11.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 13 scope
K, with S if time allows. Same loop.
