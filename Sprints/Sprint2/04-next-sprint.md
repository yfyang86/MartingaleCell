# Sprint 3 — Proposed plan

## Goal: real debugger restarts

Sprint 2's spike (`scripts/restart-spike.mjs`) proved the image can pause
inside a handler, hand the restart list to the page, and resume with the
user's choice. Sprint 3 turns that into the product feature the docs pages
already describe.

### Protocol
1. Worker: `%note-error` becomes `%debug-pause` for `error` (not every
   `serious-condition`): print `;;DEBUG: <json-ish payload>` with the
   condition type, report, `compute-restarts` (name + `:report` text) and
   frames; then `js-wait` on a promise the worker resolves when the page
   answers. Warnings and `storage-condition` keep the current path.
2. Worker ↔ page: new messages `{type:'debug', id, …}` → page and
   `{type:'restart', id, name, value?}` → worker. The worker's pending
   resolver is per job; a second `debug` while one is pending is answered
   `abort` (no nested debuggers in v1).
3. Runtime: a job in `paused` state; `EvalCallbacks.onDebug(payload)`;
   `runtime.chooseRestart(id, name, value?)`. Interrupt/restart still kill
   the worker and resolve the job as aborted — the escape hatch stays.
4. Store/UI: cell status `'paused'`; the error block lists the *live*
   restarts (ABORT always present, from `with-simple-restart` at the
   eval-one level), USE-VALUE prompts for a form which is read in the
   current package, number keys pick, the resolution line records the
   choice. `RETRY` stays a client-side re-eval.
5. Docs: `DebuggerSection` and `FeatureMatrix` updated to what is real.

### Acceptance
- Harness: USE-VALUE with a value, CONTINUE, ABORT, a user `restart-case`
  restart, and "page answers after 2 s" all resolve correctly; an
  `interrupt` while paused aborts cleanly and the next eval works.
- Cell UI drives the same flow in the browser (manual smoke + screenshot).

## Also worth doing in Sprint 3 (small)
- Session replay after interrupt: re-evaluate `def*` forms from the cells
  in order (the interrupt path already knows definitions were lost).
- `(read-line)` support via `js-read*` → a cell input prompt. Same pause
  primitive, much smaller UI.
- Docs pages: remove the remaining claims that are not true yet
  (`compile-file`, "interactive debugger" until Sprint 3 lands).
