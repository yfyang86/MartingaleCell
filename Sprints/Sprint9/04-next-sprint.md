# Sprint 10 — Proposed plan

## Candidates

### F. Import a transcript back (small)
The `.lisp` transcript already loads as a buffer. A Markdown transcript
could be re-imported as cells (code fences → inputs, `;;=>` fences →
values, error blocks → error cells), so a session shared as a file
round-trips.

### J. Find references (small)
The search matcher with `wholeWord` + `symbolsOnly` is already "find
references" for a symbol; a Shift+F12 / context-menu entry that runs it
for the symbol at point and opens the panel would finish the pair with
go-to-definition.

### K. Replace in workspace (medium)
The panel has the matches; a replace box that rewrites open buffers
through the editor (so undo works) and project files through the project
store, with a per-file confirmation, is the natural next step.

### L. Definition index for the session box (small)
Forms typed into the session's input box get no `;;DEF:` because they
have no buffer. Giving the session box a virtual "session" path would
let go-to-definition open the cell (scroll + flash) instead of failing.

### I. Rebuilt WECL (separate environment)
Unchanged: `-sSUPPORT_LONGJMP=wasm`, JSPI, `-O2`, assertions off.

## Suggested Sprint 10 scope
J + F, with L if time allows. Same loop.
