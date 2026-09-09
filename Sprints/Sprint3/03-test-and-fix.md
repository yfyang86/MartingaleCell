# Sprint 3 — Test and fix log

PR: https://github.com/yfyang86/ConsCell/pull/3 (`sprint3` → `dev`)

## Local verification

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass (IDE chunk 223 kB gzipped, entry unchanged) |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger protocol (new) | `node scripts/debugger-test.mjs` | 19 / 19 |
| Settings + condition reporting (Sprint 2) | `node scripts/settings-test.mjs` | 13 / 13 |
| in-package (Sprint 1) | `node scripts/package-test.mjs` | 10 / 10 |
| **Real browser** (new, not in CI) | `pnpm preview` + `pnpm smoke:browser` | 8 / 8 |

### Browser smoke test (headless Chromium via Playwright)

The Node harnesses drive the worker in a `vm` sandbox; the smoke test drives
the *built app* in a real browser: boots ECL, evaluates `(/ 1 0)` with
Ctrl+Enter, sees the cell pause in the debugger with RETRY and ABORT, picks
ABORT with the `1` key and sees the resolution line; then evaluates a
`restart-case` with USE-VALUE, clicks the row, types `21` into the value
input, and sees `42` with "resumed via USE-VALUE"; then checks the package
pill follows `(in-package :smoke)`. Screenshots: `smoke-paused.png` and
`smoke-resumed.png` next to this file.

## What the probes established (before writing code)

- The image offers **no** restarts of its own for top-level errors:
  undefined function, unbound variable, division by zero and type errors
  all show an empty `compute-restarts` list. ABORT and RETRY therefore come
  from `eval-one`'s own `restart-case`.
- A `handler-bind` handler sees the user's `restart-case` restarts first
  (innermost), then ours — the order the cell shows.

## Fixes made during testing

- **RETRY looped forever in the harness.** RETRY re-runs the failing
  *top-level form*, and the test's counter increment was a sibling form, so
  the retried `(if …)` could never succeed. Test rewritten with a `progn`;
  the behaviour was right.
- **`pnpm test:boot` was broken since Sprint 1.** `boot-harness.mjs` parsed
  its timeout as `Number(argv[indexOf('--timeout-ms') + 1])`, which is
  `NaN` when the flag is absent, so the timeout fired immediately. CI passed
  because it always passed the flag. Fixed to default to 90 s.
- **Real bug found by the browser test: typing during the welcome animation
  garbled the buffer and never reached the store.** On a first visit the
  editor types the welcome text character by character (~3 s). While that
  ran, the update listener ignored *every* document change and the
  animation kept appending characters after whatever the user had typed.
  The smoke test typed right after boot, got `(/ 1 0)to WASM.`-style
  buffers, and "evaluate all" ran the store's stale welcome code. Fix in
  `EditorPanel.tsx`: the animation's transactions carry a CodeMirror
  annotation; any other change stops the animation and is written to the
  store, so the user always wins.
- **Browser smoke test: setting the buffer.** Keyboard select-all chords
  were unreliable in headless Chromium (Playwright reads `Control+A` as
  Ctrl+Shift+a). The helper now dispatches through CodeMirror's own view,
  reached from the content node's `cmTile.view` (6.43 tile renderer).
- **Browser smoke test: Ctrl+Enter evaluates the form at point only.** The
  two-form package step uses Ctrl+Shift+Enter (evaluate all).

## CI

- CI run on PR head: _pending; recorded on merge_.
