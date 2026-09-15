# Sprint 4 — Implementation notes

## 1. Standard input (`app/public/wecl-worker.js`)

`cc::%stdin` is a `gray:fundamental-character-input-stream` with a one-line
buffer (`buf`, `pos`) and an `eof` flag. `stream-read-char`,
`stream-peek-char`, `stream-unread-char`, `stream-listen` and
`stream-clear-input` are defined; `read-line`, `read`, `read-char`,
`y-or-n-p` all work through the Gray defaults on top of them.

When the buffer runs dry, `%stdin-fill`:
1. `%flush-out` — `finish-output`, then `js-eval "__ccFlush()"`: the worker
   pushes any partial stdout/stderr line the Emscripten TTY is holding
   through `Module.print` (prompts have no trailing newline and would
   otherwise arrive *after* the wait marker).
2. prints `;;READ-WAIT` on **stderr** (a `with-output-to-string` around the
   read cannot swallow it) and suspends on `js-wait "__ccReadWait()"`.
3. resumes with the page's line (plus a newline), or marks EOF when the
   answer is a lone `#\Eot` (the worker sends that for `text: null`).

`%install-stdin` (run at bootstrap) sets `*standard-input*` to the stream
and `*terminal-io*` to a two-way stream of it and `*standard-output*`, so
`*query-io*` (a synonym to `*terminal-io*`) and therefore `y-or-n-p` work.
`eval-string` calls `%stdin-reset` at the start of every job: a cell never
inherits another cell's leftover line or its EOF.

Worker JS: `__ccReadWait` / `answerInput` mirror the debugger's
`__ccDebugWait` / `answerDebug`; message `{type:'input', id, text}`.

## 2. Condition details and set-and-retry restarts

- `%condition-details` prints `;;DETAIL: key|value` at signal time for
  `type-error` (datum, expected), `cell-error` (name), `arithmetic-error`
  (operation, operands), `package-error`, `file-error`, `stream-error`.
  Note: ECL signals `SIMPLE-TYPE-ERROR` expecting `CONS` for `(car 5)`.
- `eval-one`'s `restart-case` gains `store-value (v)` and
  `define-function (f)`, guarded with `:test` so they are only listed for
  `unbound-variable` / `undefined-function`. They set the symbol's value /
  function (`(coerce f 'function)` accepts a lambda or a function name) and
  re-run the *same top-level form*, like RETRY.
- Gotcha found in testing: `invoke-restart` re-evaluates a restart's `:test`
  with **NIL** as the condition; a test that only accepts the condition type
  makes the restart "not active" at invoke time. The tests accept NIL.

## 3. Runtime, store, UI

- `runtime.ts`: `;;DETAIL:` lines are mirrored into the job and into
  `EvalResult.details` (attached to the first `;;ERROR:`); `;;READ-WAIT`
  marks the job `awaitingInput` and calls `onInputRequest({ jobId })`;
  `runtime.provideInput(jobId, text | null)`.
- `workspace.ts`: `CellStatus` gains `input`; `Cell.details`,
  `Cell.inputRequest`. `isBusy` counts `input` (Interrupt stays available).
- `actions.ts`: `provideInput(cellId, text | null)` answers and echoes the
  line (`^D` for EOF) into the OUT well.
- `Cell.tsx`: `InputBlock` (autofocused line input, Enter sends, Ctrl+D /
  "EOF" link ends the file); `DetailsList` under the condition text in both
  paused and error cells; `restartNeedsValue` knows `DEFINE-FUNCTION`.

## 4. Tests

- `scripts/stdin-test.mjs` (CI, 17 checks): read-line; prompt printed
  before the read reaches stdout **before** `;;READ-WAIT`; `read` across
  two lines; `y-or-n-p`; EOF ends a loop; EOF is per job; leftover input is
  discarded per job; the marker survives a rebound `*standard-output*`.
- `scripts/debugger-test.mjs` (now 27 checks): details for a type-error;
  STORE-VALUE / DEFINE-FUNCTION offered only for the matching condition and
  resuming the form; the variable / function stays set afterwards.
- `scripts/browser-smoke.mjs` (10 checks): `(read-line)` completed by typing
  into the cell prompt in headless Chromium; screenshot `smoke-stdin.png`.
