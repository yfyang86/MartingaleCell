# Sprint 24 — Test and fix log

## Checks run on `sprint24` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| SBCL artifact loader on synthetic gzip data (new) | `node scripts/sbcl-artifact-test.mjs` | 9 / 9 |
| Cell lineage + line diff + token diff (+5) | `node scripts/lineage-test.mjs` | 28 / 28 |
| SBCL harness without artifacts | `node scripts/sbcl-test.mjs` | skips with exit 0 |
| All other Node suites (12) | `pnpm test` | all pass — unchanged counts |
| Real browser, all scenarios | `pnpm preview` + `node scripts/browser-smoke.mjs --json dist/smoke-report.json` | 53 / 53 passed, `sbcl` skipped (artifacts absent); report written |
| One scenario alone | `node scripts/browser-smoke.mjs --only history` | 9 / 9 in 21 s |

Not run: the SBCL engine against the real image (artifacts not
available here); the `sbcl` smoke scenario's boot path.

CI on the pull request: https://github.com/yfyang86/ConsCell/pull/24 — pending.

## Fixes made along the way

- **Value text with the diff inside.** The smoke read the values of the
  history view from the cells' text; with the token diff rendered in a
  changed cell, `2` read as `23` (deleted `2` + added `3`). The plain
  value is now on a `data-value` attribute and the smoke reads that.
- **`--only` without the flag.** `argv[argv.indexOf('--only') + 1]`
  is `argv[0]` when the flag is absent, so the first full run with
  `--json` failed with "unknown scenario: --json". Parsed only when the
  flag is present. This would have broken the CI smoke job's new
  invocation.

## Noticed, not changed

- The gzip path is verified on synthetic data through the worker's
  own functions, but the first real boot from `.gz` copies (112 MB
  inflated in the worker before instantiation) is still to be timed
  when the artifacts exist; a "booting… N MB" progress line (the
  Sprint 23 proposal's other half of AX) can follow that measurement.
- The `sbcl` smoke scenario waits up to 180 s for the boot; the real
  boot time will set a tighter timeout.
