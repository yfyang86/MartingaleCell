# Sprint 17 — Implementation notes

## AH. Cell ↔ buffer link

`BufferOrigin` gained `{ type: 'cell', cellId, n }` and `Cell` a
`bufferId`. "Open as buffer" (`openCellAsBuffer(cell)`) creates
`cell-N.lisp` with that origin and writes the buffer id back onto the
cell; when the cell already has a linked buffer that still exists, it
is activated instead of creating a second one. Both sides show the
link: the cell header carries a `↗ cell-N.lisp` chip (a button that
activates the buffer, rendered only while the buffer exists) and the
tab a `[N]` badge with a tooltip.

`rerunCell(cell)` replaces the three direct `evaluateCode(cell.input,
…)` calls in the cell (header re-run, error-block re-run, footer
re-run): with a live linked buffer it evaluates the buffer's *current*
text as an evaluation from that buffer (`{ bufferId, from: 0 }`), so
definitions index to the buffer; otherwise the recorded input as
before. Buffers persist with their origin and cells with `bufferId`, so
the link survives a reload; a link whose buffer was closed simply
falls back to the input.

The search module's `mergeSources` typed buffer origins as scratch or
project; it now accepts any origin with an optional path, treating
non-project origins (scratch, cell) as buffers by name.

## AJ. Scroll-restore guard in the helper

`scheduleScrollRestore(top, stillShown, apply, schedule)` in
`buffer-states.ts` defers the restore through `schedule`
(`requestAnimationFrame` in `EditorPanel`) and applies it only if
`stillShown()` holds on the frame. The Node test passes a manual
scheduler and covers: deferred, applied when still shown, skipped when
another buffer took over in between.

## AI. Replace confirm with a preview

The confirm registry's `body` returns a `ReactNode`. The
`import-replace` body shows the counts and the first lines of up to
three non-empty inputs of the pending transcript
(`pendingImportPreview`), plus "… N more".

## Tests

- `editor-state-test.mjs` (+3, 12): the scroll-restore guard.
- `browser-smoke.mjs` (+1, 32): open cell 1 as a buffer, edit it to
  `(+ 1 2)`, re-run the cell — the new cell shows `(+ 1 2)` and `3`, the
  active tab is badged `[1]`.
