# Sprint 34 — Implementation notes

## CJ. Warm the service-worker cache after the first boot

`public/sw.js`

- `warm(urls)`: opens the version's cache and, URL by URL, skips what
  `cache.match` already has, fetches the rest and stores `basic`
  responses that are `ok`; failures are collected, never thrown.
- A `message` listener accepts `{ type: 'warm', urls }`, keeps only
  same-origin string URLs, runs `warm`, replies to `event.source` with
  `{ type: 'warmed', urls, added, failed }`, and holds the worker alive
  with `event.waitUntil`. Other messages are ignored.

`src/lisp/sw-warm.ts` (new)

- `ENGINE_ARTIFACTS`: the worker script and the artifact files per
  engine (ECL: `wecl-worker.js`, `boot.js`, `wecl.js`, `wecl.wasm`;
  SBCL: `sbcl-worker.js` and the three `.gz` files), resolved against
  `document.baseURI`.
- `warmEngineArtifacts(engine)`: resolves `navigator.serviceWorker.ready`
  (an active worker, whether or not this page is controlled), posts the
  warm request to `reg.active`, listens for the `warmed` reply, sets
  `document.documentElement.dataset.swWarmed` to the engine name (or
  `<engine>:partial` when something failed) and resolves; `null` after
  a timeout, without a service worker, or on the dev server.

- `pageResourceUrls()`: the same-origin entries of
  `performance.getEntriesByType('resource')` plus `index.html` — the
  page's own hashed chunks and styles, which on a first visit were also
  fetched before the worker controlled the page. They are warmed
  together with the engine; without them the offline reload had
  `index.html` and no scripts.

`src/lisp/runtime.ts`: the `ready` message handler calls it for the ECL
and SBCL engines after `setStatus`, fire-and-forget.

Cache lookups ignore `Vary` (`{ ignoreVary: true }` in `cacheFirst`,
the warm presence check and the offline `index.html` fallback). Hosts
answer static files with `Vary: Origin` (vite preview does), and
Chromium sends an `Origin` header on the page's `crossorigin`
module-script and stylesheet requests, while a warmed entry was stored
from a plain fetch without one: with `Vary` honoured the Cache API never
matched them and the worker answered 504 for every chunk. Found with a
diagnostic page load offline that logged the 504s; `sw-test` asserts
the option on every lookup.

`cacheFirst` also stores the response before answering (a request that
follows at once is served from the cache) and answers an explicit 504
on an offline miss instead of rejecting `respondWith`.

Why not precache at install: 19 MB (SBCL) or 9.5 MB (ECL) on every
first visit to any page, including the landing page, for artifacts the
IDE fetches anyway when it boots. Warming after `ready` costs at most
one duplicate download of what the boot fetched outside the worker,
once per version, in the background, and only on the IDE.

## CK. User-defined functions, variables, integer arithmetic

`src/plot/expr.ts` (rewritten)

- Nodes are `{ fn(vars), isInt }`: a closure over a variable scope plus
  gnuplot's static integer typing. Integer literals (`\d+`) are
  integer; `x`, floats, `pi` and the maths functions are real;
  `int floor ceil round sgn` return integers; `+ - * % **` of two
  integers stay integer, `/` of two integers truncates (division by
  zero → `NaN`, so the sample is skipped rather than thrown), `**` of
  integers truncates (`2**-1 = 0`, as gnuplot).
- `PlotDefs { functions?: { name: { params, body } }, variables?: {
  name: body } }`. A call to a user function parses its body with the
  parameters in scope (arguments by position, arity checked) at compile
  time, with a depth guard of 32 that turns recursion into `null`; a
  user variable is parsed in place. Parameters shadow `x`; built-ins
  (`x`, `pi`, the maths functions) are looked up first, so definitions
  cannot break them.
- `compileExpression(src, defs?)` keeps its signature for callers
  without definitions; `evaluateConstant(src, defs?)` evaluates an
  expression without `x` (tests and tooling).

`src/plot/gnuplot.ts`: `PlotSpec.defs?: PlotDefs` (optional, so
persisted specs are unchanged); the script loop records
`name(p, q) = body` and `name = body` lines (not `==`, not `set`/`plot`
lines) before the `set` handlers. `build-svg.ts` passes `spec.defs` to
the compiler.

## Tests

- `scripts/sw-test.mjs` (new, 14 checks): `public/sw.js` in a `vm`
  with a fake Cache API, fetch, listeners and a `Response`-based fake
  server — install, activate, navigations online and offline, 503 with
  nothing cached, cache-first, pass-through, warm (added, skipped,
  failed, cross-origin dropped, offline), cache name from `?v=`.
  Wired into `pnpm test` (18 suites) and CI.
- `scripts/plot-test.mjs`: 52 checks — integer arithmetic (6) and
  definitions (13: compile, arity, recursion, shadowing, parsing into
  `defs`, rendering, a persisted spec without `defs`, `set xrange` and
  `==` not taken for definitions).
- `scripts/browser-smoke.mjs`, scenario `offline`: after the first
  boot it waits for `data-sw-warmed=ecl`, checks the two ECL artifacts
  are in the cache, and goes offline without the intermediate online
  reload; the reload then boots from the cache.

## Docs

`app/README.md` (plot row, service-worker row), the FAQ's offline
answer, a "gnuplot plots" row in the feature matrix.

## Files touched

`public/sw.js`, `src/lisp/sw-warm.ts` (new), `src/lisp/runtime.ts`,
`src/plot/expr.ts`, `src/plot/gnuplot.ts`, `src/plot/build-svg.ts`,
`scripts/sw-test.mjs` (new), `scripts/plot-test.mjs`,
`scripts/browser-smoke.mjs`, `package.json`, `.github/workflows/ci.yml`,
`README.md`, `src/components/docs/Faq.tsx`,
`src/components/docs/FeatureMatrix.tsx`.
