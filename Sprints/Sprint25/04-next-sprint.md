# Sprint 26 — Proposed plan

## Candidates

### BE. `.lisp` transcript import (small)
Parse `;;; ---- cell …` sections (values from `;;=>` comments, the run
label) into cells so both transcript formats round-trip. Carried from
the Sprint 24 proposal.

### BG. Smoke report in the PR (small)
Post a one-line summary of `smoke-report.json` (passed / failed /
skipped, slowest scenario) as a job summary (`$GITHUB_STEP_SUMMARY`).
Carried.

### BB. Session-box search across cells (small)
Extend Ctrl+R's list to cell inputs evaluated from buffers, with their
cell numbers. Carried.

### BH. SBCL fetch progress + timing (small)
The ~19 MB gzip fetch has no feedback and no measured cold-boot time;
add a progress line to the boot log and record the number.

### BI. Port-side Ctrl-C delivery (upstream, small-medium)
The wasm port acknowledges the interrupt request but does not deliver
it to Lisp (`wasm-arch.c`). When a future sbcl wasm-dev build grows
`sb-sys:interactive-interrupt` delivery, drop the respawn in
`runtime.interrupt()` and re-enable the strict job-110 assertion.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 26 scope
BE + BG, with BB and BH if time allows.
