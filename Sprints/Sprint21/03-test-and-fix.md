# Sprint 21 — Test and fix log

## Checks run on `sprint21` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Cell lineage rules (new) | `node scripts/lineage-test.mjs` | 16 / 16 |
| Session-box history rules (+ filter) | `node scripts/session-history-test.mjs` | 24 / 24 |
| Lisp fold ranges | `node scripts/fold-test.mjs` | 18 / 18 |
| Editor state rules | `node scripts/editor-state-test.mjs` | 21 / 21 |
| Session export + import | `node scripts/transcript-test.mjs` | 38 / 38 |
| Search, replace | `node scripts/search-test.mjs` | 26 / 26 |
| Outline scanner | `node scripts/outline-test.mjs` | 9 / 9 |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader + definitions + values | `node scripts/debugger-test.mjs` | 55 / 55 |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| Performance floor | `node scripts/perf-test.mjs` | 7 / 7 |
| Real browser, all scenarios | `pnpm preview` + `pnpm smoke:browser` | 48 / 48 in 8 scenarios (new `history`: 5) |
| One scenario alone | `node scripts/browser-smoke.mjs --only history` | 5 / 5 in 17 s |

CI on the pull request: pending.
The `smoke` job on the merge commit on `dev`: pending.

## Fixes made along the way

- **Helper used before its declaration.** The Ctrl+R close handler
  (a `useCallback`) referenced `setText`, a const declared later in the
  component; the React compiler lint flagged it. `setText` does not
  touch component state, so it moved to module level.
- **Value text is split.** The smoke waited for the text `;;=> 1`, but
  the marker and the value are separate spans, so no element carries
  that text. The scenario now reads the last matching cell's text with
  whitespace stripped and looks for `;;=>1`.
- **Modal exit animation.** After `In [2]` the view was still counted
  during its exit animation, failing the "closed" half of the check;
  the scenario waits for the modal to detach first.

## Noticed, not changed

- A plain re-run of a cell evaluated from `scratch.lisp` records the
  cell's `bufferName`, so the `;;DEF:` markers are still emitted; the
  definition callback drops them because the origin has no buffer id.
  Harmless, but the marker work could be skipped for re-runs.
- The history view shows every run; a cell re-run hundreds of times
  would get a wide table. Horizontal scrolling handles it; a "last 10"
  cut-off is an easy follow-up if it ever matters.
