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

CI on the pull request: https://github.com/yfyang86/ConsCell/pull/28 — green (run https://github.com/yfyang86/ConsCell/actions/runs/34975851459: `check` in 1 min 15 s, the labelled `smoke` job in 2 min 22 s), merged as `65a3792`. The merge also carried two commits the user had pushed to `dev` meanwhile: `81215c2` (SBCL/wasm build synced with master) and `7e08125` (a trap after ready posts `crash`, not `bootfail`); the PR was mergeable clean against them.
CI on the merge commit on `dev`: https://github.com/yfyang86/ConsCell/actions/runs/34976326330 — completed, both jobs green (`check` in 1 min 19 s, `smoke` in 2 min 26 s, 63 / 63 checks). The merged `dev` was also verified here: lint 0 errors, build, all 16 Node suites and the full browser smoke (63 / 63, SBCL boot in 5.3 s) pass.

## Fixes made along the way

None: every check passed on its first run after the changes.

## Noticed, not changed

- The two review items left out on purpose: multi-series plot data
  files (`%plot-data-paths` takes the first quoted path per `plot` line,
  identically in both workers) and the licence wording in the root
  README; both are listed for Sprint 29.
- With the sample now read from the zip, `SAMPLE_PROJECT_DIR` remains
  the override for a modified local copy.
