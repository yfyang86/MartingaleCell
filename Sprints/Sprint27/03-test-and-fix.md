# Sprint 27 — Test and fix log

## Checks run on `sprint27` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| SBCL artifact loader (+2: streamed response, progress messages) | `node scripts/sbcl-artifact-test.mjs` | 11 / 11 |
| All Node suites (16, SBCL harness on the real image included) | `pnpm test` | all pass |
| Real browser, all scenarios | `pnpm preview` + `browser-smoke.mjs --json` | 63 / 63 in 10 scenarios (new `engine`: 5; `sbcl` +1) |
| ECL comes back | `engine` scenario: sbcl → Restart → ecl → Restart | `(lisp-implementation-type)` → `"ECL"`, preference `ecl` after reload, `auto` after Reset workspace |

CI on the pull request: pending.

## Fixes made along the way

- **Settings control never re-rendered.** `value={getEnginePref()}` read
  `localStorage` at render; a click changed storage, not state, so the
  control kept showing the old choice. It is now `settings.engine`.
- **Reset kept the engine.** The preference lived outside the workspace,
  so "Reset workspace" left `sbcl` in place. It resets with the settings
  now, and the smoke checks it.
- **Hydrate overwrote an old preference.** The first version of the
  mirror wrote the store's default over a `localStorage`-only `sbcl`
  (the pre-Sprint-27 way, and the smoke's init script), so the `sbcl`
  scenario booted ECL and timed out. Persisted settings without `engine`
  now adopt the stored preference instead.
- **Drawer close in the scenario.** The settings drawer closes from its
  backdrop or X, not Escape; and after "Reset workspace" the confirm
  modal sits above the drawer, so the scenario confirms first and leaves
  the drawer open for the storage check.

## Noticed, not changed

- Under CPU contention (the Node suite's SBCL harness running alongside
  the browser) the SBCL boot in the smoke can exceed its 180 s wait;
  run the two apart, as the CI jobs do.
- A restart while an evaluation is queued resolves those jobs as
  aborted, as before; the progress line does not mention them.
