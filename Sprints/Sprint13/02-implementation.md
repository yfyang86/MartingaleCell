# Sprint 13 — Implementation notes

## K. Replace in workspace

**Pure (`src/search/workspace-search.ts`).** `replaceInText(content, re,
replacement, opts)` walks the same matches `searchText` reports — the
compiled query already encodes case, whole-symbol and regex; `symbolsOnly`
skips matches that start in a string or comment via `classifyChars` — and
splices the replacement in. In regex mode each match is passed through
`String.replace` against an anchored single-match copy of the pattern, so
`$1`, `$&` and friends expand per match; in literal mode the text goes in
verbatim, a `$` staying a `$`. Zero-width matches advance and are not
replaced. Returns the new text and the count. `replaceInSources` applies
it to every source and returns only those that changed, plus the total,
or the regex error.

**Panel (`SearchPanel.tsx`).** A Replace toggle in the options row reveals
the replacement box, a per-file replace button in each file header, and
"Replace all". Every hit shows a preview once the box is open: the old
text struck through, the new text beside it (the same expansion rule as
the pure function). Replace-all is two clicks: the first turns the
button into "confirm?" for four seconds, the second applies.

**Applying.** Per changed source, in this order:

- the buffer in the editor: one `view.dispatch` replacing the whole
  document (`userEvent: 'input.replace'`), so the editor's history holds
  it as a single step and Ctrl+Z undoes the whole replacement; the
  existing update listener writes the new text to the store;
- other open buffers: `updateBufferContent` (marks them dirty);
- project files that are not open: `openFile` first, then
  `updateBufferContent` on the new buffer — they end up as dirty buffers
  and nothing reaches disk until the user saves them.

The search re-runs afterwards (a run tick in the debounce effect's deps)
and the project file cache is dropped, so the hit list reflects the new
text. A log line and a toast report the count, the file count and how
many files were opened.

## S. Multi-line values

`eval-one` binds `*print-pretty*` to nil around the `;;=>` print. The
image wraps a 60-element list over ten lines under the pretty printer
(verified on this branch before the change), and the page took only the
first as the value, the rest leaking into the output block. User output
is unaffected: `(format t "~S" …)` still wraps.

## Tests

- `search-test.mjs` (+9, 23): literal, whole-symbol, code-only,
  regex with `$1`, a literal `$`, no match, case-sensitive,
  `replaceInSources` totals and buffer ids, invalid regex.
- `debugger-test.mjs` (+2, 55): a 60-element list is one `;;=>` line
  with no stray output lines; `format ~S` still wraps.
- `browser-smoke.mjs` (+2, 25): replace `sq` → `sq2` across the two open
  buffers (three hits of `sq2` afterwards), Ctrl+Z restores the active
  buffer.
