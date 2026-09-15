# Sprint 9 — Implementation notes

## H. Definitions from evaluated forms

**Worker (`public/wecl-worker.js`).** `eval-string` takes a `:path`
keyword. When it is set, the read loop calls `%skip-blank` (the Sprint 8
probe that skips whitespace, `;` and `#|…|#` comments) and records
`file-position` before each `read` — string input streams support it in
ECL — and, when `eval-one` returns true, calls `%say-def path pos form`,
the same printer the loader uses. `eval-one` now returns `t` on success
and `nil` after printing `;;ERROR:`, so a `(defparameter *x* (error …))`
never produces a definition. Without a path nothing changes: REPL input
from the session box prints no `;;DEF:`. `runEval` passes the page's
`path` through, escaped like the code.

**Runtime (`src/lisp/runtime.ts`, `types.ts`).** `EvalOptions.path`,
`WorkerInMessage.eval.path`, a `DefinitionEvent` type and
`EvalCallbacks.onDefinition`. The stream handler consumes `;;DEF:` on eval
jobs (the loader path already did) through a shared `parseDefMarker`.

**Page.** `evaluateCode(code, bufferName, origin)` gets an `EvalOrigin`
(`bufferId`, `from` = character offset of the code in the buffer).
Ctrl+Enter passes the top-level form's start, region evaluation the
selection start, evaluate-all the start of each form (found with
`indexOf` from a moving cursor, so repeated forms map correctly). The
worker's offset is a byte offset into the trimmed code; `byteToCharOffset`
converts it, `code.indexOf(trimmed)` restores leading whitespace, and
`charOffsetToLineCol` positions it in the buffer's current content.

The project store keeps `bufferDefinitions` (most recent first; a name
evaluated again replaces its earlier entry wherever it was), not
persisted. `definitionsForCompletion()` returns project-load definitions
followed by buffer definitions, so the completion registry — a Map keyed
by name — lets the evaluated location win; `project/load.ts` registers
through the same function, so a project load no longer forgets buffer
definitions. `gotoDefinition` checks buffer definitions first (only for
buffers still open), then the project index, then the text scan. The new
`gotoBuffer(bufferId, line, col)` activates the buffer and places the
caret.

`;;DEF:` joined the output-marker filter in `evaluate.ts`, so it never
shows in a cell.

## E. Workspace search

**Matcher (`src/search/workspace-search.ts`, pure).** `compileQuery`
builds one global RegExp: literal text is escaped unless `regex`; `wholeWord`
wraps it in look-arounds that treat the CL symbol characters
`\w - * + / < > = ! ? % & $ .` as word characters, so `plot` does not match
`plot-many`, `*plot-count*` or `plot.lisp`; `caseSensitive` drops the `i`
flag. `classifyChars` labels every character as code, string, line
comment or block comment (nested `#|…|#`, `#\"` character literals do not
open strings); `symbolsOnly` discards matches that start in a non-code
region. `searchText` walks the matches with a binary search over line
starts and returns 1-based line/col, the line text and the match range
within it; zero-width matches advance `lastIndex` so `x*` cannot loop.
`searchSources` groups per source in source order and stops at a cap
(500), reporting `truncated`. `mergeSources` merges open buffers and
project files: a project file open in a buffer is searched in the buffer
(unsaved edits included), other files from disk / the virtual project,
scratch buffers by name.

**Panel (`src/components/ide/SearchPanel.tsx`).** Sits at the top of the
explorer column (up to 55 % of its height). Query box, four toggles
(match case, whole symbol, regex, code only — persisted in
`localStorage`), a summary ("12 in 3 files", "no matches", or the regex
error), results grouped by file with sticky headers and a highlighted
`<mark>` per hit. Search runs 150 ms after the last keystroke; project
files come from `collectLispFiles()` (virtual projects re-read whenever
their file map changes, FS-Access projects at most every 5 s). Enter
jumps to the first hit, Esc closes, a click calls `gotoBuffer` or
`gotoLocation`. All state changes happen from the timer callback, which
keeps `react-hooks/set-state-in-effect` quiet.

**Entry points.** `useUi.openSearch()` opens the explorer and the panel
and bumps a focus tick the input listens to. Bound in the app-wide key
handler (Ctrl/⌘+Shift+F), in the editor's own keymap (`Mod-Shift-f`, so
the editor owns the shortcut when it has focus; see the test log for the
Caps Lock caveat), on a header button in the explorer, and in the
command palette.

## G. Navbar and footer without framer-motion

`Navbar.tsx`: the slide-in is a CSS keyframe (`cc-nav-in`), the mobile
drawer mounts with `cc-drawer-in` and its rows with a staggered
`cc-rise` (`animationDelay`); the drawer simply unmounts on close.
`Footer.tsx`: a 12-line `useRevealOnView` (IntersectionObserver, once)
switches the columns from `opacity-0 translate-y-6` to visible with a
`transitionDelay` per column. Both honour `prefers-reduced-motion`.

| Chunk | Sprint 8 | Now |
|---|---|---|
| entry `index-*.js` | 402.6 kB (129.8 gzip) | 275.5 kB (88.0 gzip) |
| framer-motion (`proxy-*.js`) | in entry | 122.8 kB, loaded by the pages that animate |
| `Ide-*.js` | 734.7 kB | 746 kB (search panel + definitions) |

## Tests

- `scripts/search-test.mjs` (14): plain / case / whole-word / regex /
  symbols-only matching over a fixture with a docstring, a `;` comment,
  a nested block comment and a `#\"` literal; classes; invalid regex;
  the cap; zero-width matches; `mergeSources`.
- `scripts/debugger-test.mjs` section P (5): eval with a path prints
  `;;DEF:` with the form offsets past a block comment, none for an
  erroring definition or for names inside comments/strings, none without
  a path.
- `scripts/browser-smoke.mjs` (+3): evaluate-all in one buffer, F12 on
  `sq` in a second buffer switches back to the defining buffer at its
  form; Ctrl⇧F finds `sq` three times across both buffers; clicking a hit
  puts the caret on it.
