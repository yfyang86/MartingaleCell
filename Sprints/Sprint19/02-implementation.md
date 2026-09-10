# Sprint 19 — Implementation notes

## AQ. Smoke scenarios

`scripts/browser-smoke.mjs` is now a runner over named scenarios:

| Scenario | Boots the IDE | Checks | What it covers |
|---|---|---|---|
| `debugger` | yes | 6 | pause on error, RETRY/ABORT rows, ABORT by key, USE-VALUE value form, resumed value |
| `stdin` | yes | 2 | `(read-line)` prompt, typed line completes the read |
| `definitions` | yes | 9 | F12 text scan, outline list and jump, evaluate-all + cross-buffer F12, search hits and jump, Shift+F12 references, session-box definition flashes its cell, package pill |
| `transcript` | yes | 6 | export file name and content, append import, open-as-buffer, linked re-run, replacing import through the confirm |
| `persistence` | yes | 2 | after `page.reload()`: Ctrl+Z/Ctrl+Y on the persisted editor state; F12 through the persisted index with the refreshed position |
| `replace` | yes | 6 | replace all across buffers, undo in the editor, undo/redo in the other buffer, redo after switching back, scroll per buffer |
| `landing` | no | 1 | landing page after code-splitting, lenis chunk on demand |

Each scenario runs in its own browser context — a fresh IndexedDB, so
persisted buffers, definitions and editor states from another scenario
cannot leak in — boots the IDE (except `landing`), sets up its own
state, and ends with a "no uncaught page errors" check of its own. The
runner prints the wall time per scenario to stderr; `--only a,b`
selects scenarios, `--list` prints the names, `--allow-stale` skips the
Sprint 18 build guard. Every check of the previous 33-check sequence is
carried over — 32 checks plus the old single page-error check, now one per scenario — (the transcript scenario builds its cells itself: an
aborted division and a list value, so the export checks read "resumed
via ABORT" instead of "USE-VALUE").

The per-page tools are shared: `setCode` (through CodeMirror's view,
verified against the document model), `waitDoc({ startsWith | includes,
caretAt? })`, `setCaret(offset | { after, plus })`, `jumpViaSearch(query,
expectDoc)`, `paletteCommand(name)`, `tab(i)`, `cells()`, `shot(name)`.
A full run takes about three minutes headless (seven boots of the
image); one scenario about fifteen seconds.

## AR. Editor section in the docs

`src/components/docs/Editor.tsx` — "An editor that keeps its place" —
with six cards: buffers and tabs, undo that stays put, survives a
reload, cells as buffers, search and replace, outline. Placed after the
session section; sidebar entry "Editor & buffers".

## AO. Persist only what changed

`statesToJSON` takes an optional `SerializeCache` (a `Map` keyed by buffer
id): a stash whose `EditorState` is the same object as at the last save
reuses its JSON instead of calling `toJSON` again; entries for buffers
that are gone are evicted. `EditorPanel` keeps one cache for the page.
Three Node checks: reuse on identity, re-serialise on change (and the
new JSON restores the new document), eviction.

## Tests

- `editor-state-test.mjs` (+3, 21).
- `browser-smoke.mjs`: 39 checks across seven scenarios (32 carried
  over plus one page-error check per scenario).
