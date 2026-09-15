# Sprint 31 — Test and fix log

## Checks run on `sprint31` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass; `dist/sw.js` present |
| Parser + evaluator + SVG builder | `node scripts/plot-test.mjs` | PASS: 33 checks |
| Session-box history rules | `node scripts/session-history-test.mjs` | PASS: 29 checks (5 new) |
| ECL harness, three-series script | `node scripts/boot-harness.mjs --exercise` | PASS: `sin(x)` drawn (two polylines, plain legend entry, no footnote) |
| SBCL harness, three-series script | `node scripts/sbcl-test.mjs` | PASS |
| All Node suites (17) | `pnpm test` | all pass |
| Real browser, all scenarios | `pnpm preview` + `browser-smoke.mjs --json` | 71 / 71 in 11 scenarios; `offline` 6 / 6 on its first run (ECL boots from the worker's cache, `crossOriginIsolated` true, a cell evaluates) |

CI on the pull request: https://github.com/yfyang86/ConsCell/pull/31 — green (run https://github.com/yfyang86/ConsCell/actions/runs/34982832501: `check` in 1 min 18 s, the labelled `smoke` job in 3 min 10 s with the new `offline` scenario), merged as `09bb13e`.
CI on the merge commit on `dev`: pending.

## Fixes made along the way

- **Type errors in the new evaluator and builder** (caught by `tsc`, not
  by the esbuild-bundled test, which had already passed): closures in
  the parser loops needed explicit `Fn` annotations to break TypeScript's
  circular inference, the token list needed a non-null binding for the
  nested parser functions, and the y-range collection over the sampled
  segments needed `flat(2)`. No behaviour change.

## Noticed, not changed

- The service worker does not precache the engine artifacts: the first
  boot still needs the network; from the second load on the artifacts
  are served from the cache. Precaching 19 MB at install would slow the
  first visit for every visitor.
- The evaluator treats every number as a float; gnuplot's integer
  division (`1/2 = 0`) is not reproduced. User-defined functions
  (`f(x) = …` lines) are not parsed either; both are listed for after
  the release.
- The `history` smoke check relies on the cells' inputs being the
  newest entries; a session where the box was used after the last
  buffer evaluation lists the box forms first, which the check expects.
