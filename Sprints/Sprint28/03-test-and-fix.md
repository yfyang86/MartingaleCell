# Sprint 28 — Test and fix log

## Checks run on `sprint28` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| ECL harness with the sample from the zip (no `/tmp/clplot`) | `node scripts/boot-harness.mjs --exercise` | PASS: cl-plot load + gnuplot capture + SVG |
| SBCL harness with the sample from the zip | `node scripts/sbcl-test.mjs` | PASS incl. jobs 113–115 (cl-plot, `;;PLOT64`, clean shell error) |
| All Node suites (16) | `pnpm test` | all pass |
| Real browser, all scenarios | `pnpm preview` + `browser-smoke.mjs --json` | 63 / 63 in 10 scenarios; `engine` 6 checks incl. the restored sbcl step |

CI on the pull request: https://github.com/yfyang86/ConsCell/pull/28 — pending.

## Fixes made along the way

None: every check passed on its first run after the changes.

## Noticed, not changed

- The two review items left out on purpose: multi-series plot data
  files (`%plot-data-paths` takes the first quoted path per `plot` line,
  identically in both workers) and the licence wording in the root
  README; both are listed for Sprint 29.
- With the sample now read from the zip, `SAMPLE_PROJECT_DIR` remains
  the override for a modified local copy.
