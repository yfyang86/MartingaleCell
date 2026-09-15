# Sprint 5 — Implementation notes

## 1. Project loads through the debugger

`%load-file-forms` used to run each top-level form under a `handler-case`
that turned any error into a `;;WARNING:` and a "warn" file status. It now
delegates to `%load-one-form`, which runs the form inside

```lisp
(restart-case
    (handler-case
        (handler-bind ((warning #'%warn) (serious-condition #'%debug-pause))
          (eval form))
      (serious-condition (e) …skip, as before…))
  (skip-form () …)          ; keep loading; the file ends "warn"
  (retry () …)              ; re-run this form
  (store-value (v) …)       ; unbound-variable only (:test)
  (define-function (f) …)   ; undefined-function only (:test)
  (abort-load () …))        ; stop here; remaining files "error: not loaded"
```

`%debug-pause` is the same handler the eval path uses, so with `debug` on
the load pauses with those five restarts (the user's own `restart-case`
restarts, if any, come first). With `debug` off, or when the page
declines, the `handler-case` skips the form exactly as before. RETRY and
the two set-and-retry restarts loop inside `%load-one-form`; ABORT-LOAD
sets `*load-aborted*`, which `%manual-load-ordered` checks before each
remaining file.

`load-project` takes `&key debug`; the `load-project` message carries
`debug`, taken from the "Pause in debugger on error" setting. The runtime
passes `onDebug` / `onDebugNote` for load jobs (`project/load.ts`), the
project cell flips to `paused`, and `Cell.tsx` renders `DebuggerBlock` for
project cells too. After the load, `resumedVia` records the restart used.

### Two safety nets
- **A pause nobody listens to is declined.** If a job has no `onDebug`
  callback (hidden jobs such as `setPrintLength`), the runtime answers
  index −1 on the next tick; likewise a `;;READ-WAIT` without an
  `onInputRequest` gets end-of-file. The worker can never wait for ever on
  a job without a cell.
- **`guardTopLevel`.** A condition that escapes the helper library itself
  at the top of `wecl_eval` (a bug in `cc`, not in user code) would enter
  the ECL debugger, which waits for a terminal — a silent worker hang. Both
  top-level calls (`eval-string`, `load-project`) are now wrapped in a
  `handler-case` that reports `;;ERROR: internal: …` instead. This sprint's
  own bug (a nonexistent `go-on` operator in the load loop) hung the
  harness for exactly that reason before the guard existed.

## 2. Nested error inside a chosen restart — verified, no code

`(restart-case (boom 0) (use-value (v) (error "nested ~A" v)))`: after
USE-VALUE 5 the body's error is signalled inside the still-active
`handler-bind` of `eval-one`, so `%debug-pause` runs again and the cell
pauses a second time with `nested 5`. Harness case M covers it.

## 3. Fallback rungs — decision

Keep JSCL (CDN) and the mock interpreter as the last rungs: they cost
nothing when ECL boots, and "the IDE always evaluates something" was a
design goal worth keeping for a static site. But they must not pretend:
`SessionPanel` shows a banner on `ready-jscl` / `ready-mock` saying the
rung has no debugger, no standard input, no packages and only a subset of
ANSI CL, and how to get the real image back. The debugger and stdin
protocols are ECL-only by construction (no markers are ever produced on
the other rungs), so nothing else needs disabling.

## 4. Examples

Three gallery entries in `src/data/examples.ts`: *Ask the user*
(`read-line`, `y-or-n-p`, `read` across lines), *Restarts: pause, choose,
continue* (a `restart-case` with USE-VALUE and CONTINUE, plus a
`handler-case` that never pauses), and *Fix it live* (DEFINE-FUNCTION and
STORE-VALUE from the debugger). Categories reuse Basics / Conditions.

## 5. Tests

`scripts/debugger-test.mjs` grows from 27 to 36 checks: nested re-pause
(M) and the load path (N): the five load restarts are offered;
DEFINE-FUNCTION resumes the load and both files end "ok" with live
definitions; SKIP-FORM leaves the file "warn 1/2" and the next file loads;
ABORT-LOAD marks the rest "error: not loaded" and the later file really is
absent; `debug:false` never pauses.
