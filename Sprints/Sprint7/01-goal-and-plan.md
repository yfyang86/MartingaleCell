# Sprint 7 — Goal and plan

Date: 2026-09-09 · Branch: `sprint7` → PR into `dev` · Follows `Sprints/Sprint6/04-next-sprint.md`

## Goal

Find out why the image runs about 13 000 loop iterations per second, fix
what can be fixed from the worker side, and state plainly what cannot.

## Starting measurements (Sprint 6, Node harness, real image)

| Form (20 000 iterations) | Wall time | Per iteration |
|---|---|---|
| `(dotimes (i 20000))` — empty | 711 ms | 36 µs |
| `… (setq n i)` | 844 ms | 42 µs |
| `… (incf n i)` | 1 498 ms | 75 µs |
| `… (setq n (f7 i))` — one function call | 1 470 ms | 74 µs |
| `(loop for i below 20000 collect i)` | 1 329 ms | 66 µs |

Unchanged by `compile`, `(speed 3)`, or fixnum declarations. ECL's `time`
reports `run time: 0.000` because the CPU clock syscall is unsupported in
this build; only real time is meaningful. No "unsupported syscall" messages
are printed during a loop (they only occur at boot), so glue logging is not
the cost.

## Hypotheses, in the order they are tested

1. **A JavaScript import is called on every bytecode.** Tens of
   microseconds per operation is the price of leaving wasm. Emscripten's
   setjmp/longjmp support routes every call made from a function that
   contains a `setjmp` (ECL's frame stack) through a JS `invoke_*`
   trampoline; the interpreter loop is exactly such a function. Test:
   wrap the import object at instantiation and count calls per import
   during a loop.
2. **GC / allocation.** `(dotimes …)` should not cons; if the collector
   runs anyway, `gc-stats` will show it.
3. **Asyncify instrumentation.** A flat 2–5× tax; cannot explain 1000×
   alone, but would compound with 1.

## Scope

In:
- The profile above, with numbers, in `02-implementation.md`.
- Whatever worker-side change the profile justifies (a stubbed import, a
  GC tunable, a different way to run forms) — with a before/after table
  and a harness that asserts a performance floor so the gain cannot
  regress silently.
- If the cost is in the WECL build itself: a written recipe for the rebuild
  (flags, expected effect) — not the rebuild, which needs an Emscripten
  toolchain this environment does not have.
- Definition index survives an interrupt/restart: session replay
  re-indexes definitions from the open project.

Out: touching the third-party image files in this sprint.

## Acceptance

- The dominant cost is identified with a measurement, not a guess.
- If fixable here: at least a 2× improvement on the loop table above,
  guarded by `scripts/perf-test.mjs` (floor, not a benchmark).
- Lint/build/CI green; merged into `dev`; local `dev` fast-forwarded.
