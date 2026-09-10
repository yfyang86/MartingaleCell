# Sprint 23 — Proposed plan

## Candidates

### BB. Session-box search across cells (small)
Ctrl+R searches only submitted forms; extending the list to cell inputs
evaluated from buffers (with their cell number) would make the box a
way to re-run anything in the session.

### BD. Value diff between runs (small-medium)
Values are marked when they differ; for long values (a list of records,
a string with newlines) a line diff of the two printed values, as the
input diff does, would show what changed.

### BE. Transcript import of `.lisp` runs (small)
The `.lisp` transcript carries the run label in its cell comment but is
opened as a buffer, not imported as cells. Parsing `;;; ---- cell …`
sections into cells (values from `;;=>` comments) would make the two
formats round-trip alike.

### BF. Smoke scenario timing report (small)
The smoke prints per-scenario seconds to stderr; a `--json` report
(checks, timings, failures with screenshot paths) uploaded as a CI
artifact would make a red `smoke` job readable without the log.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 23 scope
BD + BE, with BF if time allows. Same loop.
