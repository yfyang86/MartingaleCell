# Sprint 1 — Goal and plan

Date: 2026-09-09 · Branch: `sprint1` → PR into `dev`

## Goal

Make the session behave like a real Common Lisp REPL with respect to packages,
and get the tree lint-clean so a CI gate can be introduced and stay green.

## Why these two

- **`in-package` does not survive across cells.** Verified against the real
  ECL image: `(defpackage :foo (:use :cl)) (in-package :foo) (defun bar () 42)`
  in one cell, then `(bar)` in the next cell, fails with
  `The function BAR is undefined` and `*package*` is back to `COMMON-LISP-USER`.
  The worker's `cc:eval-string` rebinds `*package*` with `let` for every job,
  so the `setq` performed by `in-package` is discarded when the job ends.
  The toolbar package pill is purely cosmetic: it never reaches the worker.
- **Lint fails with 34 errors and 2 warnings.** Most are React Compiler rules
  and fast-refresh rules firing on generated shadcn files, but several are
  real: an ESLint `/* global */` directive hidden in a comment, a reference to
  an uninstalled rule, `any` types in the runtime layer, and a hook that reads
  a function before its declaration. Until lint is green there is no
  meaningful "green" for a merge gate.

## Scope

In:
1. Worker: persist `*package*` across `cc:eval-string` calls; print a
   `;;PACKAGE: <name>` marker at the end of every eval job.
2. Runtime client: parse the marker into `EvalResult.package`; expose a
   `setPackage(name)` method; reset to `CL-USER` on restart.
3. Store/UI: the package pill follows the runtime; picking a package in the
   toolbar switches the runtime; `Clear session` no longer lies about the
   package.
4. Lint: zero errors, zero warnings, with `public/` and `src/components/ui/`
   excluded from the fast-refresh rule rather than rewritten.
5. Regression test that runs the real wasm image in Node
   (`scripts/package-test.mjs`) plus `pnpm test` / `pnpm test:boot` scripts.
6. GitHub Actions workflow running lint, build, boot harness and the package
   test on every PR and on pushes to `dev`.

Out (next sprint candidates, see `04-next-sprint.md`):
- Real debugger restarts (USE-VALUE / CONTINUE) — needs a pause protocol.
- Wiring the five dead settings (print length, eval mode, heap, verbosity,
  auto-eval on save).
- Bundle splitting, README, package rename.

## Acceptance criteria

- `node scripts/package-test.mjs` passes: after `(in-package :foo)` in job 1,
  job 2 sees `*package*` = FOO and can call `bar`; a `;;PACKAGE: FOO` marker
  arrives on job 1 and `;;PACKAGE: COMMON-LISP-USER` after `(in-package :cl-user)`.
- `pnpm lint` exits 0 with no warnings.
- `pnpm build` passes.
- `node scripts/boot-harness.mjs` still reaches `ready`.
- CI workflow is green on the PR; PR merges into `dev`.

## Plan

| Step | Work | Evidence |
|---|---|---|
| 1 | Write this plan | this file |
| 2 | Worker + runtime + store changes for packages | `02-implementation.md` |
| 3 | Lint cleanup, file by file | `02-implementation.md` |
| 4 | Regression test, CI workflow, run everything locally | `03-test-and-fix.md` |
| 5 | Plan Sprint 2 | `04-next-sprint.md` |
| 6 | PR `sprint1` → `dev`, merge when CI is green | PR link in `03-test-and-fix.md` |
