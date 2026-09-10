# Sprint 15 — Test and fix log

## Checks run on `sprint15` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Session export + import + value limit | `node scripts/transcript-test.mjs` | 35 / 35 (4 new) |
| Search, replace, apply order | `node scripts/search-test.mjs` | 26 / 26 |
| Outline scanner + project merge | `node scripts/outline-test.mjs` | 9 / 9 |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader + definitions + values | `node scripts/debugger-test.mjs` | 55 / 55 |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| Performance floor | `node scripts/perf-test.mjs` | 7 / 7 |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 29 / 29 (2 new, 1 rewritten) |

## Fixes made along the way

- **`setCode` and long buffers.** The smoke helper compared the editor's
  DOM text with what it had set; for a 300-line buffer the DOM holds
  only the visible lines, so the check failed although the edit was
  fine. It compares against the document model now. Every earlier use
  was short enough to fit the viewport, which is why it never showed.
- **Scroll test route.** A first draft switched buffers through search
  hits, which place the caret and scroll to it — not a restore test.
  Switching through the tab bar keeps the caret where it was, so the
  restored offset is the stashed one.

## Noticed, not changed

- The restored scroll is applied on the next animation frame; a very
  fast switch away and back again within that frame is guarded (the
  frame checks the shown buffer) but simply skips the restore.

## CI

Pull request: https://github.com/yfyang86/ConsCell/pull/15

CI on the pull request: to be recorded after the run.
