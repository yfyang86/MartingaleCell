# Sprint 14 — Test and fix log

## Checks run on `sprint14` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Search, replace, apply order | `node scripts/search-test.mjs` | 26 / 26 (3 new) |
| Outline scanner + project merge | `node scripts/outline-test.mjs` | 9 / 9 |
| Session export + import | `node scripts/transcript-test.mjs` | 31 / 31 |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader + definitions + values | `node scripts/debugger-test.mjs` | 55 / 55 |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| Performance floor | `node scripts/perf-test.mjs` | 7 / 7 |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 27 / 27 (2 new: undo isolation, redo after a switch) |

## Fixes made along the way

- **Redo in the smoke.** `Control+Shift+z` reaches CodeMirror as a
  lowercase `z` with Shift, and CodeMirror tries the unshifted binding
  first for character keys — that is undo, not redo (the same mechanism
  as the Sprint 9 Ctrl+Shift+F note). The smoke presses Ctrl+Y instead,
  which is redo in CodeMirror's default history keymap; real browsers
  send an uppercase `Z` and reach redo either way.

No code fix was needed: the per-buffer states and the extracted apply
loop passed the harnesses and the smoke on the first run.

## Noticed, not changed

- A stashed state is restored only when its document still equals the
  store; a buffer edited while it was not shown (a replace through the
  store) comes back with a fresh state and no history for the edits made
  before — the alternative (replaying the change into the stashed state)
  would keep the history but is more code than the case deserves now.

## CI

CI on the pull request: to be recorded after the run.
