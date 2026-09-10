# Sprint 12 — Goal and plan

Date: 2026-09-10 · Branch: `sprint12` → PR into `dev` · Follows `Sprints/Sprint11/04-next-sprint.md`

## Goal

Three small corrections to things the last sprints made visible: a value
that prints with spaces is one value; a definition entry follows the
buffer it was evaluated from; the outline shows a project before it is
loaded. Replace-in-workspace if time allows.

## Scope (from the Sprint 11 proposal: P + R + Q, K if time)

### P. Values that contain spaces (small)
`;;=> #<"SMOKE" package>` arrives as two values because the worker prints
all values of a form on one `;;=>` line and the page splits it on
whitespace outside parens and strings — `#<…>` is neither. The worker
now prints one `;;=> value` line per value; the page takes each line as
one value and drops the splitter. Harness expectations that assumed the
joined form (`;;=> "hello, page" NIL`) become two lines. A new check
evaluates `(find-package :cl-user)` and `(values 1 2)`.

### R. Definition freshness (small)
An index entry records where a name was evaluated. Before jumping,
`gotoDefinition` re-scans the buffer with `scanDefinitions`: the name at
a different position → jump there and update the entry; the name gone →
forget the entry and fall through to the project index and the text
scan. Browser smoke: after the reload, the buffer gets the `defun` back
on a different line, and F12 lands on the new line through the index
path (the log line says "evaluated").

### Q. Outline for unloaded project files (small)
The outline's project section scans the project's Lisp files (the search
panel already reads them, same cache) and ticks the entries the loader
has reported; loaded definitions whose file the scan did not produce
stay listed. With no project open, restored project definitions are
dropped at prune time instead of pointing at files that cannot open.

### K. Replace in workspace (if time)
Carried over from Sprint 11.

## Out of scope
Rebuilt WECL.

## Acceptance
- `(find-package :cl-user)` shows one value; `(values 1 2)` shows two.
- Editing a buffer above an evaluated `defun` and pressing F12 on its
  name lands on the `defun`, not on the old line.
- Opening the sample project and pressing Ctrl⇧O lists its definitions
  before anything is loaded.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
