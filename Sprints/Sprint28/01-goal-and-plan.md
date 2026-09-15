# Sprint 28 — Goal and plan

Date: 2026-09-15 · Branch: `sprint28` → PR into `dev` · From the code review of `9e0e3b8..b4a0ee9` (items 1–4 and 7)

## Goal

Make the alpha's documentation say one thing about the default engine,
guard the cl-plot-on-SBCL path in CI, restore the smoke coverage of the
manual switch to SBCL, spare non-isolated hosts a failed SBCL attempt on
every boot, and keep the version string in one place.

## Scope

### BP. One story about the default engine (small)
`app/README.md`'s opening paragraph, the hint under Settings → Lisp
implementation, and the docs site's getting-started lead all still
describe ECL as the engine that boots. They now describe the alpha
ladder: SBCL first, ECL when it cannot boot or when chosen, then JSCL,
then the demo interpreter.

### BQ. The bundled sample in every harness (small)
A shared `scripts/lib/sample-project.mjs` returns the cl-plot files
from `SAMPLE_PROJECT_DIR`, from the conventional `/tmp/clplot` extract,
or — new — by reading `public/sample-projects/cl-plot.zip` in memory
with `jszip` (already a dependency). The SBCL harness's cl-plot jobs and
the ECL harness's `--exercise` therefore run in CI, where nothing is
extracted.

### BR. Smoke: the manual switch to SBCL (small)
The `engine` scenario keeps its default-SBCL and `ecl` steps and adds
the step that was dropped: choose `sbcl` from an ECL session, Restart,
SBCL boots with the download in the status bar; the reload check then
expects `sbcl`.

### BS. No failed SBCL attempt on non-isolated hosts (small)
`bootSbcl` checks `crossOriginIsolated` before spawning: when the page
lacks COOP/COEP the boot log gets one line naming the headers and the
ladder moves on to ECL without a worker spawn and a `bootfail`.

### BT. Version in one place (small)
Vite defines `__APP_VERSION__` from `package.json`; the boot screen and
the About entry read it.

## Acceptance
- The three texts agree with `engine-pref.ts`.
- `pnpm test:sbcl` and `node scripts/boot-harness.mjs --exercise` load
  cl-plot on a clean checkout (no `/tmp/clplot`).
- The `engine` scenario has the `sbcl` step back and passes.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
