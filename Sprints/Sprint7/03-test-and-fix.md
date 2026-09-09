# Sprint 7 — Test and fix log

PR: _filled in below once opened_ (`sprint7` → `dev`)

## Local verification

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Boot the real image | `node scripts/boot-harness.mjs` | ready, "fast setjmp trampolines installed" at 0.1 s |
| Performance floor (new) | `node scripts/perf-test.mjs` | 7 / 7 (61 / 55 / 127 ms against floors of 400 / 400 / 600) |
| Debugger + loader | `node scripts/debugger-test.mjs` | 41 / 41 |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| cl-plot load + gnuplot capture | `boot-harness.mjs --exercise` | pass |
| Package manager + persistence | `pkg-mgr-test.mjs`, `pkg-persist-test.mjs` | pass |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 11 / 11 |

## Fixes made during testing

- **Worker failed to load: "Cannot assign to read only property 'JSTag'".**
  The first shim copied a list of names from the real `WebAssembly`
  namespace onto the prototype-inheriting object; `JSTag` is read-only and
  the assignment threw at worker start, so every harness failed before
  boot. The copy loop was removed — inheritance already provides them.
- **The first spike did not use the worker.** The experiment lived in a
  probe that intercepted instantiation itself; once the numbers were in,
  the same mechanism moved into `wecl-worker.js` so every consumer (page,
  every harness, CI) gets it and the floor test can guard it.

## CI

- CI run on PR head: _pending; recorded on merge_.
