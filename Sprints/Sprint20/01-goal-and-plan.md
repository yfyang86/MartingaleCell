# Sprint 20 — Goal and plan

Date: 2026-09-10 · Branch: `sprint20` → PR into `dev` · Follows `Sprints/Sprint19/04-next-sprint.md`

## Goal

Put the browser scenarios under CI without slowing every push, keep the
session box's input history across reloads, and make the per-buffer
editor state visible as folds.

## Scope (from the Sprint 19 proposal: AS + AU, AV if time)

### AS. Smoke in CI behind a label (small-medium)
A second job in `.github/workflows/ci.yml`, `smoke`, runs only on pull
requests carrying the `smoke` label (the workflow also listens to the
`labeled` event, on which only the smoke job runs). It installs
Playwright 1.56 with Chromium, builds, serves `pnpm preview --port 4173`,
waits for the port, runs `node scripts/browser-smoke.mjs`, and uploads
`dist/smoke-*.png` as an artifact when it fails. The `check` job stays
the merge gate; the smoke job is opt-in per PR. This sprint's PR carries
the label, so the job is exercised before it merges.

### AU. Session-box history persists (small)
The ↑/↓ history of the session input moves from a component ref into the
workspace store (`sessionHistory`, capped at 100 entries, no adjacent
duplicates), is saved with the workspace and restored by `hydrate`, and
is cleared with the workspace reset. The push/recall rules become pure
functions in `src/session/history.ts` with a Node test; the persistence
scenario of the browser smoke evaluates a form from the session box,
reloads, and recalls it with ↑.

### AV. Fold ranges per buffer (small, if time)
A `foldService` for Lisp (`src/editor/fold.ts`): the fold range of a
line is the outermost form that opens on that line and closes on a later
one, hidden from the end of the first line to just before the closing
paren, so `(defun sq (x)…)` stays readable. Strings, comments and
character literals are skipped with the search module's character
classifier. Fold gutter, the standard fold keymap (Ctrl+Shift+[ / ],
Ctrl+Alt+[ / ] for all), palette commands, and the fold state added to
the persisted per-buffer editor states so folds survive a tab switch and
a reload. Node checks for the range rules; a smoke check for fold →
switch → reload.

## Out of scope
Cell history view (AT); rebuilt WECL.

## Acceptance
- The `smoke` job runs on this PR (labelled) and passes; an unlabelled
  PR runs only `check`.
- After a reload, ↑ in the session box recalls the last submitted form.
- A fold made in a buffer is still there after switching tabs and after
  a reload.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
