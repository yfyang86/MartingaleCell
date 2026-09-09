# Sprint 8 — Goal and plan

Date: 2026-09-09 · Branch: `sprint8` → PR into `dev` · Follows `Sprints/Sprint7/04-next-sprint.md`

## Goal

Make the work of the last sprints visible and portable: the gallery shows
the real speed of the image, a session can leave the browser as a
transcript, and the definition index stops mislocating forms that follow
a block comment. If time allows, trim the landing page's entry chunk.

## Scope (from the Sprint 7 proposal: A + C + D, B if time)

### A. Examples that show the speed (small)
- Re-time the Fibonacci example on the current image and put the real
  numbers in its expected output.
- Add a "How fast is it?" example: a small `ms` macro and a loop table
  (empty loop, `incf`, function call, `loop collect`, hash table, sort,
  recursive fib), with the measured numbers as expected output.

Starting measurements (Node harness, real image, this branch):

| Form | Wall time |
|---|---|
| `fib-rec 25` (gallery example, `defun`) | 0.69 s |
| 100 000 × empty `dotimes` | 115 ms |
| 100 000 × `(incf n i)` | 330 ms |
| 100 000 × one function call | 254 ms |
| `(loop for i below 100000 collect i)` | 490 ms |
| 50 000 hash-table inserts | 140 ms |
| `sort` of 20 000 random fixnums | 171 ms |
| Sieve to 100 000 (bit vector) | 1.26 s |
| `compile nil` then fib 25 | 0.70 s (bytecodes: no gain) |

### C. `#|…|#` block comments in the offset probe (small)
`%skip-blank` skips whitespace and `;` lines before it records the
`file-position` of a form. A `#| … |#` comment (nested or not) before a
form is not skipped, so `;;DEF:` points at the comment and go-to-definition
lands on it. Fix in the worker; harness case in `debugger-test.mjs`
section O.

### D. Session export as a transcript (medium)
- `src/session/transcript.ts`: pure builders from `Cell[]` to
  - Markdown: one section per cell with the input as a `lisp` fence, OUT,
    `;;=>` values, warnings, error type/report/frames, the restart used,
    plots as inline SVG data-URI images, project cells as a file table.
  - `.lisp`: the input forms verbatim with results as `;;=>`/`;; OUT`
    comments, so the file loads back into the editor and evaluates.
- Entry points: command palette ("Export session as Markdown / as .lisp"),
  a download button on the session toolbar, and `Copy all` unchanged.
- A Node test (`scripts/transcript-test.mjs`) bundles the TypeScript with
  esbuild (already a dependency) and checks the output for a fixture with
  values, warnings, an error, a plot and a project cell. Added to
  `pnpm test` and CI.

### B. Entry-chunk diet (if time)
The entry chunk is 594 kB (196 kB gzip) because `Layout` imports Lenis
and gsap eagerly and `Home` is not code-split. Lazy-load the landing page
and its scroll effects; measure before/after.

## Out of scope
Workspace-level search (E) — next sprint. Rebuilding WECL — separate
environment.

## Acceptance
- `debugger-test.mjs` has a case where a form preceded by a (nested)
  block comment gets the offset of the form, not the comment.
- Expected outputs in the two examples match a run on the real image to
  within normal variance.
- Exporting a session with a plot yields a Markdown file whose image
  renders in a Markdown viewer, and a `.lisp` file that evaluates.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
