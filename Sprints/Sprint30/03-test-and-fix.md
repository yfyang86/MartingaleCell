# Sprint 30 — Test and fix log

## Checks run on `sprint30` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Parser + SVG builder (new suite) | `node scripts/plot-test.mjs` | PASS: 15 checks |
| ECL harness with the three-series script | `node scripts/boot-harness.mjs --exercise` | PASS: only the two data files ship; parser `a:lines:2 b:points:2 s:function:0`; SVG names `sin(x)` as not drawn |
| SBCL harness with the three-series script | `node scripts/sbcl-test.mjs` | PASS: both files in the payload, neither a title nor `sin(x)` shipped as a file |
| All Node suites (17) | `pnpm test` | all pass |
| Real browser, all scenarios | `pnpm preview` + `browser-smoke.mjs --json` | 64 / 65 on the first run (see below), then `--only landing` 4 / 4 after the fix; 65 checks in 10 scenarios |

CI on the pull request: https://github.com/yfyang86/ConsCell/pull/30 — green (run https://github.com/yfyang86/ConsCell/actions/runs/34980562637: `check` in 1 min 17 s with the new `plot-test` step, the labelled `smoke` job in 2 min 29 s with the docs checks), merged as `f051cae`. Both jobs ran on the labelled run, as the Sprint 29 workflow fix intended.
CI on the merge commit on `dev`: pending.

## Fixes made along the way

- **Smoke selector for the docs sidebar.** The new `landing` check
  looked for `a[href$="#engines"]`; the sidebar renders `<button>`s
  that scroll on click, so the count was 0 and the check failed while
  the engine table (6 rows) was found. The check now counts the button
  whose text is "Engines". Application code was not touched; the
  landing scenario was rerun on the same build.

## Noticed, not changed

- Function series are named, not drawn. Drawing the common expressions
  needs a small evaluator; listed for Sprint 31 (BY).
- The FAQ now says there is no service worker; adding one is Sprint
  31's BZ candidate.
- `plot "a" u 1:2 title "x, y"`: the comma inside the quoted title no
  longer splits the series (covered by `plot-test` check 1); the
  workers' `%plot-line-paths` never split on it either, since it only
  looks for quotes after a comma.
