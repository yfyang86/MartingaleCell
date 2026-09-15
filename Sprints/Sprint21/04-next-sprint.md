# Sprint 22 — Proposed plan

## Candidates

### AX. Fold by kind (small)
`foldAll` folds every multi-line form. A "fold all top-level forms"
command (keeping bodies open) and folding of `#| |#` block comments.

### AZ. Run history in the transcript (small)
The Markdown export could group a cell's runs (`run k/N` in the
heading) so an exported notebook keeps the comparison; the importer
would restore the lineage.

### BA. Diff two runs' inputs (small-medium)
The history view marks a changed input; a line diff between the two
inputs (the search module's line classifier can split the text) would
show what changed.

### BB. Session-box search across cells (small)
Ctrl+R searches only submitted forms; extending the list to cell inputs
evaluated from buffers (with their cell number) would make the box a
way to re-run anything in the session.

### BC. CI on `dev`: keep the merge-commit run (small)
The record-CI docs push cancels the in-progress run on the merge
commit (concurrency group per ref). Either drop cancel-in-progress for
pushes to `dev` or ignore `Sprints/**` for the push trigger, so the
merge commit keeps a completed run.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 22 scope
AZ + BA + BC, with AX if time allows. Same loop.
