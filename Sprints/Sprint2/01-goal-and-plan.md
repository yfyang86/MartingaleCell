# Sprint 2 — Goal and plan

Date: 2026-09-09 · Branch: `sprint2` → PR into `dev` · Follows `Sprints/Sprint1/04-next-sprint.md`

## Goal

Make the settings drawer and the error cells tell the truth. Every control
either does what it says or is gone; every error cell shows the real
condition type and where it was signalled. Time-box a spike on real
debugger restarts and record the answer either way.

## Scope

In:
1. **Settings that work.**
   - `printLength` sets `*print-length*` in the image (on ready and on
     change). It is a global `setf`, so a user's own `(setf *print-length*)`
     also persists — same REPL semantics as the package fix.
   - `evalMode: compile` compiles each top-level form with `compile nil`
     before running it; `eval` stays the default. Verified against the
     image: `(funcall (compile nil '(lambda () …)))` works in the wasm build.
   - `autoEvalOnSave` evaluates every form of the active buffer after
     Ctrl+S.
   - `verbosity` controls how boot transcript lines and engine noise land in
     the log: quiet = DEBUG, normal = INFO, verbose = INFO plus worker
     stderr noise.
   - `heapSize` and `minimap` are removed from the drawer. The wasm heap is
     fixed by the WECL build, and CodeMirror has no minimap; a dead toggle
     is worse than no toggle.
2. **Honest condition reporting.**
   - The worker prints `;;ERRTYPE: <type-of condition>` before `;;ERROR:`;
     the runtime uses it instead of a regex on the message text.
   - At signal time (in a `handler-bind`, before the stack unwinds) the
     worker walks `si::ihs-top` … 1 and prints `;;FRAME: <n>|<function>`
     for user frames (loader/eval-loop frames filtered). Verified against
     the image: the frames for `(caller 0)` → `(boom 0)` → `DIVISION-BY-ZERO`
     are `CALLER`, `BOOM`.
   - The error cell shows the real type and a collapsed "frames" expander.
3. **Restart-protocol spike (time-boxed).** The image exports
   `js-eval` / `js-call` / `js-wait` in the WECL implementation package and
   the glue is Asyncify-built. Question: can a `handler-bind` handler pause,
   post the restarts to the page, and `js-wait` for the answer? Outcome goes
   in `02-implementation.md`; product code only if the answer is a clean yes.
4. **Project hygiene.** Real README, package rename `my-app` → `conscell`
   (dropping the self-`link:` dependency), route-level code splitting so
   Docs/Examples/Home do not ship CodeMirror.

Out: implementing restarts end-to-end (that is Sprint 3 if the spike says
yes), session replay after interrupt, stdin.

## Acceptance criteria

- Harness (`scripts/settings-test.mjs`, real wasm): print length applies
  and persists; compile mode evaluates defuns and calls; error markers carry
  `;;ERRTYPE:` and `;;FRAME:` lines naming the user functions.
- `pnpm lint` 0/0, `pnpm build` passes, boot harness ready, Sprint 1 tests
  still green.
- Docs/Examples/Home chunks no longer include CodeMirror (build output shows
  a separate IDE chunk).
- CI green on the PR; merged into `dev`.

## Plan

| Step | Work | Evidence |
|---|---|---|
| 1 | Plan + probes (compile, ihs, js bridge) | this file |
| 2 | Worker: errtype + frames; settings hooks | `02-implementation.md` |
| 3 | Runtime + store + UI wiring; remove dead controls | `02-implementation.md` |
| 4 | Spike: pause/await from a handler | `02-implementation.md` §spike |
| 5 | README, rename, code split | `02-implementation.md` |
| 6 | New harness test, run everything, fix | `03-test-and-fix.md` |
| 7 | Sprint 3 plan; PR; merge on green | `04-next-sprint.md` |
