# Sprint 2 — Test and fix log

PR: _filled in below once opened_ (`sprint2` → `dev`)

## Local verification

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass; chunks below |
| Boot the real image | `node scripts/boot-harness.mjs` | ready in 0.8 s |
| in-package regression (Sprint 1) | `node scripts/package-test.mjs` | 10 / 10 |
| settings + condition reporting (new) | `node scripts/settings-test.mjs` | 13 / 13 |
| restart spike (proof, not a gate) | `node scripts/restart-spike.mjs` | 5 / 5 |
| cl-plot load + gnuplot capture | `boot-harness.mjs --exercise` | pass |
| Package manager | `pkg-mgr-test.mjs` | 7 / 7 |

### Bundle after code splitting (gzip)

| Chunk | Before | After |
|---|---|---|
| entry `index` | 469 kB (everything) | 196 kB |
| `Ide` | — | 221 kB (CodeMirror, runtime client, plots) |
| `Docs` | — | 25 kB |
| `Examples` + data | — | 18 kB |

The entry chunk is still dominated by framer-motion, gsap and lenis used by
the landing page; trimming that is a separate, cosmetic task.

## What the probes established (before writing code)

- `(funcall (compile nil '(lambda () …)))` works in the wasm image, for
  defuns as well as calls → compile mode is safe to offer.
- `si::ihs-top` / `si::ihs-fun` / `si::compiled-function-name` are present;
  inside a `handler-bind` handler the frames for `(caller 0)` → `(boom 0)`
  are `CALLER`, `BOOM` plus infrastructure frames (`SI:BYTECODES`,
  `CC::EVAL-ONE`, `CC:EVAL-STRING`) that are filtered.
- `*print-length*` set via `setf` persists across jobs (it is a global, and
  `eval-string` does not rebind it).
- `js-wait` awaits a promise and needs an object with `.text()`; resolving
  with a plain value throws inside the Asyncify handler and takes the whole
  worker down (crash, not a Lisp error). The production protocol must always
  resolve with `{ text: () => string }`.

## Fixes made during testing

- **First backtrace probe showed nothing.** The `handler-bind` was *outside*
  `ignore-errors`, so the inner `handler-case` unwound first and the outer
  handler never ran. Nesting corrected; this is also why a user's own
  `handler-case` suppresses the markers (test 11) — which is the desired
  behaviour.
- **`js-read*` takes an argument.** The first spike attempt called it with
  none ("wrong number of arguments"). `js-wait` was used instead; `js-read*`
  is documented as the alternative.
- **Wasm crash on a bare promise value.** See above; the spike script
  resolves with a `.text()` object and the note is in the Sprint 3 plan.

## CI

- CI run on PR head: _pending; recorded on merge_.
