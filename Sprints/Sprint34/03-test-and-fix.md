# Sprint 34 — Test and fix log

## Checks run on `sprint34` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Parser + evaluator + SVG builder | `node scripts/plot-test.mjs` | PASS: 52 checks (19 new) |
| Service worker (new suite) | `node scripts/sw-test.mjs` | PASS: 18 checks |
| ECL harness with the sample | `node scripts/boot-harness.mjs --exercise` | PASS |
| All Node suites (18) | `pnpm test` | all pass |
| Real browser, all scenarios | `pnpm preview` + `browser-smoke.mjs --json` | 71 / 71 in 11 scenarios; `offline` 6 / 6 with the cache warmed after the first boot (10 / 10 chunks), SBCL boot 5.7 s |

CI on the pull request: https://github.com/yfyang86/ConsCell/pull/34 — green (run https://github.com/yfyang86/ConsCell/actions/runs/34997766124: `check` in 1 min 0 s with the new `sw-test` step, the labelled `smoke` job in 2 min 29 s), merged as `bc0412d`.
CI on the merge commit on `dev`: pending.

## Fixes made along the way

- **Offline reload after the first boot had no scripts.** The first
  offline run of the reworked `offline` scenario booted nothing: the
  engine artifacts were warmed, but the page's own hashed chunks and
  stylesheet had also been fetched before the worker controlled the
  page, so the cached `index.html` referenced files the cache did not
  have. `pageResourceUrls()` (the same-origin resource-timing entries
  plus `index.html`) joins the warm list.
- **Warmed entries never matched.** With the chunks in the cache the
  offline reload still failed; a diagnostic page load logged 504s from
  the worker for `index-*.js` and `index-*.css`. vite preview answers
  static files with `Vary: Origin`, Chromium sends an `Origin` header
  on the page's `crossorigin` module-script and stylesheet requests, and
  the warm had stored the entries from a plain fetch — the Cache API's
  `Vary` comparison rejected every match (a page-side `caches.match`
  probe with a `Request` object matched, because `Origin` is added only
  at fetch time, which is what made the miss look impossible at first).
  Every lookup now passes `{ ignoreVary: true }`; `sw-test` asserts it.
- **One chunk short.** A lazily loaded chunk appeared after the warm
  request had been sent (9 / 10 cached). `followLateResources()` warms
  new same-origin resources for a minute through a
  `PerformanceObserver`, and the smoke waits for full coverage instead
  of snapshotting.
- **Cache-first stored the response without awaiting it** and rejected
  `respondWith` on an offline miss; the store is awaited before
  answering and an offline miss answers 504. Both surfaced through the
  new Node suite.
- **Test fakes**: Node's `Response.type` is `default` where a browser
  says `basic`; the fake server sets `basic` and serves `index.html` for
  extension-less SPA routes, as a static host does. The plot test
  compiled a user function without passing the definitions.

## Noticed, not changed

- The warm list is the booted engine only; the fallback engine's
  artifacts are not cached until it boots (Sprint 35 candidate CM).
- Cross-origin resources (the Google Fonts stylesheet) are never
  cached; offline the page renders with the fallback font stack.
