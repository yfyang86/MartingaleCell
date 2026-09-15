# Sprint 14 — Proposed plan

## Candidates

### V. Editor document swap that keeps history per buffer (small-medium)
The editor swaps documents by dispatching a whole-document change, so
undo history crosses buffers (Ctrl+Z after switching buffers undoes the
switch). Keep an `EditorState` per buffer and `setState` on switch; the
replace flow and go-to-definition across buffers both benefit.

### W. Save-all from the replace summary (small)
After a replace that opened project files as dirty buffers, offer "save
these N files" in the toast (a single action that calls `saveAllDirty`).

### X. Values with `*print-length*` and long strings (small)
The print-length setting still applies; a very long single-line value
now arrives whole. The cell's 60-char / 20-line truncation handles the
display, but the transcript exporter writes it whole — an export option
to truncate long values would keep transcripts readable.

### Y. Harness for the search panel's apply order (small)
The apply order (active buffer via editor, others via store, unopened
files via openFile) is only covered by the browser smoke. A store-level
test with a fake editor would pin it down in CI.

### I. Rebuilt WECL (separate environment)
Unchanged.

## Suggested Sprint 14 scope
V + W, with Y if time allows. Same loop.
