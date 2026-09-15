# Sprint 2 — Proposed plan

Ranked by impact on the day-to-day REPL experience. Sprint 1 removed the
biggest correctness bug and made "green" measurable; Sprint 2 should turn the
promises the docs pages already make into real behaviour.

## Goal candidates

### A. Wire the dead settings (small, high confidence)
`printLength`, `evalMode`, `autoEvalOnSave`, `heapSize`, `verbosity` are
stored but never reach the runtime or editor.
- `printLength` → bind `*print-length*` (and `*print-level*`) around
  `cc:eval-string`; send the value with each eval message.
- `evalMode: 'compile'` → wrap each form as
  `(funcall (compile nil (lambda () form)))`; keep `eval` the default.
- `autoEvalOnSave` → on Ctrl+S, evaluate all forms of the saved buffer.
- `heapSize` / `verbosity` → either implement (heap: Emscripten
  `INITIAL_MEMORY` is fixed by the build, so this is probably "remove") or
  drop the controls. Honest UI beats a dead toggle.
Acceptance: each setting has a harness check where feasible.

### B. Honest condition reporting (medium)
- Print the real condition type in the `;;ERROR:` marker
  (`(type-of e)`), replacing the regex guess in `parseEclOutput`.
- Capture a backtrace at signal time (`si::backtrace` availability to be
  confirmed against the image; fall back to `*print-*` of the condition's
  restarts) and show it in the cell's "Frames" expander that the docs
  already describe.

### C. Real restarts (large, highest value)
Today USE-VALUE and CONTINUE are permanently disabled because errors are
caught by `handler-case` inside the worker. A real debugger needs:
1. `handler-bind` instead of `handler-case`, with the handler pausing the
   job and posting `{type:'debug', restarts:[…], condition, frames}`.
2. The worker awaiting a `{type:'restart', name, value?}` message. WECL is
   Asyncify-built, so a JS promise can be awaited from inside a Lisp
   callback; this needs a spike to confirm the `#j` / `wecl_lcall` path.
3. Cell UI: enable the restart rows, prompt for a value on USE-VALUE, and
   show the interactive restarts a `restart-case` established.
Spike first (half a day); if the pause protocol is not viable, fall back to
B and leave the docs honest ("restarts: ABORT and RETRY").

### D. Session replay after interrupt (small)
Interrupt restarts the worker and loses every definition. Offer a
"replay defining forms" action that re-evaluates `def*` forms from the
session cells in order.

### E. Project hygiene (small, parallelisable)
- Replace the Vite boilerplate `app/README.md` with a real one (what the
  project is, how to run, how to test, the marker protocol).
- Rename the package from `my-app` to `conscell`.
- Code-split the 1.5 MB bundle (route-level `React.lazy` for Docs and
  Examples; CodeMirror stays in the IDE chunk).

## Suggested Sprint 2 scope
A + B + E, with the C spike time-boxed. Same delivery loop as Sprint 1:
plan → implement → test and fix → plan next → PR into `dev`, merge on green.
