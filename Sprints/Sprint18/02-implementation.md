# Sprint 18 — Implementation notes

## AN. Smoke build guard

Before launching Chromium, `browser-smoke.mjs` compares the mtime of
`dist/index.html` with the newest file under `src/`, plus
`public/wecl-worker.js` and `index.html`. An older build exits 2 with
both timestamps and the instruction to run `pnpm build`, unless
`--allow-stale` is passed. Verified on this branch by touching a source
file: the script refused; after a rebuild it ran.

## AK. Persisted editor states

`buffer-states.ts` gained `statesToJSON(bs, fields, live?)` and
`statesFromJSON(json, extensions, fields, liveIds)`. Serialisation uses
`EditorState.toJSON` / `fromJSON` with the history field (`{ history:
historyField }`, supplied by the caller so the helper stays state-only),
one entry per stashed buffer plus the shown one, each with its scroll
offset, under a `version: 1` envelope. On load, entries whose buffer no
longer exists are dropped and an entry that fails to deserialise (an
older extension set) is skipped.

`EditorPanel` saves to IndexedDB (`conscell-editor-states-v1`):
immediately on every buffer switch and 500 ms after an edit. After the
view is created it loads the store: other buffers' entries go into the
stash; the shown buffer's entry goes through `resolve` against the store
content — *restored* when the persisted document still matches (the
common case, since both persist from the same edit), *updated* when the
store moved on — and replaces the fresh state, with the scroll restored
on the next frame. Nothing is restored during the welcome animation.

## AL. Transcript: the buffer a cell ran from

Cell headings end with `· from <buffer>` when the cell was evaluated
from a buffer (the `.lisp` banner too). The importer no longer assumes
the duration is the second heading part: it takes the first part that
looks like a duration, so the extra part is ignored and old transcripts
parse as before.

## Tests

- `editor-state-test.mjs` (+6, 18): round trip keeps document, undo
  depth and scroll; undo after the round trip undoes the last edit;
  the live buffer round-trips; dead ids dropped; garbage and older
  versions yield nothing.
- `transcript-test.mjs` (+3, 38): heading and banner with the buffer
  name; import still reads the duration.
- `browser-smoke.mjs` (+1, 33): after `page.reload()` Ctrl+Z undoes the
  edit made before the reload and Ctrl+Y redoes it.
