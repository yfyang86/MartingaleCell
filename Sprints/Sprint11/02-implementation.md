# Sprint 11 — Implementation notes

## M. Symbol outline

**Scanner (`src/outline/outline.ts`, pure).** `scanDefinitions(src)`
finds every `(def… ` head — `defun`, `defmacro`, `defvar`,
`defparameter`, `defconstant`, `defclass`, `defstruct`, `defgeneric`,
`defmethod`, `deftype`, `define-condition`, `defpackage`, `defsetf`,
`define-symbol-macro` — at any depth, so a `defun` inside a `let` (the
Fibonacci example's memoised version) is listed. It reuses the search
module's `classifyChars`, so heads inside strings, docstrings, `;`
comments and nested `#|…|#` comments are skipped. The name after the head
is read as a symbol, a `(setf x)` head, or the first element of a
`defstruct` / `defclass` option list; `canonicalName` strips package
prefixes and keyword colons and upper-cases, so entries compare equal to
what the image reports in `;;DEF:`. Each entry carries the written label,
kind, 1-based line/col and the character offset of the opening paren.

**Panel (`src/components/ide/OutlinePanel.tsx`).** Lives in the explorer
column like the search panel (toggle button, Ctrl+Shift+O, palette).
Sections, each with a sticky header and a count:

- the active buffer's scanned definitions, ticked when the index says the
  image has evaluated that name from this buffer (or, for a project
  buffer, loaded it from this file); a click calls `jumpToPosition`;
- the project's definitions from the last load, grouped by file, with
  the line; a click calls `gotoLocation`;
- session-box definitions with their cell number; a click dispatches
  `conscell:goto-cell`;
- definitions evaluated from other open buffers, with `name:line`.

A filter box narrows every section; Esc closes the panel.

## O. Persisted definition index

The project store writes `{ definitions, bufferDefinitions }` to
IndexedDB (`conscell-definitions-v1`, 300 ms debounce) whenever
`setDefinitions`, `recordBufferDefinition` or `pruneIndex` runs, and
restores them at the start of `hydrateProject`. Because buffers and cells
hydrate in the workspace store, `Ide.tsx` waits for both stores and then
calls `pruneIndex(liveBufferIds, liveCellNs)` — the same rule as the pure
`pruneDefinitions` the outline test covers — and rebuilds the completion
registry. Go-to-definition already checked that a buffer or cell still
exists, so a stale entry can never jump nowhere; pruning keeps the store
small and the outline honest.

A subtlety worth knowing: an entry records where a name was evaluated,
not where it is now. Edit the buffer without re-evaluating and F12 lands
on the old line — the smoke's reload check relies on exactly that (it
replaces the buffer with `(sq 3)` and F12 still goes to line 1). The
outline's tick answers "has the image seen this", not "is the image
current".

## K. Replace in workspace — not started

Left for the next sprint; nothing was scaffolded.

## Tests

- `scripts/outline-test.mjs` (7): the fixture above (comment, docstring,
  block comment, string, nested `defun`, `(setf px)`, `demo::area`,
  `defstruct` with options, odd whitespace after `(`), positions, labels,
  `canonicalName`, empty input, `pruneDefinitions`. First in `pnpm test`
  after the transcript and search tests; a CI step.
- `browser-smoke.mjs` (+3, 23 total): Ctrl⇧O lists `sq` and `use-it`,
  clicking `use-it` moves the caret to Ln 4, Col 1; after `page.reload()`
  (a full re-boot of the image) F12 on `sq` in a buffer that no longer
  contains its `defun` jumps to the persisted location.
