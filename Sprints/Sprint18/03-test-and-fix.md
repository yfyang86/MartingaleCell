# Sprint 18 — Test and fix log

## Checks run on `sprint18` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Editor state rules + persistence | `node scripts/editor-state-test.mjs` | 18 / 18 (6 new) |
| Session export + import | `node scripts/transcript-test.mjs` | 38 / 38 (3 new) |
| Search, replace, apply order | `node scripts/search-test.mjs` | 26 / 26 |
| Outline scanner + project merge | `node scripts/outline-test.mjs` | 9 / 9 |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader + definitions + values | `node scripts/debugger-test.mjs` | 55 / 55 |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| Performance floor | `node scripts/perf-test.mjs` | 7 / 7 |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 33 / 33 (1 new) |
| Stale-build guard | touch a source, run the smoke | exit 2 with both timestamps; runs after `pnpm build` |

## Fixes made along the way

- **Patch anchors.** Two attempts to patch `EditorPanel` failed on exact
  text matches (indentation changed by the Sprint 14 hoist; the mount
  lines are in a different order than remembered) and the file was left
  untouched, so one smoke run tested the previous build — and, this
  time, said so: the stale-build guard was not yet in that run, but the
  new reload check failed exactly where the missing code would have
  acted. Re-applied with regex anchors.

## Noticed, not changed

- Persisting serialises every stashed document on each switch; with
  many large buffers that is a few hundred kilobytes per switch. Fine
  for now; a per-buffer dirty flag would trim it.
- The welcome animation and a restored state are mutually exclusive by
  design (first visit has nothing to restore).

## CI

Pull request: https://github.com/yfyang86/ConsCell/pull/18

CI on the pull request: to be recorded after the run.
