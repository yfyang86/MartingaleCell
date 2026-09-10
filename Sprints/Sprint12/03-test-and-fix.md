# Sprint 12 — Test and fix log

## Checks run on `sprint12` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Outline scanner + project merge | `node scripts/outline-test.mjs` | 9 / 9 (2 new) |
| Session export + import | `node scripts/transcript-test.mjs` | 31 / 31 |
| Search matcher | `node scripts/search-test.mjs` | 14 / 14 |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader + definitions + values | `node scripts/debugger-test.mjs` | 53 / 53 (2 new) |
| stdin (two expectations rewritten), settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| Performance floor | `node scripts/perf-test.mjs` | 7 / 7 |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 23 / 23 (reload check rewritten for freshness) |

## Fixes made along the way

- **Harness expectations for two-valued forms.** `(read-line)` returns
  the line and a missing-newline flag; the stdin harness compared
  against the joined `;;=> "hello, page" NIL`. Two checks now look for
  both lines. No other harness (package-manager and persistence tests
  included) compared a joined value line.
- **Restored project definitions without a project.** The Sprint 11
  index restore brought back project-load definitions even when no
  project was open; with the project section now scanning real files,
  those would have been rows pointing at files that cannot open. Pruned
  at hydrate when `kind` is null.

## Noticed, not changed

- The freshness rule matches by canonical name inside one buffer; two
  `defun`s of the same name in a buffer resolve to the first.
- Replace-in-workspace (K) is still open.

## CI

Pull request: https://github.com/yfyang86/ConsCell/pull/12

CI on the pull request: green — job "lint · build · wasm tests" run 34424803490 completed successfully on `cd2d44f` in 65 s (https://github.com/yfyang86/ConsCell/actions/runs/34424803490). Merged into `dev` as `d86a306`.
