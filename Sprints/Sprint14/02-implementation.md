# Sprint 14 — Implementation notes

## V. Editor state per buffer

`EditorPanel` used one `EditorView` and, on every buffer switch,
dispatched a transaction replacing the whole document. CodeMirror's
history recorded that transaction, so Ctrl+Z after a switch "undid" the
switch and showed the previous buffer's text under the current buffer's
tab.

Now the extension list is built once (`extensionsRef`) and the view keeps
one `EditorState` per buffer:

- on switch, the outgoing buffer's state — document, selection, undo
  history, panel state — is stashed in a `Map` keyed by buffer id;
  states of buffers that no longer exist are dropped;
- the incoming buffer gets its stashed state back when its document
  still equals the store content (nothing changed it while it was away),
  otherwise a fresh `EditorState.create` from the store content with the
  same extensions and compartments, so the live settings reconfiguration
  keeps working;
- `view.setState` dispatches nothing, so a switch is never an undo step;
  the update listener never fires either, so a switch never marks a
  buffer dirty.

Content changes to the buffer that is already shown (a replace applied
through the store, a transcript loaded into it) still go through a
dispatch, as before. The welcome typing animation still owns the
document until it finishes.

## Y. Apply order in CI

The replace apply loop moved out of the panel into
`src/search/apply-replace.ts` as `applyReplacements(files, deps)` with
its effects injected: `dispatchActive` (editor), `updateBuffer`
(store), `openFile`, `findBufferByPath`, `isProjectBuffer`. The order is
the one documented in Sprint 13 — active buffer through the editor,
other open buffers through the store, unopened files opened then
updated — and the outcome counts occurrences, files, files opened,
project buffers left dirty, and how many went through the editor versus
the store. Three checks in `search-test.mjs` drive it with fakes,
including a file that fails to open (not counted) and the no-editor case
(active buffer through the store).

## W. Save all from the replace summary

When the outcome reports project buffers left dirty — open project
buffers that were rewritten, or files opened by the replace — the toast
carries a "Save N files" action that calls the project store's
`saveAllDirty`. Scratch buffers persist on their own and get the plain
toast.

## Tests

- `search-test.mjs` (+3, 26): apply order, outcome counts, no-editor path.
- `browser-smoke.mjs` (+2, 27): after the replace and its undo, switching
  to the other buffer and pressing Ctrl+Z changes nothing; back in the
  first buffer, redo (Ctrl+Y) restores the replacement — its history
  survived the switch.
