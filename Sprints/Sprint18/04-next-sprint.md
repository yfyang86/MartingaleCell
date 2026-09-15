# Sprint 19 — Proposed plan

## Candidates

### AO. Persist only what changed (small)
`statesToJSON` serialises every stash on every switch; tracking which
buffers changed since the last save and merging into the stored record
would keep large workspaces snappy.

### AP. Cell history (medium)
A linked buffer re-run makes a new cell; the old cell stays. A "runs of
this buffer" view (cells sharing `bufferName`) with the values side by
side would show how a definition's result changed over time.

### AQ. Smoke: split into scenarios (small-medium)
`browser-smoke.mjs` is one 33-check sequence with order dependencies
(noted twice now). Splitting it into named scenarios that each boot the
IDE, run under one Playwright context, and can be selected by name
(`--only search`) would make failures easier to read and fix.

### AR. Docs page for the editor (small)
Buffers, tabs, per-buffer undo, persistence, links to cells — none of
it is on the docs site beyond one card. A short "Editor" section.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 19 scope
AQ + AR, with AO if time allows. Same loop.
