# Sprint 5 — Test and fix log

PR: https://github.com/yfyang86/ConsCell/pull/5 (`sprint5` → `dev`)

## Local verification

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger (extended: nested + loads) | `node scripts/debugger-test.mjs` | 36 / 36 |
| stdin (Sprint 4) | `node scripts/stdin-test.mjs` | 17 / 17 |
| Settings + condition reporting (Sprint 2) | `node scripts/settings-test.mjs` | 13 / 13 |
| in-package (Sprint 1) | `node scripts/package-test.mjs` | 10 / 10 |
| cl-plot load + gnuplot capture | `boot-harness.mjs --exercise` | pass |
| Package manager | `pkg-mgr-test.mjs` | pass |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 10 / 10 |

## Fixes made during testing

- **Stale base.** The `sprint5` branch was first cut from a local `dev`
  that had never been fast-forwarded after the Sprint 4 merge (the
  Sprint 4 report claimed it had). Caught before any code was written:
  local `dev` fast-forwarded to `origin/dev`, the Sprint 4 CI record
  committed there, and the branch re-cut. The Sprint 4 record commit also
  carried this sprint's plan file — harmless, docs only.
- **Worker hang from a helper bug.** The first load loop used a
  nonexistent `go-on` operator; the resulting `undefined-function` escaped
  `load-project`, reached the top of `wecl_eval`, and put the image in the
  ECL debugger waiting for a terminal — the harness timed out on
  ABORT-LOAD. Fixed the loop (`if` instead of `when` + skip), and added
  `guardTopLevel` so any future helper-library bug is reported as
  `;;ERROR: internal:` rather than hanging the worker.

## CI

- CI run on PR head `c8fc266`: **success** — https://github.com/yfyang86/ConsCell/actions/runs/34368663873 (lint · build · wasm tests, 67 s).
- Merged into `dev` as `9c34811` via merge commit.
