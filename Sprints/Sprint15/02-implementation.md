# Sprint 15 — Implementation notes

## Z. Store edits into stashed states

Sprint 14 stashed one `EditorState` per buffer but discarded the stash
when the buffer's document no longer matched the store — which is
exactly what a replace through the store, or a transcript loaded into a
buffer that is not shown, does. Now the difference is applied *to the
stashed state* with `state.update({ changes: whole document, userEvent:
'input.replace' }).state` and that state is shown: the edit made while
the buffer was away is one undo step of that buffer, and everything
before it is still undoable. `view.setState` still dispatches nothing,
so the switch itself stays out of the history.

The smoke's Sprint 14 check flipped accordingly: Ctrl+Z in the other
buffer now reverts the replacement that reached it through the store
(and still never shows another buffer's text); Ctrl+Y re-applies it.

## AA. Per-buffer scroll position

The stash holds `{ state, scrollTop }` (`scrollDOM.scrollTop` at the
moment of switching away). After `setState` the scroll is restored on
the next animation frame, guarded so a switch that happened in between
does not scroll the wrong buffer. Verified in the smoke with a 300-line
buffer scrolled to 2 000 px, switched away and back through the tab bar
(a search hit would set its own scroll, so tabs are the honest route;
they got a `data-testid` for it).

## AB. Transcript export: value limit

`TranscriptMeta.valueLimit` and `clipValue(value, limit)`: a value longer
than the limit is cut there with `… [N chars]`; short values and a limit
of 0 are untouched. Both builders clip only the `;;=>` values — inputs,
output and warnings are never clipped. The IDE setting
`transcriptValueLimit` (slider, 0 = whole, up to 2 000 characters, off
by default) feeds `exportSession`.

## Also fixed

- **Smoke helper.** `setCode` verified the buffer by reading the DOM,
  which for a long document only holds the viewport's lines (CodeMirror
  virtualises); it now compares against the document model.

## Tests

- `transcript-test.mjs` (+4, 35): `clipValue`, Markdown and `.lisp`
  exports with a limit, no limit.
- `browser-smoke.mjs` (29): the Sprint 14 undo check rewritten for the
  new behaviour, Ctrl+Y re-apply, scroll restore through the tab bar.
