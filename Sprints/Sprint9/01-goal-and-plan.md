# Sprint 9 — Goal and plan

Date: 2026-09-09 · Branch: `sprint9` → PR into `dev` · Follows `Sprints/Sprint8/04-next-sprint.md`

## Goal

Finding things: search across the workspace with results that jump, and a
definition index that also knows what was evaluated from a buffer, so
go-to-definition and completion locations are the same whether a form
came from a project load or from Ctrl+Enter.

## Scope (from the Sprint 8 proposal: E + H, G if time)

### E. Workspace-level search (medium)
- `src/search/workspace-search.ts`, pure: `searchText(content, query,
  opts)` → matches with line/col/line text; `searchSources(sources,
  query, opts)` groups by path with a total cap. Options: case-sensitive,
  regex, whole word, and **symbols only**, which skips matches inside
  strings, `;` comments and `#|…|#` comments using a small CL scanner.
- Sources: open buffers (their content wins over disk for project files)
  plus the project's Lisp files via `collectLispFiles()`.
- UI: a search panel at the top of the explorer column, toggled by a
  header button, Ctrl+Shift+F and a palette command. Results are grouped
  by file; a click opens the file at the line (`gotoLocation` for project
  files, the buffer + `jumpToPosition` for scratch buffers). Enter in the
  box jumps to the first result.
- `scripts/search-test.mjs` (esbuild bundle, as the transcript test)
  checks the matcher: plain, case, regex, whole word, symbols-only across
  strings and both comment kinds, multi-line grouping and the cap. In
  `pnpm test` and CI.

### H. Definitions from evaluated forms (small)
- Worker: `eval-string` records the form's offset within the code string
  (same `%skip-blank` + `file-position` as the loader) and, when the form
  evaluated without error, prints `;;DEF: <path>|<offset>|NAME|kind` with
  the path the page passed in the eval message (`path` field; absent for
  REPL input, in which case nothing is printed).
- Runtime: eval jobs get an `onDefinition` callback; `;;DEF:` joins the
  output-marker filter so it never shows in a cell.
- Page: `evaluateCode(code, bufferName, {bufferId, from})` maps the byte
  offset within `code` to a character offset, adds `from`, and records
  the definition per buffer in the project store (`bufferDefinitions`,
  not persisted). Ctrl+Enter, region and evaluate-all all pass their
  base offset. `gotoDefinition` looks at buffer definitions first (most
  recent evaluation wins), then project-load definitions, then the text
  scan. Completion shows `scratch.lisp:12` for buffer definitions.
- Harness: `debugger-test.mjs` section P: an eval with two definitions
  separated by a block comment and a string containing "(defun"; offsets
  match; an erroring definition prints no `;;DEF:`; REPL input without a
  path prints none.

### G. Navbar and footer without framer-motion (if time)
Replace `motion` in `Navbar.tsx` and `Footer.tsx` with CSS transitions,
then check whether framer-motion leaves the entry chunk (nothing under
`components/ui` imports it).

## Out of scope
Rebuilt WECL; importing a transcript back (F).

## Acceptance
- Search over the sample project finds `defun` occurrences in several
  files, symbols-only excludes the docstrings, and a click lands on the
  line.
- After `(defun foo …)` is evaluated from a scratch buffer, F12 on `foo`
  in another buffer jumps to that defun.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
