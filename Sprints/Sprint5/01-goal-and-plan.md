# Sprint 5 — Goal and plan

Date: 2026-09-09 · Branch: `sprint5` → PR into `dev` · Follows `Sprints/Sprint4/04-next-sprint.md`

## Goal

Bring the debugger to project loads, prove it handles nested errors, show
the new capabilities in the examples gallery, and decide what to do about
the two fallback runtimes.

## Scope

1. **Project loads through the debugger.** `%load-file-forms` currently
   swallows each failing form with `handler-case` and reports the file as
   "warn". With the debugger setting on, a failing form now pauses the
   image with load-specific restarts: `SKIP-FORM` (today's behaviour, keep
   loading), `RETRY`, `STORE-VALUE` / `DEFINE-FUNCTION` (fix it and retry),
   `ABORT-LOAD` (stop loading). The load-project message carries `debug`;
   the project cell renders the same `DebuggerBlock` as an eval cell.
   Safety: a pause that no page-side listener handles is auto-declined by
   the runtime so the worker can never hang on an unanswered wait.
2. **Nested error while a restart runs.** Verify with a harness case that
   an error signalled inside a user restart's body (after the first pause
   was answered) pauses again; fix only if it does not.
3. **Fallback rungs decision.** Keep JSCL and the mock as the last resort
   (they cost nothing when ECL boots), but be honest in the UI: a banner in
   the session panel on those rungs says what does not work (debugger,
   stdin, packages, most of ANSI CL). Recorded in `02-implementation.md`.
4. **Examples.** Three gallery entries that use the Sprint 3/4 features:
   interactive input (`read-line`, `y-or-n-p`), a `restart-case`
   walkthrough, and "fix it live" (undefined function → DEFINE-FUNCTION).

Out: entry-chunk diet; a different debugger UI for loads (the cell block is
reused as is).

## Acceptance

- Harness: a project whose file calls an undefined function pauses the
  load with the five restarts; DEFINE-FUNCTION resumes and the file ends
  "ok"; SKIP-FORM ends the file "warn" and the next file still loads;
  ABORT-LOAD stops before the next file; with `debug:false` nothing pauses.
- Harness: nested error inside a chosen USE-VALUE body re-pauses.
- Harness: a pause with no listener is declined within a bounded time.
- Lint/build/CI green; browser smoke still 10/10; merged into `dev`.
