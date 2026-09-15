# Sprint 3 — Goal and plan

Date: 2026-09-09 · Branch: `sprint3` → PR into `dev` · Follows `Sprints/Sprint2/04-next-sprint.md`

## Goal

A real debugger: when a cell signals an unhandled error, the image pauses
*inside the handler*, the cell shows the live restarts, and the user's
choice resumes the computation — USE-VALUE with a value, CONTINUE, a
`restart-case` restart of their own, RETRY, or ABORT. The docs pages already
describe this; after this sprint they are true.

## What Sprint 2's spike established

- `js-wait` suspends the wasm at the call site with the dynamic environment
  intact; resolve its promise with `{ text: () => string }` and Lisp resumes.
- `compute-restarts` / `invoke-restart` work from a `handler-bind` handler.
- The image establishes **no** restarts of its own for top-level errors
  (undefined function, unbound variable, division by zero, type error all
  show an empty restart list). The debugger therefore adds ABORT and RETRY
  itself; USE-VALUE and friends appear only when user code establishes them.

## Scope

In:
1. **Worker protocol.** `eval-one` wraps the form in `restart-case` (RETRY,
   ABORT) and a `handler-bind` whose handler, for a job with `debug: true`,
   prints `;;DEBUG: <report>`, one `;;RESTART: i|NAME|report` per live
   restart, `;;DEBUG-WAIT`, then `js-wait`s on `__ccDebugWait()`. The page
   answers with `{type:'restart', id, index, value?}`; the worker resolves the
   promise with `"<index>"` or `"<index> <form>"`. Index −1 declines (the
   error is reported as today). A value form that fails to read/eval
   prints `;;DEBUG-NOTE:` and re-pauses.
2. **Runtime.** Paused jobs; `EvalCallbacks.onDebug(payload)` with job id,
   condition, type, frames and restarts; `runtime.chooseRestart(jobId, index,
   value?)`; `EvalResult.restartUsed`. Interrupt/restart still kill the
   worker and resolve paused jobs as aborted — the escape hatch stays.
3. **Store + UI.** Cell status `paused` with the live restart rows (value
   input for USE-VALUE/STORE-VALUE-style restarts), number keys 0–9, the
   resolution line; error cells lose the fake restart list. New setting
   "Pause in debugger on error" (default on). Paused cells count as busy so
   Interrupt is offered.
4. **Session replay.** After an interrupt or restart, a toast action and a
   palette command re-evaluate the defining forms from the session cells in
   order.
5. **Tests + CI.** `scripts/debugger-test.mjs` against the real image:
   USE-VALUE with a value, CONTINUE, a user restart, RETRY, ABORT, decline,
   bad value form → re-pause, and a plain eval afterwards.

Out: `read-line` support (same primitive, separate sprint), nested
debuggers (an error while paused is impossible: the job is suspended; an
error inside the chosen restart propagates as an ordinary error).

## Acceptance criteria

- `debugger-test.mjs` passes; Sprint 1/2 harnesses still pass.
- `pnpm lint` 0/0, `pnpm build` passes.
- CI green on the PR; merged into `dev`.

## Plan

| Step | Work | Evidence |
|---|---|---|
| 1 | Plan + restart probe | this file |
| 2 | Worker: restart-case + debug pause + restart message | `02-implementation.md` |
| 3 | Harness `debugger-test.mjs` (protocol proven before any UI) | `03-test-and-fix.md` |
| 4 | Runtime + store + cell UI + setting | `02-implementation.md` |
| 5 | Session replay | `02-implementation.md` |
| 6 | Docs copy, lint/build, PR, merge on green | `03-test-and-fix.md`, `04-next-sprint.md` |
