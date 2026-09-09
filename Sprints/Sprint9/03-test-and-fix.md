# Sprint 9 — Test and fix log

## Checks run on `sprint9` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass; entry chunk 403 → 275 kB |
| Search matcher (new) | `node scripts/search-test.mjs` | 14 / 14 |
| Session export | `node scripts/transcript-test.mjs` | 20 / 20 |
| Boot the real image | `node scripts/boot-harness.mjs` | ready |
| Debugger + loader + eval definitions | `node scripts/debugger-test.mjs` | 51 / 51 (5 new in section P) |
| stdin, settings, in-package | the three harnesses | 17, 13, 10 — all pass |
| Performance floor | `node scripts/perf-test.mjs` | 7 / 7 |
| Real browser (not in CI) | `pnpm preview` + `pnpm smoke:browser` | 17 / 17 (3 new: cross-buffer F12 on an evaluated defun, Ctrl⇧F hit count, click-to-jump) |

## Fixes made along the way

- **Ctrl+Shift+F and CodeMirror.** With the caret in the editor,
  Playwright's `Control+Shift+f` reached the window handler with
  `defaultPrevented` set: CodeMirror's keymap tries the unshifted name
  first for character keys (`Ctrl-f`, its in-buffer search), so a key
  event carrying a lowercase letter plus Shift can never reach a
  `Mod-Shift-f` binding — an explicit editor binding was added and
  verified not to help for that event shape. Real browsers report
  `key: "F"` for Shift+F, and that shape opens the workspace search
  whether the editor has focus or not (verified in Chromium; the smoke
  uses it). The lowercase-with-Shift shape only occurs with Caps Lock on;
  there Ctrl+Shift+F opens the in-buffer search instead. The editor
  binding stays: it makes the editor own the shortcut for the normal
  shape rather than relying on the window handler.
- **`set-state-in-effect`.** The panel's first draft called
  `setSearching(true)` synchronously in the debounce effect. State is now
  only set from the timer callback, and stale results are hidden by
  tagging each result set with its query instead of clearing state in
  the effect.
- **Whole-symbol boundaries.** `.` was missing from the symbol
  character class, so `plot` matched inside `plot.lisp`; added.
- **Test arithmetic.** Three of the first-run failures in
  `search-test.mjs` were miscounted columns in the fixture, not matcher
  bugs; the expectations now spell out the exact `path:line:col` lists.
- **Values render as two elements.** The smoke waited for the text
  `;;=> USE-IT`; the cell renders the marker and the value separately.
  It now waits for `USE-IT` exactly.
- **`eval-one` return value.** It returned `nil` on every path; a
  definition whose evaluation errored would have been indexed. It now
  returns `t` only after printing values.

## CI

Pull request: https://github.com/yfyang86/ConsCell/pull/9

CI on the pull request: to be recorded after the run.
