# Sprint 20 — Implementation notes

## AS. Smoke in CI behind a label

`.github/workflows/ci.yml` gains a second job, `smoke`, next to `check`:

| | `check` | `smoke` |
|---|---|---|
| Runs on | every PR event except `labeled`; pushes to `dev` | PR events where the PR carries the `smoke` label |
| Steps | lint, build, six pure-TS tests, six wasm harnesses | install, `npm install -g playwright@1.56.1` + `playwright install --with-deps chromium`, build, `pnpm preview --port 4173` in the background (a curl loop waits for it), `node scripts/browser-smoke.mjs` |
| On failure | — | `dist/smoke-*.png` uploaded as the `smoke-screenshots` artifact |
| Timeout | 15 min | 20 min |

The workflow now listens to `pull_request` types `opened, synchronize,
reopened, labeled`. Adding the label fires a `labeled` event on which
only the smoke job runs (`check` is skipped for that event, so labelling
does not cancel or repeat the gate); a later push runs both. Playwright
is installed globally because the smoke resolves it from `npm root -g`
when it is not in `node_modules` — the same path as the local runs. The
`check` job is still the only merge gate; the smoke is opt-in per PR.
This sprint's PR carries the label (see the test log).

## AU. Session-box history persists

`src/session/history.ts` holds the rules that used to live in the REPL
component's ref:

- `pushHistory(history, text)` — newest first, trimmed, blank ignored,
  an immediate repeat not duplicated, capped at 100.
- `recallStep(history, { idx, text, atStart }, dir)` — the ↑/↓ cursor:
  ↑ only from the start of a single-line input (or once walking), ↓
  back to a live empty input; `null` means the key falls through to the
  editor.
- `sanitizeHistory(raw)` — restore from persisted data: strings only,
  trimmed, adjacent repeats collapsed, capped.

The workspace store keeps `sessionHistory` (persisted with the
workspace, restored in `hydrate`, cleared by `resetWorkspace`) and
exposes `pushSessionHistory`; `SessionPanel` submits through it and
recalls through `recallStep`, keeping only the cursor in a ref.

## AV. Fold ranges per buffer

`src/editor/fold.ts` — `foldRangeForLine(src, lineFrom, lineTo, cls?)`:
the fold of a line is the outermost form that opens on that line and
closes on a later one; it hides from the end of the opening line to just
before the closing paren, so `(defun sq (x)…)` reads as one line with
its paren. Forms on the line that close on the same line are skipped
(`(one) (defun two ()` folds `two`); parens inside strings, `;` and
`#| |#` comments are skipped through the search module's
`classifyChars`, and `#\(` / `#\)` are skipped by a two-character
look-behind (the classifier keeps character literals as code, which the
search wants). An unbalanced form has no fold; a fold that would hide
only whitespace is not offered. `lispFoldService` wraps it as a
CodeMirror `foldService`, classifying each document version once
(WeakMap on `state.doc`) since the gutter asks for every visible line
on every update.

`EditorPanel` adds the service, `foldGutter` (▾ / ▸), `foldKeymap`
(Ctrl+Shift+[ / ] fold and unfold at the caret line, Ctrl+Alt+[ / ] all),
and `foldState` to the persisted per-buffer fields next to the undo
history, so a fold survives a tab switch (already the case, since the
whole `EditorState` is stashed) and now a reload. Palette: "Fold form at
line", "Unfold form at line", "Fold all forms", "Unfold all forms" under
Buffer. Theme: a dim gutter marker and a pill-shaped placeholder.

## Tests

- `scripts/session-history-test.mjs` (20 checks): push, recall in both
  directions with the fall-through cases, restore.
- `scripts/fold-test.mjs` (18 checks): range rules on text, the service
  through a real `EditorState` (`foldable`, `foldEffect`), the fold
  state through `toJSON` / `fromJSON`, and a fold moving with an edit
  above it.
- Browser smoke, `persistence` scenario (+4 checks): fold in buffer 2 →
  gone on buffer 1, back on buffer 2; a form submitted from the session
  box; after the reload, ↑ recalls it, the fold is still there, and
  Ctrl+Shift+] opens it.
- Both Node tests are in `pnpm test` and in the `check` job.

## Docs and README

Shortcuts: a fold row under Editor. Editor section: folds named with
the per-buffer state, and the reload card mentions folds and the
session-box history. README: the `smoke` label, the test list, the
smoke header comment in the script.
