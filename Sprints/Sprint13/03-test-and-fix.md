# Sprint 13 — Test and fix log

## Checks run on `sprint13` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Search matcher + replace | `node scripts/search-test.mjs` | 23 / 23 (9 new) |
| Outline scanner + project merge | `node scripts/outline-test.mjs` | 9 / 9 |
| Session export + import | `node scripts/transcript-test.mjs` | 31 / 31 |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader + definitions + values | `node scripts/debugger-test.mjs` | 55 / 55 (2 new) |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| Performance floor | `node scripts/perf-test.mjs` | 7 / 7 |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 25 / 25 (2 new) |

## Fixes made along the way

- **Wrapped values were two things.** Before this sprint a long list
  value printed over ten lines: the first became the value and the other
  nine went into the output block. Confirmed on the real image with the
  scratch harness, then fixed by binding `*print-pretty*` off for the
  value print only.

No other fixes were needed; the replace panel and the smoke passed on
the first run.

## Noticed, not changed

- Replacing in the editor's buffer and then in an unopened project file
  changes the active buffer to the opened file; the editor swaps the
  document with a dispatch, so Ctrl+Z after that undoes the swap first
  (pre-existing behaviour of the swap effect, not of replace).
- Replace previews use the same expansion as the pure function but are
  computed per visible row; a regex with catastrophic backtracking would
  be slow in both.

## CI

Pull request: https://github.com/yfyang86/ConsCell/pull/13

CI on the pull request: green — job "lint · build · wasm tests" run 34425388799 completed successfully on `6387933` in 68 s (https://github.com/yfyang86/ConsCell/actions/runs/34425388799). Merged into `dev` as `d70b997`.
