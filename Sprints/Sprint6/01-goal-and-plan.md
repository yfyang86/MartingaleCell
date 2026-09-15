# Sprint 6 — Goal and plan

Date: 2026-09-09 · Branch: `sprint6` → PR into `dev` · Follows `Sprints/Sprint5/04-next-sprint.md`

## Goal

Turn from the runtime to the editor: make project definitions navigable,
give load-time warnings a place and a location, and bring the docs pages in
line with what the product now does. Settle the interrupt question with a
measurement.

## Scope

In:
1. **Definitions from the loader.** While `%load-file-forms` reads a file
   it knows the stream position of every form; for defining forms
   (`defun`, `defmacro`, `defvar`, `defparameter`, `defconstant`,
   `defclass`, `defstruct`, `defgeneric`, `defmethod`, `deftype`,
   `define-condition`) it prints `;;DEF: path|offset|NAME|kind`. The
   runtime turns these into `LoadEvent {kind:'definition'}`; `load.ts`
   converts the byte offset to line/col against the file it sent, and the
   project store keeps a `definitions` map.
2. **Go to definition.** `gotoDefinition(name)`: project definitions first
   (open the file, jump, flash), then the open buffers (existing regex
   search), else a toast. Bound to **F12** and **Ctrl/⌘+click** in the
   editor, in the editor context menu, and as a palette command.
   Completion entries for project symbols show the file they come from.
3. **Located warnings.** Warnings signalled while loading a file are
   printed as `;;WARNING: path|offset|message`; the runtime parses the
   location, `LogEntry.location` carries it, the log panel shows a jump
   link (`file.lisp:12`), and the project cell counts warnings per file.
4. **Docs pass.** `FeatureMatrix`, `DebuggerSection`, `Shortcuts`,
   `SessionCells` and `GettingStarted` describe Sprints 3–5 truthfully:
   restarts, stdin, the package pill, the settings that exist, F12.
5. **Interrupt spike (measurement).** Does a long-running job ever yield to
   the worker's event loop? If it never does, a cooperative interrupt is
   impossible without a rebuilt WECL and the current "restart the worker"
   stays. Recorded either way in `02-implementation.md`.

Out: rebuilding WECL; the landing-page chunk diet.

## Acceptance

- Harness: loading a two-file project reports `;;DEF:` for each defun /
  defparameter / defclass with the right file and a plausible offset; a
  `(warn …)` inside a file arrives as a located warning.
- Browser: F12 on a project symbol opens the file at the definition.
- Docs: no claim on the docs pages that the product does not meet.
- Lint/build/CI green; merged into `dev`; local `dev` fast-forwarded and
  the CI record pushed (checked this time).
