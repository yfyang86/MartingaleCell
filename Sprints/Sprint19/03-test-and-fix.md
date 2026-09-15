# Sprint 19 — Test and fix log

## Checks run on `sprint19` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Editor state rules, persistence, cache | `node scripts/editor-state-test.mjs` | 21 / 21 (3 new) |
| Session export + import | `node scripts/transcript-test.mjs` | 38 / 38 |
| Search, replace, apply order | `node scripts/search-test.mjs` | 26 / 26 |
| Outline scanner + project merge | `node scripts/outline-test.mjs` | 9 / 9 |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader + definitions + values | `node scripts/debugger-test.mjs` | 55 / 55 |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| Performance floor | `node scripts/perf-test.mjs` | 7 / 7 |
| Real browser, all scenarios (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 39 / 39 in 7 scenarios, 2 min 6 s |
| One scenario alone | `node scripts/browser-smoke.mjs --only definitions` | 10 / 10 in 16 s |

Scenario times (headless Chromium, this container): debugger 15.5 s,
stdin 14.9 s, definitions 16.5 s, transcript 17.1 s, persistence 31.5 s
(two boots), replace 17.6 s, landing 13.3 s.

## Fixes made along the way

- **Flash selector.** The rewritten definitions scenario waited for
  `.cc-cell .ring-2` (a descendant) instead of `.cc-cell.ring-2` (the
  cell itself), swallowed the timeout, and then read the flashed cell
  after the 1.2 s flash had ended. Fixed to the original selector; the
  scenario then passed alone and in the full run — the first time
  `--only` earned its keep.
- **Transcript scenario content.** The export checks used to find
  "resumed via USE-VALUE" and the stdin value from earlier steps; the
  scenario now makes its own cells (an aborted division, a list value)
  and checks for those.

## Noticed, not changed

- `persistence` boots the image twice (a reload is the point), so it is
  the slowest scenario; splitting it would only move the second boot.
- Scenarios run sequentially in one browser; running them in parallel
  contexts would cut the wall time but share one CPU with seven wasm
  images — not obviously faster here.

## CI

Pull request: https://github.com/yfyang86/ConsCell/pull/19

CI on the pull request: green — job "lint · build · wasm tests" run 34457447358 completed successfully on `ca14d74` in 61 s (https://github.com/yfyang86/ConsCell/actions/runs/34457447358). Merged into `dev` as `a399d8e`.
