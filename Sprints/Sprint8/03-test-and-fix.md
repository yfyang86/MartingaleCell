# Sprint 8 — Test and fix log

## Checks run on `sprint8` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass; entry chunk 594 → 403 kB |
| Session export (new) | `node scripts/transcript-test.mjs` | 20 / 20 |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader | `node scripts/debugger-test.mjs` | 46 / 46 (5 new block-comment checks; 2 of them fail on the old worker) |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| Performance floor | `node scripts/perf-test.mjs` | 7 / 7 |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 14 / 14 (3 new: export download, its content, landing page after code-splitting) |
| Example outputs | scratch harness on the real image | `how-fast` rows within 10 % of the expected output; fib-rec 25 = 0.69 s |

## Fixes made along the way

- **Unread after peek.** The first draft of the `#` branch in `%skip-blank`
  used `unread-char` after `peek-char`; the standard forbids consecutive
  unreads and ECL's file streams enforce it. Replaced by saving and
  restoring `file-position`, which the loader already uses for offsets.
- **A form starting with `#` is not a comment.** `#+ecl (defun …)`,
  `#'car` and `#.` must keep the prefix's offset (the reader consumes the
  prefix as part of the form). The harness covers both; the fix restores
  the position rather than skipping the character.
- **Fence collisions.** A value that prints triple backticks would close
  a Markdown fence early; fences are now one backtick longer than the
  longest run in the text (harness case).
- **`btoa` is Latin-1.** Plot SVGs carry `×`, `≤` and titles in any
  script; the data URI uses a small UTF-8 base64 encoder instead, checked
  against `Buffer` in the test.
- **Lenis on unmount before load.** With the scroll effects imported on
  demand, navigating to `/ide` before the import resolved would create a
  Lenis instance with no cleanup. A `cancelled` flag guards the `then`.
- **Fib example expected output.** It claimed 0.284 s; the image does
  0.69 s (stock image: 17 s). Replaced with the measured number.

## CI

Pull request: https://github.com/yfyang86/ConsCell/pull/8

CI on the pull request: green — job "lint · build · wasm tests" run 34381341377 completed successfully on `ffa1af4` in 53 s (https://github.com/yfyang86/ConsCell/actions/runs/34381341377). Merged into `dev` as `6d07b57`.
