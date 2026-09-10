# Sprint 25 — Proposed plan

## Candidates

### AV. SBCL hardening against the real image (medium; needs the artifacts)
From the Sprint 23 proposal: the ;;DEBUG:/;;DEBUG-WAIT pause and
chooseRestart, the interrupt bit on a running `(sleep 100)`,
`with-timeout` via set_timer, modules snapshot/restore, an
interrupt-respawn path, reconnecting to a crashed image, and the
runaway-recursion check. First: `pnpm fetch:sbcl --gzip && pnpm
test:sbcl` and `browser-smoke.mjs --only sbcl`, then time the `.gz`
boot and add the progress line.

### BE. `.lisp` transcript import (small)
Parse `;;; ---- cell …` sections (values from `;;=>` comments, the run
label) into cells so both transcript formats round-trip.

### BB. Session-box search across cells (small)
Extend Ctrl+R's list to cell inputs evaluated from buffers, with their
cell numbers.

### BG. Smoke report in the PR (small)
Post a one-line summary of `smoke-report.json` (passed / failed /
skipped, slowest scenario) as a job summary (`$GITHUB_STEP_SUMMARY`) so
a red smoke job reads without opening the log.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 25 scope
AV as soon as the artifacts land; otherwise BE + BG, with BB if time.
Same loop.
