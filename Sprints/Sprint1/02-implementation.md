# Sprint 1 — Implementation notes

## 1. `in-package` persistence (the REPL bug)

### Root cause
`cc:eval-string` in `app/public/wecl-worker.js` wrapped every job in
`(let ((*package* …)) …)`. `in-package` expands to a `setq` of `*package*`,
which lands in that dynamic binding and is discarded when the `let` exits.
The `*eval-package*` defvar that was meant to carry the package between jobs
was never written to. The toolbar pill only changed a string in the Zustand
store and never talked to the worker.

### Worker (`app/public/wecl-worker.js`)
- `eval-string` still rebinds `*package*` per job (a reader error can never
  leave the image half-switched), but now copies the binding back into
  `*eval-package*` when the job ends and prints one marker:
  `;;PACKAGE: <label>`.
- `%package-label` returns the shortest name/nickname of the package, so the
  pill reads `CL-USER` rather than `COMMON-LISP-USER`.
- Protocol comment at the top of the worker documents the new marker.

### Runtime client (`app/src/lisp/runtime.ts`, `types.ts`)
- `EvalResult.package` carries the marker for the job that produced it.
- `LispRuntime.currentPackage` mirrors the live image and resets to `CL-USER`
  on every `booting` / `ready-*` transition (boot, restart, interrupt respawn).
- `runtime.setPackage(name)` runs `(in-package "NAME")` as a hidden job (no
  session cell) and resolves with the job result. On the JSCL/mock rungs it
  only tracks the label, since those engines have no package system.
- The `;;PACKAGE:` line is consumed before it reaches stdout, like `;;PLOT64`.

### Store and UI
- `store/evaluate.ts` — `OUT_MARKER_RE` now also hides `;;PACKAGE:`; after a
  cell finishes, `result.package` updates the pill and logs a DEBUG line.
- `store/workspace.ts` — `clearCells` no longer resets the package to
  `CL-USER`: clearing the transcript does not change what the image reads in.
- `components/ide/actions.ts` — `switchPackage(name)`: calls
  `runtime.setPackage`, toasts and logs when the package does not exist, and
  trusts the package the image reports over the one clicked.
- `components/ide/Toolbar.tsx` — the pill's candidate list now includes the
  live package, packages a loaded project defined, and every `(defpackage …)`
  in an open buffer (also matching `#:name` and `"NAME"` designators).
  Clicking an entry switches the runtime.
- `pages/Ide.tsx` — the engine-status subscription also syncs the pill from
  `runtime.currentPackage`, so a restart or interrupt shows `CL-USER` again.

## 2. Lint cleanup (34 errors, 2 warnings → 0 / 0)

Real problems in project code:
- `pages/Ide.tsx` — a comment beginning `/* global …` is an ESLint globals
  directive; the words were being reported as unused globals. Reworded.
  The `bootDone` local state set inside an effect is now derived in the
  workspace store (`setEngine` flips `bootDone` on the first `ready-*`).
  Removed a stale `eslint-disable` directive.
- `components/ide/Cell.tsx` — `chooseRestart` was read by an effect before
  its declaration; it is now a `useCallback` declared first and listed in
  the effect's dependencies (the old `eslint-disable` went away with it).
- `components/ide/CommandPalette.tsx` — the palette body is now a child
  component mounted only while open, so query/cursor state starts fresh
  without effect-driven `setState`; cursor reset happens in the change
  handler.
- `hooks/use-mobile.ts` — initial value read synchronously in the `useState`
  initialiser; the effect only subscribes.
- `plot/SvgPlot.tsx` — removed a disable comment for a rule that is not
  installed (`react/no-danger`).
- `lisp/jscl-engine.ts` — a typed `JsclApi` interface replaces `any`;
  `catch (e: unknown)`.
- `components/ide/cl-language.ts` — `tokenTable` is typed
  `Record<string, Tag>` and set inside the `StreamParser` literal (the
  interface already declares it) instead of two `any` casts.
- `components/ide/actions.ts` — `import.meta.glob<{ EXAMPLES?: unknown }>`
  replaces `any`.
- `prefer-const` in `lisp/mock.ts` and `components/docs/cl-highlight.tsx`.

Fast-refresh rule (`react-refresh/only-export-components`) in project code —
helpers moved out of component modules rather than suppressed:
- `components/docs/motion.ts` — `EASE_OUT`, previously exported from
  `shared.tsx`; nine docs sections import it from the new module.
- `components/examples/ClCode.tsx` — `ClCode` and `ClCodeBlock`, previously
  exported from `highlight.tsx`, which is now helpers only.
- `components/ide/actions.ts` — `jumpToPosition` and `selectEnclosingForm`
  moved here from `EditorPanel.tsx` (they use the same registered editor
  view); `Cell.tsx` and the editor keymap/context menu import from actions.
- `components/ide/LispCode.tsx` — `tokenizeLisp` had no external users; it is
  module-private now.

ESLint config (`app/eslint.config.js`):
- `public/` is ignored: the worker and the third-party WECL glue are served
  verbatim and are not part of the TypeScript app (this removed the "unused
  eslint-disable" warning on the worker).
- `src/components/ui/**` (generated shadcn/ui) has the fast-refresh rule and
  the two React Compiler rules it trips (`set-state-in-effect`, `purity`)
  turned off. Vendored code follows upstream patterns; every other rule
  still applies there.

## 3. Test scripts and CI

- `app/scripts/package-test.mjs` — boots the real worker + wasm in a Node
  `vm` sandbox and runs six jobs asserting the package contract (10 checks).
- `app/scripts/pkg-mgr-test.mjs`, `pkg-persist-test.mjs` — now honour
  `SAMPLE_PROJECT_DIR` like the boot harness instead of a hardcoded `/tmp`
  path.
- `app/package.json` scripts: `test`, `test:boot`, `test:package`,
  `test:modules`, `check` (lint + build + test).
- `.github/workflows/ci.yml` — on every PR and on pushes to `dev`: install,
  lint, build, boot harness, package regression test. Ubuntu, Node 22,
  pnpm 10, about a minute.
