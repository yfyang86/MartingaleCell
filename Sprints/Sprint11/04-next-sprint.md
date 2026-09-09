# Sprint 12 — Proposed plan

## Candidates

### K. Replace in workspace (medium)
Carried over. The search panel has every match; a replace box that
rewrites open buffers through the editor (one undoable transaction per
buffer) and project files through the project store, with a per-file
preview and confirm.

### P. Values that contain spaces (small)
`;;=> #<"SMOKE" package>` arrives as two values because the runtime splits
the values line on whitespace. Print each value on its own `;;=>` line
in the worker (`~{;;=> ~S~%~}`) and stop splitting main-side; adjust the
harnesses that count values.

### Q. Outline for project files without a load (small)
The outline's project section only knows files the loader has loaded.
Scanning the project's Lisp files with `scanDefinitions` (the search
panel already reads them) would outline a freshly opened project too,
with loaded definitions ticked.

### R. Definition freshness (small)
An index entry records where a name was evaluated; after edits it may
point at the wrong line. Re-scan the buffer on jump and, when the name is
found at a different position, prefer the scanned one and update the
entry.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 12 scope
P + R + Q, with K if time allows. Same loop.
