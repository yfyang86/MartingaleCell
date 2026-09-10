# Sprint 16 — Test and fix log

## Checks run on `sprint16` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Editor per-buffer state rules (new) | `node scripts/editor-state-test.mjs` | 9 / 9 |
| Session export + import + value limit | `node scripts/transcript-test.mjs` | 35 / 35 |
| Search, replace, apply order | `node scripts/search-test.mjs` | 26 / 26 |
| Outline scanner + project merge | `node scripts/outline-test.mjs` | 9 / 9 |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader + definitions + values | `node scripts/debugger-test.mjs` | 55 / 55 |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| Performance floor | `node scripts/perf-test.mjs` | 7 / 7 |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 31 / 31 (2 new) |

## Fixes made along the way

- **History grouping in the fixture.** The first run of the editor test
  counted one undo step where two edits had been made: CodeMirror's
  history merges adjacent typing within 500 ms into one event, and in
  Node every edit is within 500 ms of the previous one. The fixture's
  `history()` uses `newGroupDelay: 0`; the rules under test were right.
- **Active buffer after "Open as buffer".** The new smoke check leaves
  the freshly opened `cell-1.lisp` buffer active, and the later reload
  check edits "the active buffer" expecting the first one. The check
  now switches back to the first tab before moving on — a test-order
  dependency, not an app bug.

## Noticed, not changed

- "Open as buffer" reuses an existing `cell-N.lisp` only when its
  content still equals the cell input; an edited one gets a second
  buffer of the same name. A cell ↔ buffer link (proposed) would settle
  this.

## CI

Pull request: https://github.com/yfyang86/ConsCell/pull/16

CI on the pull request: green — job "lint · build · wasm tests" run 34432796071 completed successfully on `e17f339` in 61 s (https://github.com/yfyang86/ConsCell/actions/runs/34432796071). Merged into `dev` as `69a9870`.
