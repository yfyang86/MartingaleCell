# Sprint 25 — Test and fix

Final state, all on this machine against the real image built from
sbcl `wasm-dev` (artifacts + .gz copies in gitignored public/sbcl/):

- `pnpm fetch:sbcl --gzip` — sbcl.wasm.gz 0.5 + sbcl.core.gz 13.3 +
  sbcl-core.wasm.gz 4.9 ≈ 18.7 MB over the wire.
- `pnpm test:sbcl` — PASS. Full sequence: warm-up eval, printed output,
  DIVISION-BY-ZERO with details, package persistence, cross-job defun,
  asd-ordered project load with markers, post-load acceptance,
  ;;READ-WAIT stdin round trip, **with-timeout → :TIMEOUT**, **debug
  pause + decline**, **runaway recursion → CONTROL-STACK-EXHAUSTED**,
  **interrupt request acknowledged by the port**, **package-install +
  modules snapshot/restore + package-list**, clean exit.
- `node scripts/browser-smoke.mjs --only sbcl` — PASS (3 checks) after
  the COOP/COEP and shared-view fixes; SBCL boot ≈5 s warm.
- `pnpm lint`, `pnpm build` clean; the whole `pnpm test` chain (15
  harnesses) green.

The debug loop, for the record: the browser failure modes were
invisible to the Node harness because (a) Node allows SharedArrayBuffer
without isolation, (b) Node's TextDecoder accepts shared views, (c) the
BigInt import arguments only surface when a code path actually runs
(set_timer first fired with with-timeout, fd_readdir's cookie first
fired with package-install). Lesson banked: every new host-side surface
needs its own harness job the first time it's exercised.

Known limitations (honest list):
- Ctrl-C delivery to Lisp is a port limitation ("interrupt request seen
  … not implemented"); ConsCell interrupts by respawn, like ECL.
- `(directory …)` cannot enumerate (no sb-unix:unix-opendir in this
  port build) — the module copier uses the known project file list.
- SBCL on a static host needs COOP/COEP headers (vite dev/preview have
  them); without them the engine bootfails with a clear message and
  falls back to ECL.
- The gzip boot fetch itself was not re-timed precisely this sprint
  (≈5 s warm in the smoke, artifacts cached); a progress line for the
  fetch is still open.

## On landing (verification without the artifacts, 2026-09-10)

Checks run on `sprint25` in an environment without `public/sbcl/`
(the sbcl repository has no tags or releases to fetch the build from):

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Artifact loader on the modified worker | `node scripts/sbcl-artifact-test.mjs` | 9 / 9 |
| All Node suites | `pnpm test` | 14 pass; the SBCL harness skips (artifacts absent) |
| Real browser, all scenarios (ECL default, COOP/COEP headers on) | `SMOKE_CHROMIUM=… node scripts/browser-smoke.mjs --json dist/smoke-report.json` | 53 / 53 passed, `sbcl` skipped |
| Sample program on ECL | the pyramid `solve` (Chinese docstring and comments) evaluated in the IDE | `SOLVE`, then the path string of `(solve 4)` in 114 ms |

Fixes made while landing:

- **CI browser install.** The branch adds `playwright ^1.63` as a
  devDependency; the smoke script resolves that copy first, but the CI
  smoke job still installed a global 1.56.1 and its Chromium build, so
  the job would have failed with a missing executable. The job now runs
  `pnpm exec playwright install --with-deps chromium`.
- **`SMOKE_CHROMIUM`.** The smoke accepts a path to an installed
  Chromium (this container has 1.56's build only); the 1.63 driver ran
  the whole suite against it.

Not run here: the SBCL boot, `pnpm test:sbcl` against the image, and
the `sbcl` smoke scenario — the branch's own results above are the
record for those.

Sample program note: in `(solve 4)` the level-2 path contains
`(3,5,2) (3,2,2) (2,4,2)`, a revisit of `(3,2,2)` and a jump, which
comes from `(- c 2 off)` in the last `when` (c − 2 − off); `(+ c -2 off)`
is the neighbouring form's spelling and gives `(3,4,2)`. ECL and SBCL
agree on the string either way; the note is about the program, not the
engines.

CI on the pull request: pending.
