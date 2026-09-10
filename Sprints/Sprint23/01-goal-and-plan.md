# Sprint 23 — Goal and plan

> Provenance: this sprint is the `sbcl-dev` branch (commit `714ad80`,
> written there as "Sprint 19" while Sprints 19–22 ran on `dev`),
> cherry-picked onto `dev` as Sprint 23. Its documents are kept as
> written, with the sprint numbers renamed; the additions made while
> landing it are marked "on landing".

Date: 2026-09-10 · Branch: `sbcl-dev` (direct commits) → cherry-picked to `sprint23` → PR into `dev` ·
Follows `Sprints/Sprint18/04-next-sprint.md` — and preempts the
"Sprint 19: AQ + AR" suggestion with a bigger item: a second Lisp
implementation (the deferred "rebuilt/second runtime" theme, item I).

## Goal

ConsCell can run SBCL — compiled to `wasm32-wasip1` by the
github.com/yfyang86/sbcl wasm port (branch `wasm-dev`, see its
`SBCL-Handoff.md`) — as a first-class engine alongside ECL: same worker
protocol, same marker-based cells, same project loading, selectable in
Settings.

## Scope

### AS. The SBCL browser host worker (large)
`app/public/sbcl-worker.js`: a hand-written WASI preview1 shim over an
in-memory file system, the port's four `sbcl_host` imports (incl. the
synchronous `instantiate` of every compiled Lisp module against the
runtime's memory/table and one shared `lisp_unwind` tag), and the
runtime's `_start` driven as a persistent REPL on a WASI stdin we own.
Threading: after boot the worker thread lives inside wasm; the page
submits requests through a SharedArrayBuffer mailbox (forms ring, stdin
ring, interrupt flag), the worker serves them from inside the WASI
imports; `Atomics.wait` is the block. A port of the wecl worker's `cc`
helper (eval-string / load-project / package management / debugger
pause) provides the marker protocol; blocking waits read the magic
`/dev/cc-stdin`, the moral equivalent of the wecl build's js-wait.

### AT. Engine plumbing + selection (medium)
`EngineKind`/`EngineStatus` gain `sbcl`/`ready-sbcl`; `runtime.ts`
refactors `bootEcl` into a generic `spawnWorker` used by both engines,
routes requests through `send()` (postMessage for ECL, mailbox write for
SBCL), and makes interrupt a real Ctrl-C (the interrupt-pending word)
for SBCL instead of a respawn. Settings → "Lisp implementation: auto |
sbcl" (localStorage; auto = the old ECL-first ladder with the JSCL/mock
fallbacks; SBCL falls back to ECL when its artifacts are missing).

### AU. Artifacts + test plumbing (small-medium)
`scripts/fetch-sbcl.mjs` copies the ~112 MB artifacts from a local sbcl
checkout into gitignored `public/sbcl/`; `scripts/sbcl-test.mjs` boots
the real worker + real image in a real `worker_threads` thread (so
`Atomics.wait`/SAB behave as in the browser) and exercises eval, error
reporting, package switching across jobs, project loading with markers,
and clean shutdown; wired into `pnpm test` and CI (skips without the
artifacts).

## Out of scope
gzip'd artifact streaming; the sbcl port's sb-js (JS↔Lisp calls, its
Sprint 14); plots for SBCL (no ext:shell to intercept); debugger frame
walking (the port itself lacks it); making SBCL the default engine.

## Acceptance
- With `public/sbcl/` populated and the setting on `sbcl`, the IDE boots
  SBCL, evaluates cells, reports errors/packages, loads projects.
- `pnpm check` green (lint, build, all harnesses; sbcl harness skips
  without artifacts); the sbcl harness passes against the real image.
- ECL behavior unchanged (default ladder untouched).
