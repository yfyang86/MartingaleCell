# Sprint 3 — Implementation notes

## 1. Worker: the pause protocol (`app/public/wecl-worker.js`)

`eval-one` now runs every top-level form as

```lisp
(restart-case
    (handler-bind ((warning #'%warn)
                   (serious-condition #'%debug-pause))
      (multiple-value-list (%run form)))
  (retry () :report "Retry evaluating this form" …)
  (abort () :report "Abort this form and return to top level" …))
```

inside the existing `handler-case`. `%debug-pause` runs at signal time:

1. `%note-error` prints `;;ERRTYPE:` and the `;;FRAME:` lines (Sprint 2).
2. If the job was sent with `debug: t`, it prints `;;DEBUG: <report>`, one
   `;;RESTART: i|NAME|report` per `compute-restarts` entry (innermost first,
   so the user's `restart-case` restarts come before RETRY and ABORT), then
   `;;DEBUG-WAIT`, and calls `js-wait "__ccDebugWait()"`.
3. `__ccDebugWait` (worker JS) returns a promise stored as `pendingDebug`
   for the current job; the wasm is suspended here with the dynamic
   environment intact. A `{type:'restart', id, index, value?}` message
   resolves it with `"<index>"` or `"<index> <form>"`.
4. Back in Lisp: index −1 or out of range returns normally → the outer
   `handler-case` prints `;;ERROR:` exactly as before (decline). Otherwise
   the value form, if any, is read in the job's package and evaluated; a
   failure prints `;;DEBUG-NOTE: value form failed: …` and loops back to
   step 2 (re-pause with the same restarts). Then `invoke-restart`.

The image establishes no restarts of its own for top-level errors (probed:
undefined function, unbound variable, division by zero, type error), which
is why RETRY and ABORT are added at the `eval-one` level. RETRY re-runs the
*same top-level form* (not the whole cell); ABORT prints `;;ERROR:` with the
original condition and returns no values, so from the cell's point of view
it looks like the error was reported.

Interrupt and Restart Lisp image still terminate the worker; a paused job
is resolved as aborted like any other in-flight job — the escape hatch that
existed before still exists.

## 2. Runtime client (`src/lisp/runtime.ts`, `types.ts`)

- `EvalOptions.debug`; the eval message carries `debug: true`.
- Stderr markers are handled while streaming: `;;ERRTYPE:`/`;;FRAME:` are
  mirrored into the job (and still reach `parseEclOutput`), `;;DEBUG:`,
  `;;RESTART:`, `;;DEBUG-NOTE:` and `;;DEBUG-WAIT` are consumed.
  `;;DEBUG-WAIT` marks the job `paused` and calls
  `callbacks.onDebug({ jobId, condition, errorType, frames, restarts })`.
- `runtime.chooseRestart(jobId, index, value?)` posts the answer, clears
  `paused`, and records `restartUsed` (the restart name, or `DECLINE`),
  which the final `EvalResult` carries.

## 3. Store and UI

- `CellStatus` gains `paused`; `Cell.debug` holds the live `DebugPause`;
  `resumedVia` is set from `EvalResult.restartUsed` when the job finishes.
- `store/evaluate.ts` — `isBusy()` (queued, running **or paused**) drives
  the `evaluating` flag so Interrupt stays available while paused; `onDebug`
  flips the cell to `paused` and logs the restart list; `onDebugNote`
  appends to the cell's OUT well.
- `components/ide/actions.ts` — `chooseRestart(cellId, index, value?)`.
- `components/ide/Cell.tsx` — the fake `RESTARTS` table is gone. A paused
  cell renders `DebuggerBlock`: condition, frames, one row per live restart
  (keys 0–9 pick), an inline value-form input for restarts that take a
  value (USE-VALUE / STORE-VALUE, or a report mentioning "value"), a
  "report as error" link (decline) and the interrupt hint. Error cells show
  the resolution line ("resolved via ABORT" / "reported without pausing")
  and a re-run link; a done cell that came back from the debugger shows
  "resumed via USE-VALUE".
- New setting **Pause in debugger on error** (default on) in the drawer.
- Docs: `DebuggerSection` copy now describes the real behaviour.

## 4. Session replay after interrupt / restart

`definingForms()` walks the done cells in order and keeps the top-level
forms whose head is `def…`, `in-package`, `declaim`, `proclaim`, `require`,
`use-package`, `import` or `export`. `replayDefinitions()` evaluates them
(one cell per form, serialized by the runtime). After an interrupt or a
Restart Lisp image, the toast offers "Replay N definitions"; the command
palette has "Replay definitions from session".

## 5. Editor: the welcome animation no longer eats early typing

Found by the browser smoke test (see `03-test-and-fix.md`). The first-visit
typing animation used to disable the store sync and keep appending
characters after any text the user typed in the first ~3 s. Its
transactions are now tagged with an `Annotation`; a real edit stops the
animation and is stored — the user always wins.

## 6. Tests

`scripts/debugger-test.mjs` — 19 checks against the real image: USE-VALUE
with an evaluated value form, CONTINUE, RETRY twice on a form that
succeeds the third time, ABORT (error reported, no values), decline, a bad
value form (note + re-pause) followed by a good one, `debug:false` (never
pauses), a user `handler-case` (never pauses), and a healthy eval after.
`pnpm test` and CI run it.

`scripts/browser-smoke.mjs` (`pnpm smoke:browser`, needs a built app on
`pnpm preview` and Playwright; not in CI) drives the real IDE in headless
Chromium through the debugger flows and the package pill — 8 checks.
