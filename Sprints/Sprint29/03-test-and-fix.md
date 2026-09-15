# Sprint 29 — Test and fix log

## Checks run on `sprint29` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| ECL harness incl. the new two-series job 105 | `node scripts/boot-harness.mjs --exercise` | PASS: both data files shipped, parser sees `a:lines:2 b:points:2` |
| SBCL harness incl. the new two-series job 116 | `node scripts/sbcl-test.mjs` | PASS: both path strings and both file bodies in the payload, no title shipped as a file |
| All Node suites (16) | `pnpm test` | all pass |
| Real browser, all scenarios | `pnpm preview` + `browser-smoke.mjs --json` | 63 / 63 in 10 scenarios; SBCL boot 5.3 s |
| Boot-cache spike | scratch Playwright script, 3 boots | numbers in `02-implementation.md`; decision: no cache |

CI on the pull request: pending.

## Fixes made along the way

- **The PR head had no `check` result.** The `check` job skipped on
  `labeled` events (`if: … action != 'labeled'`), and the `smoke` label
  added seconds after opening started a run that, through
  `cancel-in-progress`, cancelled the opened run before its `check` job
  began. Run 121 (opened) was cancelled, run 122 (labeled) ran only the
  smoke job. The `if` is gone: the labelled run supersedes the opened
  one and carries both jobs, so nothing is lost by the cancel. Pushed
  as the second commit on this PR.
- Everything else passed on its first run. The harness jobs were
  written to fail on the old helper (the SBCL payload check requires
  the `"/tmp/cc-two-b.dat"` string, which the first-quoted-path rule
  never shipped).

## Noticed, not changed

- `pnpm test:boot` runs the ECL harness without `--exercise`; the
  two-series check therefore runs in CI's explicit `--exercise` step
  and in `pnpm test:sbcl`, not in the plain `pnpm test:boot`.
- A series with no data file (`plot sin(x)`, `plot "" using 1:3`) is
  still parsed as an empty series and drawn as nothing; listed for
  Sprint 30 (BX).
- The measurement script is not part of the repo; the table in the
  implementation notes is the record.
