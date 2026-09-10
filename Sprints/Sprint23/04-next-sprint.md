# Sprint 24 — Proposed plan

## Candidates

### AV. SBCL hardening (medium)
The Sprint 23 (SBCL) gaps: exercise the ;;DEBUG:/;;DEBUG-WAIT pause and
chooseRestart against the real image, the interrupt bit (Ctrl-C on a
running `(sleep 100)`), `with-timeout` via set_timer, modules
snapshot/restore round trip, and an interrupt-respawn path. Plus:
reconnect to a crashed image (the crash message currently ends the
session) and the runaway-recursion check (storage-condition, not
RangeError — worker stackSizeMb 256).

### AW. SBCL in the browser smoke (small-medium)
`browser-smoke.mjs` gains a scenario that flips the engine setting to
sbcl (artifacts fetched to public/sbcl by the runner) and runs a couple
of cells. Needs Chrome ≥ 137 for exnref.

### AX. Artifact diet (small)
Serve sbcl.core/sbcl-core.wasm gzip'd (~112 MB → ~35 MB expected) with
DecompressionStream in the worker; consider a "booting… N MB" progress
line from the fetch.

### AY–A1. Carried over
AQ (smoke scenarios), AR (editor docs), AO (persist only what changed)
from Sprints 18/19 suggestions.

## Suggested Sprint 24 scope
AV + AW, AX if time allows.

## On landing: carried candidates from Sprint 22

The Sprint 22 proposal (`Sprints/Sprint22/04-next-sprint.md`) still
stands: value diff between runs (BD), `.lisp` transcript import (BE),
a smoke timing report (BF), session-box search across cells (BB). With
the SBCL artifacts finished, the first Sprint 24 item is running the
SBCL harness for real and the browser smoke with the engine set to
`sbcl`.
