# Sprint 28 — Implementation notes

## BP. One story about the default engine
- `app/README.md`: the opening paragraph now says SBCL boots by default
  and ECL takes over when SBCL cannot boot or when chosen.
- `SettingsDrawer.tsx`: the hint under the control reads "auto: SBCL,
  then ECL, then JSCL, then the demo · ecl: ECL only · sbcl: SBCL/wasm,
  ECL if it cannot boot".
- `GettingStarted.tsx`: the lead describes the SBCL image (about 19 MB
  compressed) booting, with ECL as the fallback or the explicit choice.

## BQ. The bundled sample in every harness
`scripts/lib/sample-project.mjs` — `loadSampleProject()` tries
`SAMPLE_PROJECT_DIR`, then `/tmp/clplot/cl-plot-master`, then reads
`public/sample-projects/cl-plot.zip` in memory with `jszip` (already a
dependency) and returns the `.lisp`/`.asd` entries as `{ path,
content }`. `sbcl-test.mjs` awaits it once at the top; `boot-harness.mjs`
does the same when `--exercise` is given. The CI `check` job now runs
the ECL harness with `--exercise`, so cl-plot loads on both engines in
every run — nothing is extracted on the runner.

## BR. Smoke: the manual switch to SBCL
The `engine` scenario, after the `ecl` step, chooses `sbcl` and
restarts: SBCL boots with the download shown in the status bar. The
reload check now expects `sbcl` (and an SBCL boot); the reset check is
unchanged. Six checks.

## BS. No failed SBCL attempt on non-isolated hosts
`bootSbcl` throws before spawning when `crossOriginIsolated` is false,
naming the two headers; `init()`'s existing catch turns that into the
"SBCL/wasm boot failed … falling back to ECL" line and boots ECL. The
worker's own guard stays for hosts where the check is unavailable.

## BT. Version in one place
`vite.config.ts` reads `package.json` and defines `__APP_VERSION__`
(declared in `src/vite-env.d.ts`); `BootScreen` and the About entry use
it.

## Tests
- `node scripts/boot-harness.mjs --exercise` and `node
  scripts/sbcl-test.mjs` on a checkout with no `/tmp/clplot`: both load
  cl-plot from the zip and capture a plot.
- Browser smoke: `engine` +1 (63 checks in 10 scenarios).
