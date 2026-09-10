# Sprint 17 — Test and fix log

## Checks run on `sprint17` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Editor per-buffer state rules + scroll guard | `node scripts/editor-state-test.mjs` | 12 / 12 (3 new) |
| Session export + import + value limit | `node scripts/transcript-test.mjs` | 35 / 35 |
| Search, replace, apply order | `node scripts/search-test.mjs` | 26 / 26 |
| Outline scanner + project merge | `node scripts/outline-test.mjs` | 9 / 9 |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader + definitions + values | `node scripts/debugger-test.mjs` | 55 / 55 |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| Performance floor | `node scripts/perf-test.mjs` | 7 / 7 |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 32 / 32 (1 new) |

## Fixes made along the way

- **Tab JSX.** The `[N]` badge was added as a second sibling inside a
  ternary branch; wrapped in a fragment. Caught by lint/tsc before any
  run.
- **`mergeSources` type.** The new `cell` origin did not fit the search
  module's buffer type, and `tsc -b` refused the build — so the first
  smoke run silently tested the previous build (the failure it showed
  was the link not existing). The type now accepts any origin with an
  optional path. Lesson recorded: check the build result before reading
  a smoke result.
- **Cell text off-screen.** The new check read `innerText` of the last
  cell, which is empty under `content-visibility: auto` when the cell
  is below the fold; it reads `textContent` now (the same trap as the
  Sprint 10 wait, from the other side).

## Noticed, not changed

- A linked cell's "Copy cell" and transcript export still use the
  recorded input, not the buffer's current text — arguably right (the
  transcript records what ran), but worth a chip in the transcript.

## CI

Pull request: https://github.com/yfyang86/ConsCell/pull/17

CI on the pull request: to be recorded after the run.
