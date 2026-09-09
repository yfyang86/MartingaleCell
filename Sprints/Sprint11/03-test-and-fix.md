# Sprint 11 — Test and fix log

## Checks run on `sprint11` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Outline scanner (new) | `node scripts/outline-test.mjs` | 7 / 7 |
| Session export + import | `node scripts/transcript-test.mjs` | 31 / 31 |
| Search matcher | `node scripts/search-test.mjs` | 14 / 14 |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader + eval definitions | `node scripts/debugger-test.mjs` | 51 / 51 |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| Performance floor | `node scripts/perf-test.mjs` | 7 / 7 |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 23 / 23 (3 new: outline rows, outline click, persisted index after a reload) |

## Fixes made along the way

None needed this sprint: the scanner test and the smoke passed on the
first run after the build. The first-run pass is partly because the
scanner leans on the Sprint 9 `classifyChars` and the panel on the
Sprint 9/10 jump helpers, all of which already had tests.

## Noticed, not changed

- The outline's buffer section comes from a text scan and the tick from
  the index; both are by name, so two `defun`s of the same name in one
  buffer are both ticked once either is evaluated.
- Values containing spaces are still split by the output parser (noted
  in Sprint 10).

## CI

Pull request: https://github.com/yfyang86/ConsCell/pull/11

CI on the pull request: to be recorded after the run.
