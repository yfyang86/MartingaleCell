# Sprint 4 — Goal and plan

Date: 2026-09-09 · Branch: `sprint4` → PR into `dev` · Follows `Sprints/Sprint3/04-next-sprint.md`

## Goal

Give the image a standard input, and make the debugger show what it knows
about a condition and offer the two restarts people actually reach for.

## Why

- `(read-line)`, `(read)` and `(y-or-n-p …)` fail today with a C-level
  "I/O error": `*standard-input*` is the Emscripten fd 0, which has no
  reader. Any interactive example is dead on arrival.
- Error cells show the condition's report and frames but not its slots:
  a `type-error` never says what the datum and the expected type were, an
  `undefined-function` makes you read the name out of the prose.
- The image establishes no restarts for `unbound-variable` /
  `undefined-function`, so the debugger can only RETRY or ABORT — the two
  most common mistakes in a REPL session have no "fix it and go on".

## Probed before writing code

- The `GRAY` package and `gray:fundamental-character-input-stream` exist
  in the image. A subclass whose `stream-read-char` refills its line buffer
  with `js-wait` satisfies `read-line`, `read` and `y-or-n-p` (the last one
  loops on garbage answers exactly like a terminal would).
- `*standard-input*` is a `FILE-STREAM`, `*terminal-io*` a
  `TWO-WAY-STREAM`, `*query-io*` a synonym to `*terminal-io*`.

## Scope

In:
1. **stdin.** A Gray stream `cc::%stdin` installed as `*standard-input*`
   and as the input half of `*terminal-io*` at bootstrap. When its buffer
   runs dry it prints `;;READ-WAIT` and suspends on
   `js-wait "__ccReadWait()"`; the page answers `{type:'input', id, text}`
   (text `null` = end of file, delivered as a `#\Eot` sentinel). Runtime:
   `onInputRequest`, `provideInput(jobId, text|null)`. Cell: status
   `input`, an inline prompt with Enter to send and an EOF link; the line
   is echoed into the OUT well.
2. **Condition details.** `;;DETAIL: key|value` lines at signal time for
   `type-error` (datum, expected), `cell-error` (name), `arithmetic-error`
   (operation, operands), `package-error`, `file-error`, `stream-error`.
   Shown under the condition text in paused and error cells; carried in
   `EvalResult.details`.
3. **Set-and-retry restarts.** `eval-one` adds two `:test`-guarded restarts:
   `STORE-VALUE` for `unbound-variable` (set the variable, retry the form)
   and `DEFINE-FUNCTION` for `undefined-function` (bind the function to a
   lambda or function name, retry the form). Only offered when the
   condition matches.
4. Tests: `scripts/stdin-test.mjs` (CI), new cases in `debugger-test.mjs`,
   a `read-line` step in the browser smoke test. Docs and README fixes.

Out: project loads through the debugger; re-pausing on a nested error
inside a chosen restart; mock/JSCL rung decisions; entry-chunk diet.

## Acceptance

- Harness: `(read-line)` returns the page's line; `(read)` reads a form
  across a line boundary; `(y-or-n-p)` accepts `y`; EOF ends a
  `read-line` loop; a prompt printed before the read reaches stdout first.
- Harness: a `type-error` carries datum/expected details; an
  `unbound-variable` offers STORE-VALUE and a value resumes the form; an
  `undefined-function` offers DEFINE-FUNCTION and a lambda resumes it;
  neither is offered for other conditions.
- Browser: typing into the cell prompt completes a `(read-line)`.
- Lint/build/CI green; merged into `dev`.
