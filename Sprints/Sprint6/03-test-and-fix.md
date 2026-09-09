# Sprint 6 — Test and fix log

PR: https://github.com/yfyang86/ConsCell/pull/6 (`sprint6` → `dev`)

## Local verification

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader (extended) | `node scripts/debugger-test.mjs` | 41 / 41 |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| cl-plot load + gnuplot capture | `boot-harness.mjs --exercise` | pass |
| Package manager | `pkg-mgr-test.mjs` | pass |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 11 / 11 |

## Fixes made during testing

- **First definition pointed at the file's header comment.** `peek-char t`
  skips whitespace only; the reader consumes `;` comments. `%skip-blank`
  now skips comment lines too, so `TWICE` in the test file sits at byte 29,
  not 0.
- **Harness name clash.** A local `byName` for definitions shadowed the
  restart helper of the same name in the same function (temporal dead
  zone). Renamed.
- **F12 smoke expectation.** The jump lands on the start of the defining
  form (column 1), which is the intended target; the test expected the
  symbol's column.
- **Probe hygiene.** Two probe runs "hung" for minutes and a `pkill`
  pattern matched its own shell line again. Neither was the image: the
  first was the interpreter's speed (30 M iterations ≈ 40 min), the second
  my own command. Numbers are in `02-implementation.md` §5.

## CI

- CI run on PR head: _pending; recorded on merge_.
