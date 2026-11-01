# Sprint 34 — Goal and plan

Date: 2026-09-15 · Branch: `sprint34` → PR into `dev` · From `Sprints/Sprint33/04-next-sprint.md` (CJ and CK; BW still waits on the hosting decision)

## Goal

Make the first visit enough for offline use, and let the plot evaluator
understand the gnuplot scripts people actually write: user-defined
functions and variables, and integer arithmetic on integer literals.

## Scope

### CJ. Warm the service-worker cache after the first boot (small-medium)
Today the artifacts reach the worker's cache only when a fetch passes
through a controlled page; on the very first visit the boot starts
before the worker has claimed the page, so the second visit — not the
first — is the one that works offline. Now, when the runtime reaches
`ready`, the page asks the worker (via `navigator.serviceWorker.ready`,
which does not need a controlled page) to warm the cache with the
booted engine's artifact URLs; the worker fetches only those not yet
cached and answers `warmed`. The page marks
`document.documentElement.dataset.swWarmed` so tests can see it. Cost:
at most one extra download of the artifacts the boot already fetched
outside the worker, once per version, in the background.

A new Node suite, `scripts/sw-test.mjs`, evaluates `public/sw.js` in
a `vm` with stubbed `caches`, `fetch`, `Response` and listeners and
checks install (precache), activate (old caches dropped), navigation
(network first, cached `index.html` when offline, 503 when nothing
cached), cache-first for same-origin GETs, cross-origin and non-GET
pass-through, and the `warm` message (missing URLs fetched, present
ones skipped, reply sent). The `offline` smoke scenario goes offline
right after the first boot once `swWarmed` is set, without the
intermediate online reload.

### CK. User-defined functions, variables, integer arithmetic (medium)
- `parseGnuplot` records `name(p, q) = expr` and `name = expr` lines
  in `spec.defs` (`functions`, `variables`; optional field, persisted
  specs without it behave as before).
- `compileExpression(src, defs)` resolves user variables and calls
  user functions (arguments by position, a depth guard of 32 against
  recursion, `null` on arity mismatch or unknown names as before).
- Integer literals follow gnuplot: an expression whose operands are all
  integer-typed stays integer through `+ - * / % **` (`1/2 = 0`,
  `2**-1 = 0`, `7/2*x` is `3x`); `x`, floats and the maths functions are
  real; `int floor ceil round sgn` return integers.

`plot-test` grows accordingly; the docs site's feature matrix and the
app README's plot row say what the evaluator understands.

## Acceptance
- A fresh profile's first visit, taken offline after `swWarmed`, boots
  the same engine from the cache (smoke `offline`).
- `sw-test` passes; the 18-suite chain and CI step list include it.
- `f(x) = x**2 + a` with `a = 1` draws; `1/2` evaluates to 0 and
  `1/2.0` to 0.5 (`plot-test`).
- Lint, build, all suites and the browser smoke pass; CI green; merged.
