# Sprint 10 — Goal and plan

Date: 2026-09-09 · Branch: `sprint10` → PR into `dev` · Follows `Sprints/Sprint9/04-next-sprint.md`

## Goal

Close two loops opened by the last sprints: go-to-definition gets its
counterpart, find references; the Markdown transcript that Sprint 8
exports can come back as cells. And the session box joins the definition
index so nothing typed there is invisible to F12.

## Scope (from the Sprint 9 proposal: J + F, L if time)

### J. Find references (small)
- `openSearch` accepts a preset (query + options). `findReferences(name?)`
  takes the symbol at point and opens the panel with whole-symbol and
  code-only on, so the hits are uses of the symbol, not substrings or
  mentions in comments.
- Bound to Shift+F12 (window handler and editor keymap), the editor
  context menu and the palette. Docs updated. Browser smoke: Shift+F12 on
  `sq` opens the panel with the query filled and three hits.

### F. Import a transcript back (small-medium)
- `parseMarkdownTranscript(md)` in `src/session/transcript.ts`, pure: one
  cell per `## Cell` section; the first `lisp` fence is the input, a
  fence of `;;=>` lines the values, **Output** the stdout, `> ⚠️` quotes
  the warnings, **Error** the report and type, `_Resumed via_` /
  `_Evaluation aborted._` the state, project-load tables the file list.
  Fences of any length; prose between cells is ignored.
- Palette command "Import session transcript (.md / .lisp)": a `.md`
  appends the parsed cells (marked *imported* in the header, re-runnable
  as any cell), a `.lisp` opens as a buffer.
- `transcript-test.mjs`: export → parse round trip on the fixture, plus a
  hand-edited transcript with extra prose and a values fence longer than
  three backticks.

### L. Definitions from the session box (small)
- The session input evaluates with a `session` path; definitions it
  produces are recorded with the cell number instead of a buffer.
  `gotoDefinition` scrolls to and flashes the cell (the log panel's
  `conscell:goto-cell` event), and completion shows `session:3`.

## Out of scope
Replace in workspace (K); rebuilt WECL.

## Acceptance
- Shift+F12 on a symbol lists its uses across buffers and project files,
  excluding comments and strings.
- A session exported as Markdown, re-imported, shows the same inputs,
  values, output, warnings and errors; every check in the round-trip
  test passes.
- `(defun f …)` typed into the session box, then F12 on `f` in the editor,
  scrolls to that cell.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
