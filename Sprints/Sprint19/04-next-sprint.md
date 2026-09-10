# Sprint 20 — Proposed plan

## Candidates

### AS. Smoke in CI behind a label (small-medium)
The scenarios boot in ~15 s each and Playwright + Chromium install in
about a minute on a GitHub runner. A second workflow job, run on PRs
labelled `smoke`, would put the browser checks under CI without adding
three minutes to every push.

### AT. Cell history view (medium)
Carried from Sprint 18: cells sharing a `bufferName` (re-runs of a
linked buffer) shown side by side, values compared.

### AU. Session-box history persists (small)
The session input's ↑/↓ history lives in a ref and is lost on reload;
keep it with the workspace.

### AV. Editor: fold ranges per buffer (small)
Folds are part of the editor state already stashed and persisted (the
fold field serialises); exposing fold commands (Ctrl+Shift+[ / ]) and
the gutter would make that visible.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 20 scope
AS + AU, with AV if time allows. Same loop.
