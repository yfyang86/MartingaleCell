# Sprint 26 — Test and fix log

## Checks run on `sprint26` before the PR

| Check | Command | Result |
|---|---|---|
| Lint | `pnpm lint` | 0 errors, 0 warnings |
| Type-check + build | `pnpm build` | pass |
| Tracked artifacts | `git ls-files app/public/sbcl` | the three `.gz` files only |
| SBCL harness from `.gz` only (plain files moved away) | `node scripts/sbcl-test.mjs` | PASS, whole job sequence |
| Session export + import (+6, `.lisp` round trip) | `node scripts/transcript-test.mjs` | 47 / 47 |
| Smoke summary formatter (new) | `node scripts/smoke-summary-test.mjs` | 6 / 6 |
| All Node suites (16) | `pnpm test` | all pass |
| Real browser, all scenarios | `pnpm preview` + `browser-smoke.mjs --json` | 57 / 57 in 9 scenarios, none skipped; `sbcl` boots in 21 s |
| Summary render | `node scripts/smoke-summary.mjs dist/smoke-report.json` | the table above the failures section, slowest `persistence` 34 s |

CI on the pull request: https://github.com/yfyang86/ConsCell/pull/26 — pending.

## Fixes made along the way

- **First section dropped.** Both transcript parsers split on the
  section header and dropped the first element, which is the preamble
  in an exported file but the first cell in a hand-made one. The Node
  check for the exporter's `(in-package …)` caught it; the drop is gone.
- **Regex spaces.** The project-row pattern had three literal spaces;
  the lint rule wants `{3}`.
- **Palette after a file chooser.** The `.lisp` export via the palette
  never fired because the previous import had left the palette open and
  Ctrl+K closed it. The helper now waits for the palette input and
  presses again when needed.
- **Resolution wording.** The new check looked for "resumed via ABORT"
  (the transcript's wording); the cell shows "resolved via ABORT".

## Noticed, not changed

- Warnings in the `.lisp` transcript are one line each, so a multi-line
  warning imports as several warnings; the Markdown form keeps them
  together. Acceptable for a comments-only format.
- The plain artifacts remain in history (`38dcbdd`); a clone still
  downloads them until the history is rewritten.
