# Sprint 12 — Implementation notes

## P. One `;;=>` line per value

`eval-one` in the worker printed every value of a form on one line
(`;;=>~{ ~S~}`) and the page split that line on whitespace outside parens
and strings. `#<"SMOKE" package>` — an unreadable object — has a space
inside neither, so it became two values. The worker now prints
`;;=> ~S` once per value (`; no values` unchanged), and `parseEclOutput`
takes each line as one value; the paren-aware `splitValues` is gone.
The JSCL and mock engines never went through that path. The marker table
in the README says one line per value.

Harness expectations that assumed the joined form (`read-line`'s two
values in `stdin-test.mjs`) check two lines now, and section Q of
`debugger-test.mjs` evaluates `(values 1 2)` (two lines, no `;;=> 1 2`)
and `(find-package :cl-user)` (exactly one `;;=>` line matching
`#<… package>`).

## R. Definition freshness

An index entry says where a name was evaluated. Before jumping,
`gotoDefinition` re-scans the entry's buffer with `scanDefinitions`
(Sprint 11's scanner):

- found at a different position → jump there, update the entry
  (`recordBufferDefinition` with the new line/col — it also re-saves the
  index), and say so in the log ("evaluated, was line 1");
- found where recorded → jump as before;
- not found at all → `forgetBufferDefinition(name)` and fall through to
  the project index and the text scan of open buffers, exactly as if it
  had never been evaluated.

The smoke's reload check was rewritten so that the index path and the
text-scan path give *different* answers: the active buffer defines `sq`
on its line 1 (the scan would stop there), while the index says `sq` was
evaluated in buffer 1, where it now sits on line 3. F12 lands in buffer
1 at Ln 3 — persisted index, refreshed position.

## Q. Outline of an unloaded project

`mergeProjectOutline(scannedFiles, loadedDefinitions)` in
`src/outline/outline.ts` scans every Lisp file of the project (sorted by
path, files without definitions dropped) and ticks the entries the
loader reported for that file; loaded definitions in files the scan did
not produce (an `.asd`, say) are listed unticked-free as loaded. The
outline panel reads the project's files with the search panel's cache
rule (virtual projects on every file-map change, FS-Access projects at
most every 5 s) and renders the merged outline; the legend reads
"✓ = evaluated / loaded". With no project open, `pruneIndex` now drops
restored project-load definitions, so the panel never lists files it
cannot open.

## K. Replace in workspace — not started

Carried over again; nothing scaffolded.

## Tests

- `outline-test.mjs` (+2, 9): `mergeProjectOutline` ordering, empty
  files, ticks, and the uncovered-file case.
- `debugger-test.mjs` (+2, 53): per-line values.
- `stdin-test.mjs`: two expectations rewritten for per-line values.
- `browser-smoke.mjs` (23, one rewritten): reload + freshness through the
  index path, distinguishable from the scan fallback.
