# Sprint 6 — Implementation notes

## 1. Definitions from the loader (`app/public/wecl-worker.js`)

`%load-file-forms` now measures where each form starts before reading it:
`%skip-blank` skips whitespace *and* `;` comment lines (the reader consumes
comments, `peek-char t` only skips whitespace — without this the first
definition in a file pointed at its header comment), then `file-position`
gives the byte offset. The offset and path are bound as `*load-context*`
around the read and the evaluation.

After a form evaluates successfully, `%say-def` prints
`;;DEF: path|offset|NAME|kind` when its head is one of `defun`, `defmacro`,
`defvar`, `defparameter`, `defconstant`, `defclass`, `defstruct`,
`defgeneric`, `defmethod`, `deftype`, `define-condition`, `defpackage`.
`%def-name` handles `(setf foo)` names and `(defstruct (name …))` option
lists.

`*load-context*` is a `defvar` near the top of the helper library on
purpose: a special must be proclaimed before the `let*` that binds it is
evaluated, or the binding is lexical and `%warn` would never see it.

## 2. Located warnings

`%warn` goes through `%say-warning`: with a `*load-context*` it prints
`;;WARNING: /project/path|offset|text`, otherwise the plain form. The
per-form skip path and reader failures use the same helper, so every
warning raised while a project form loads carries its location.
`parseEclOutput` recognises the located form (`/…|digits|text`) and fills
`EvalResult.locatedWarnings` while keeping the plain text in `warnings`.

## 3. Runtime, store, UI

- `LoadEvent {kind:'definition'}` from `;;DEF:`; `load.ts` converts the
  byte offset to line/col against the file it sent
  (`byteOffsetToLineCol`, UTF-8 aware) and stores `ProjectDefinition[]` in
  the project store (cleared whenever the project changes).
- `actions.ts`: `symbolAtOffset` / `symbolAtPoint` (package prefix and
  quote stripped), `gotoLocation(path, line, col)` (opens the project file,
  jumps, flashes), `gotoDefinition(name?)` — project definitions first,
  then a defining form in any open buffer (active buffer first), else a
  toast.
- Editor: **F12** keymap, **Ctrl/⌘+click** via `EditorView.domEventHandlers`,
  a context-menu item; palette command "Go to definition of symbol at
  point".
- Located load warnings become log rows with `LogEntry.location`; the log
  panel shows a `file.lisp:12` chip that calls `gotoLocation`.
- Completion: project symbols show `PACKAGE · file.lisp:12` and take their
  type (function / macro / variable / class) from the definition kind.

## 4. Docs pass

- FeatureMatrix: the evaluation row no longer claims `compile-file` or
  `disassemble`; the condition-system row describes the real debugger
  (also during loads); Gray streams mention stdin; packages mention the
  pill and go-to-definition.
- Shortcuts: restarts are 0–9 (was 0–4), plus Ctrl+D (EOF) and F12.
- DebuggerSection had been corrected in Sprint 3 already.

## 5. Interrupt spike — answer: not possible with this build

Measured in the Node harness with a 10 ms `setInterval` running alongside
a job:

| Job | Wall time | Event-loop ticks during the job |
|---|---|---|
| `(dotimes (i 200000) (incf n i))` | 14.7 s | 1 (the tick after completion) |
| `(sleep 2)` | 2.0 s | 1 |

The image never returns to the JavaScript event loop while a job runs —
not even `sleep`, which busy-waits rather than using the glue's
`emscripten_sleep`. A cooperative interrupt (a flag checked from JS) would
need the image to yield periodically, which only a rebuilt WECL could add.
"Interrupt = restart the worker" stays, and the Sprint 3 session-replay
action remains the way back.

### Side finding: the interpreter is slow

The same loop runs at about **13 000 iterations per second** whether
evaluated, compiled with `compile nil`, or compiled with `(speed 3)
(safety 0)` and fixnum declarations — the wasm image has no native
compiler, so every path is the bytecodes interpreter, and Asyncify
instrumentation taxes every function call on top. Recorded as the lead
candidate for Sprint 7 (`04-next-sprint.md`).

## 6. Tests

- `scripts/debugger-test.mjs` → 41 checks: `;;DEF:` for defun /
  defparameter / defclass / defstruct / `(setf px)` with the right path,
  increasing offsets that skip the header comment, a located `(warn …)`,
  and the file still "ok".
- `scripts/browser-smoke.mjs` → 11 checks: F12 on `sq` in a buffer jumps
  to `(defun sq …)` (status bar `Ln 1, Col 1`).
