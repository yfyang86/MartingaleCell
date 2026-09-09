# Sprint 4 — Test and fix log

PR: _filled in below once opened_ (`sprint4` → `dev`)

## Local verification

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| stdin (new) | `node scripts/stdin-test.mjs` | 17 / 17 |
| Debugger (extended) | `node scripts/debugger-test.mjs` | 27 / 27 |
| Settings + condition reporting (Sprint 2) | `node scripts/settings-test.mjs` | 13 / 13 |
| in-package (Sprint 1) | `node scripts/package-test.mjs` | 10 / 10 |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 10 / 10 |

## What the probes established

- `GRAY` and `gray:fundamental-character-input-stream` exist in the image;
  `*standard-input*` is a `FILE-STREAM`, `*terminal-io*` a `TWO-WAY-STREAM`,
  `*query-io*` a synonym stream.
- A Gray stream refilled through `js-wait` satisfies `read-line`, `read`
  and `y-or-n-p`. The first probe of `y-or-n-p` looped forever — correctly:
  the fake page kept answering "hello from page", which is neither Y nor N.

## Fixes made during testing

- **Prompts arrived after the wait marker.** Emscripten's TTY layer holds a
  partial line ("Name? ") until a newline. `%flush-out` now asks the worker
  (`__ccFlush`, via synchronous `js-eval`) to `fsync` every TTY before a
  `;;READ-WAIT` or `;;DEBUG:` marker is printed. Test 2 and 4 now assert
  the prompt precedes the marker.
- **STORE-VALUE reported "Restart … is not active".** `invoke-restart`
  re-checks the restart's `:test` with NIL; the tests now accept NIL as well
  as the matching condition type.
- **EOF semantics.** A first version kept EOF for the life of the image, so
  the *next* cell's `read-line` returned `:eof` immediately. `eval-string`
  now resets the stream per job (no sticky EOF, no leftover line — test 6/7).
- **Test expectations.** `read-line` at EOF returns two values
  (`:STILL-EOF T`); `(car 5)` signals `SIMPLE-TYPE-ERROR` expecting `CONS`.

## CI

- CI run on PR head: _pending; recorded on merge_.
