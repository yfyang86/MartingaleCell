# Sprint 26 — Implementation notes

## BJ. Only the `.gz` artifacts in git

- `git rm --cached` on `sbcl.wasm`, `sbcl.core`, `sbcl-core.wasm`; the
  files stay on disk for whoever has them.
- `.gitignore`: `app/public/sbcl/*` with `!app/public/sbcl/*.gz`, so
  `git ls-files app/public/sbcl` lists the three `.gz` copies only.
- `scripts/sbcl-test.mjs`: the presence check accepts `.gz`; the load
  hook (`__ccSbclLoadBytes`) reads the plain file when it exists and
  otherwise `zlib.gunzipSync`s the `.gz` copy. The harness was run with
  the plain files moved away and passed unchanged.
- The worker already fetched `.gz` first (Sprint 24); `bootSbcl`'s
  presence check already accepted `.gz`. The CI step is renamed: the
  SBCL harness now runs the real image on every push.
- History keeps the plain blobs from `38dcbdd`; rewriting it is a
  separate decision.

## BE. `.lisp` transcript import

`parseLispTranscript(text)` in `src/session/transcript.ts` splits on
`;;; ---- cell n · … ----` headers (a preamble before the first header
is ignored) and reads each section: forms are the input (a leading
`(in-package :pkg)` naming the section's own package is the exporter's
and is dropped); `;; OUT` lines join to the output; each `;; WARNING:`
line is a warning; `;; ERROR (TYPE):` lines join to the error;
`;;=>` lines are values; `;; resumed via X`; `;; Evaluation aborted.`;
the run label to `runOf`; project-load rows to `project.files`.
`importTranscriptText` routes a Lisp file with sections through it
(append or replace, like Markdown); any other Lisp file still opens as
a buffer. Both parsers no longer drop the first section when the text
starts directly with a header.

## BG. Smoke summary on the job page

`scripts/smoke-summary.mjs` exports `summarize(report)` and, as a CLI,
prints the Markdown for a report path (a note when the file is
missing): headline with totals and a green/red mark, a per-scenario
table (checks, seconds, result or skip reason), failures with the first
detail line and screenshot name, the slowest scenario. The CI smoke job
appends it to `$GITHUB_STEP_SUMMARY` with `if: always()`.

## BH. Fetch progress and boot timing

The worker logs each artifact as it lands (`sbcl.core: 79.9 MB
inflated, 3.2 s so far`) and the total with the elapsed time; the
`sbcl` smoke scenario measures the time from navigation to the
`SBCL · WASM` status and puts it in its check label (21 s here, cold,
from the `.gz` copies over localhost).

## Tests

- `scripts/transcript-test.mjs` +6 (47): the `.lisp` round trip equals
  the Markdown round trip cell by cell (input, package, values, output,
  error, resumption, duration, project files), warnings, the run label,
  the exporter's `(in-package …)`, no sections → no cells.
- `scripts/smoke-summary-test.mjs` (6, new): headline, table, failures,
  slowest, green report, derived totals. In `pnpm test` and CI.
- Browser smoke: `transcript` +1 (export `.lisp` via the palette, import
  it, cells doubled again with the aborted cell's resolution kept);
  `sbcl` label carries the boot time. 57 checks in 9 scenarios, none
  skipped.
- The palette helper now waits for the palette input and presses
  Ctrl+K again if the first press closed a palette left open by a file
  chooser.

## Docs and README

README: the SBCL section (only `.gz` tracked, the harness inflates
them, the smoke boots from them), the smoke summary. Session cells:
import covers `.lisp` transcripts.
