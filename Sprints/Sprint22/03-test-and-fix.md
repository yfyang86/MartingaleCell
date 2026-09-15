# Sprint 22 — Test and fix log

## Checks run on `sprint22` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Session export + import (+3) | `node scripts/transcript-test.mjs` | 41 / 41 |
| Cell lineage + line diff (+7) | `node scripts/lineage-test.mjs` | 23 / 23 |
| Lisp fold ranges (+5) | `node scripts/fold-test.mjs` | 23 / 23 |
| Session-box history rules | `node scripts/session-history-test.mjs` | 24 / 24 |
| Editor state rules | `node scripts/editor-state-test.mjs` | 21 / 21 |
| Search, replace | `node scripts/search-test.mjs` | 26 / 26 |
| Outline scanner | `node scripts/outline-test.mjs` | 9 / 9 |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader + definitions + values | `node scripts/debugger-test.mjs` | 55 / 55 |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| Performance floor | `node scripts/perf-test.mjs` | 7 / 7 |
| Real browser, all scenarios | `pnpm preview` + `pnpm smoke:browser` | 52 / 52 in 8 scenarios |
| One scenario alone | `node scripts/browser-smoke.mjs --only history` | 8 / 8 in 21 s |

CI on the pull request: https://github.com/yfyang86/ConsCell/pull/22 — green (run https://github.com/yfyang86/ConsCell/actions/runs/34470448312: `check` in 56 s, the labelled `smoke` job in 1 min 21 s), merged as `d1a47ab`.
CI on the merge commit on `dev` (BC): https://github.com/yfyang86/ConsCell/actions/runs/34470623760 — completed, both jobs green (`check` 1 min 6 s, `smoke` 1 min 51 s); this docs commit starts no run, so that run stands.

## Fixes made along the way

None needed: every new check passed on its first run after the
implementation, in Node and in the browser.

## Noticed, not changed

- With `paths-ignore: Sprints/**` on the push trigger, the record-CI
  docs commit on `dev` has no run of its own; the merge commit before it
  is the one to read. The sprint loop's "record the CI run" step now
  points at that run.
- The import's stand-in root (when cell m is missing from a partial
  transcript) keeps the group together but the chips then read
  `run 1/N` from the first imported run, not from m. Acceptable for a
  partial export; noted in case the heading should carry m's input.
- `foldTopLevelForms` skips a form that already has a fold anywhere
  inside it (an inner fold counts), so it never double-folds; unfolding
  the inner fold first makes it foldable again.
