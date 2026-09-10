# Sprint 21 — Proposed plan

## Candidates

### AT. Cell history view (medium)
Carried from Sprint 18: cells sharing a `bufferName` (re-runs of a
linked buffer) shown side by side, values compared.

### AW. Smoke job on `dev` pushes (small)
The `smoke` job runs only on labelled PRs. Running it on pushes to
`dev` as well (still not a merge gate) would catch a browser regression
that slipped through an unlabelled PR, at three minutes per merge.

### AX. Fold by kind (small)
`foldAll` folds every multi-line form. A "fold all defuns" command (top
level only, keeping `let` bodies open) and folding of `#| |#` block
comments would make large buffers scan faster.

### AY. Session-box history search (small)
Ctrl+R in the session box: type to filter the persisted history, Enter
to recall. The rules module already has the list.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 21 scope
AT, with AW and AY if time allows. Same loop.
