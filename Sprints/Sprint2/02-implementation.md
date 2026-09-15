# Sprint 2 — Implementation notes

## 1. Settings that work

| Setting | Before | Now |
|---|---|---|
| Print length | stored, never used | `runtime.setPrintLength(n)` runs `(setf *print-length* n)` as a hidden job on every `ready-ecl` transition and whenever the slider moves (`pages/Ide.tsx`). A global `setf`, so a user's own `(setf *print-length* …)` persists too. Slider now goes down to 0 = `nil` (unlimited). |
| Default mode `compile` | stored, never used | each eval job carries `compile: true`; the worker binds `cc::*eval-compile*` and `%run` does `(funcall (compile nil (lambda () form)))` instead of `eval`. Verified: defuns, calls, `in-package`, error reporting all behave the same in compile mode. |
| Auto-eval on save | stored, never used | `saveBuffers()` evaluates every form of the active buffer after saving (one cell per form). |
| Verbosity | stored, never used | quiet: boot transcript lines logged at DEBUG; normal: INFO; verbose: additionally mirrors engine stderr noise from evals into the log at DEBUG. Renamed "Log verbosity" in the drawer. |
| Minimap | dead toggle | removed. CodeMirror 6 has no minimap. |
| Heap size | dead segmented control + misleading toast | removed. The wasm heap is fixed by the WECL build; the drawer now says so. |

Persisted settings from before still hydrate: `{...DEFAULT_SETTINGS, ...saved}`
ignores the two stale keys.

## 2. Honest condition reporting

Worker (`public/wecl-worker.js`):
- `eval-one` now wraps the form in `handler-bind` with `%note-error` for
  `serious-condition` *inside* the existing `handler-case`. `%note-error`
  runs at signal time, before the stack unwinds, so `si::ihs-top` … `1`
  still hold the user frames. It prints `;;ERRTYPE: <type-of e>` and one
  `;;FRAME: <name>` per named user frame (innermost first), stopping at
  `eval-one` and skipping frames in the `CC` and `SI` packages. Anonymous
  frames (no `compiled-function-name`) are skipped; that is the honest
  limit of what the image exposes without a debugger hook.
- A user's own inner `handler-case` still wins: inner handlers run first and
  unwind past ours, so the markers only appear for conditions that really
  reach the top level (test 11 in `settings-test.mjs`).

Runtime (`src/lisp/runtime.ts`): `parseEclOutput` buffers `;;ERRTYPE:` and
`;;FRAME:` lines and attaches them to the *first* `;;ERROR:`; the regex
guess on the message text is now only the fallback (reader errors, JSCL).
`EvalResult.frames` and `Cell.frames` carry the list; the cell shows a
collapsed **frames (n)** expander under the error report; the log entry's
details include the frames.

## 3. Restart-protocol spike — answer: viable

`scripts/restart-spike.mjs` is the runnable proof (5 checks, real wasm).

What the image gives us:
- `eu.turtleware.wecl/implementation::js-wait "<js expr>"` — evaluates the
  expression, `await`s the promise, then calls `.text()` on the result (it
  was written for `fetch()` responses). While the promise is pending the
  wasm is suspended *at the call site*, i.e. inside a `handler-bind` handler
  with restarts and frames intact. Resolve with `{ text: () => "…" }` and
  Lisp resumes with that string.
- `js-read*` — suspends until JS calls the glue's global `read_promise(str)`.
  Same mechanism, one argument (a prompt); `js-wait` is the simpler fit.
- `compute-restarts`, `find-restart`, `invoke-restart` all work from the
  handler, including `use-value` with a value and `continue`.

Proven flow: page-side promise → Lisp handler prints the restart list,
pauses → page resolves with `use-value 99` → `(:USED 99)`; and `continue`
→ `(NIL :AFTER)`; image healthy afterwards.

Not done (Sprint 3): production protocol — `%note-error` posts
`{type:'debug', id, condition, type, restarts:[{name, report}], frames}`,
the runtime keeps the job open in a `paused` state, the cell enables the
restart rows (prompting for a value on USE-VALUE), the page answers with
`{type:'restart', id, name, value?}` and the worker resolves the pending
`js-wait`. ABORT must remain available as "unwind to top level" so a stuck
pause can never hang the worker; interrupt (worker restart) stays the
escape hatch.

## 4. Project hygiene

- `app/README.md` rewritten: what ConsCell is, how to run and check it, the
  layer map, the full marker protocol table.
- `package.json`: name `conscell`, version `0.9.2` (matches the About
  string), description; the self-referential `"my-app": "link:"` dependency
  is gone (lockfile regenerated with `pnpm install`).
- Route-level code splitting (`src/App.tsx`): `/ide`, `/docs`, `/examples`
  are `React.lazy` routes behind a `Suspense` fallback; the landing page
  stays in the entry chunk.

## 5. Tests and CI

- `scripts/settings-test.mjs` — 13 checks: print length persists across
  jobs and resets with `nil`; compile mode runs defuns/calls and keeps
  `in-package` semantics; `;;ERRTYPE:`/`;;FRAME:` for a nested call
  (`CALLER` → `BOOM`), for an undefined function, in compile mode, and
  *absent* when a user `handler-case` handles the error.
- `scripts/restart-spike.mjs` — the spike, kept runnable (`pnpm spike:restarts`).
- `package.json`: `test` now also runs `test:settings`; CI runs it too.
