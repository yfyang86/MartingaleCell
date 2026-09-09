# Sprint 9 — Proposed plan

## Candidates

### E. Workspace-level search (medium)
Search across project files (and open buffers) from the explorer or the
palette: a query box, results grouped by file with the matching line, and
a click that opens the file at the line — `gotoLocation` already does the
last step. Regex and case toggles; the CL tokenizer could offer
"symbols only" to skip strings and comments.

### F. Import a transcript back (small)
The `.lisp` transcript loads as a buffer already; a Markdown transcript
could be re-imported as cells (code fences → inputs, `;;=>` fences →
values) so a session shared as a file round-trips.

### G. Navbar/footer without framer-motion (small)
The entry chunk is 403 kB; framer-motion (about 110 kB) is there only for
the navbar's menu and the footer's reveal. CSS transitions would do, and
the marketing pages that use `motion` keep it in their own chunks.

### H. Definition index for open buffers (small)
`;;DEF:` covers project loads; a form evaluated from a scratch buffer is
found by scanning open buffers only. Emitting `;;DEF:` from `eval-string`
too would make go-to-definition uniform and give the completion detail a
location for scratch definitions.

### I. Rebuilt WECL (separate environment)
Unchanged from the Sprint 7 note: `-sSUPPORT_LONGJMP=wasm`, JSPI, `-O2`,
assertions off. Expected: the remaining ~50× to native shrinks by an
order of magnitude and a cooperative interrupt becomes possible.

## Suggested Sprint 9 scope
E + H, with G if time allows. Same loop.
