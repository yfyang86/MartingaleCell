# Sprint 32 — Test and fix log

## Checks run on `sprint32` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass; `dist/` carries `1.0.0-beta.0` (boot screen, About, `sw.js?v=`), no `alpha` string left in the bundle; `<title>` names SBCL & ECL |
| All Node suites (17) | `pnpm test` | all pass |
| Real browser, all scenarios | `pnpm preview` + `browser-smoke.mjs --json` | 71 / 71 in 11 scenarios (the `offline` scenario registers `sw.js?v=1.0.0-beta.0`) |
| Stale-wording sweep | `grep -rn alpha` outside `Sprints/` | only JSCL's own package version in its CDN URL |

CI on the pull request: https://github.com/yfyang86/ConsCell/pull/32 — green (run https://github.com/yfyang86/ConsCell/actions/runs/34987151690: `check` in 55 s, the labelled `smoke` job in 2 min 31 s), merged as `845a7eb`.
CI on the merge commit on `dev`: https://github.com/yfyang86/ConsCell/actions/runs/34987547115 — completed, both jobs green in 2 min 30 s wall time.

## Fixes made along the way

- **English README engine table**: three rows (interrupt, hosting
  requirement, quirks) had the SBCL and ECL columns swapped. The Ctrl-C
  limitation, the COOP/COEP requirement and the `(directory …)` / 30-bit
  fixnum quirks belong to SBCL; the zh-CN table already said so.
- **`app/README.md` engine section**: still described `auto` as "ECL,
  then JSCL, then the demo interpreter" and the runtime client as an
  ECL-first ladder; both now match `engine-pref.ts` (SBCL first).
- **Developer Manual**: claimed `test:sbcl-artifacts` checks the tracked
  `.gz` copies; it runs the gzip loader on synthetic data (its CI step
  says so). Reworded in both languages.
- **Developer Manual release process**: still told the releaser to
  update two hard-coded version strings that Sprint 28 removed.

## Noticed, not changed

- The plain (uncompressed) SBCL artifacts remain in early git history
  (~124 MB); the history rewrite stays undecided (Sprint 26, item BK)
  and is not part of the release.
- `RELEASE.md` assumes `main` as the release branch (it exists on the
  remote, untouched since the repo was created); Sprint 33 confirms it.
