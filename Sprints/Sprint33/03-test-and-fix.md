# Sprint 33 — Test and fix log (the release record)

## Verification of the release candidate (`dev` at `0921c6c` = `release/1.0.0-beta.0` minus the plan doc)

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass; `dist/sw.js` present, bundle carries `1.0.0-beta.0` |
| All Node suites (17) | `pnpm test` | all pass |
| ECL harness with the cl-plot sample | `node scripts/boot-harness.mjs --exercise` | PASS |
| Real browser, all scenarios | `pnpm preview` + `browser-smoke.mjs --json` | 71 / 71 in 11 scenarios; SBCL boot 6.8 s |
| Upgrade check (RELEASE.md §5) | scratch Playwright script | PASS: alpha cache dropped, only `conscell-1.0.0-beta.0`, worker `sw.js?v=1.0.0-beta.0`, fresh profile boots SBCL with the version shown |

Engine artifacts shipped (sizes and SHA-256): see `release-notes.md`.

## CI

- On the release pull request: https://github.com/yfyang86/ConsCell/pull/33 — green (run https://github.com/yfyang86/ConsCell/actions/runs/34990301701 on `fc15ed9`: `check` in 1 min 16 s, the labelled `smoke` job in 2 min 37 s). The opened-event run 134 completed its check job successfully before the labelled run superseded it.
- Merged into `main` as `c4c0b3e`; tag `v1.0.0-beta.0` points at it. The workflow runs on pushes to `dev` only, so the merge commit on `main` has no run of its own; its content is the PR head plus the merge.
- On `dev` after the bump to `1.0.0-beta.1` (`0f30b3e`): https://github.com/yfyang86/ConsCell/actions/runs/34990886901 — completed, both jobs green in 2 min 44 s wall time.

## Fixes made along the way

None.

## Noticed, not changed

- The GitHub release object is created by hand from the tag with
  `release-notes.md` as its body; the tag and the notes are in place.
- The concurrency group did not cancel the opened-event run before its
  check job finished this time (run 134 ran to completion and was then
  marked cancelled); harmless, and the labelled run 135 carried both
  jobs as intended since Sprint 29.
