# Sprint 26 — Goal and plan

Date: 2026-09-10 · Branch: `sprint26` → PR into `dev` · Follows `Sprints/Sprint25/04-next-sprint.md`

## Goal

Keep only the gzip'd SBCL artifacts in the repository, make both
transcript formats round-trip, and make a smoke run readable from the
job page — with the fetch progress and boot time the SBCL engine now
lets us measure.

## Scope (from the Sprint 25 proposal: BE + BG, BH; plus the artifact request)

### BJ. Only the `.gz` artifacts in git (small)
`dev` carries the SBCL artifacts twice (plain 124 MB + gzip'd 19 MB)
since `38dcbdd`. The plain copies leave the index (`git rm --cached`),
`.gitignore` ignores `public/sbcl/*` except `*.gz`, and the Node harness
inflates the `.gz` copies itself when the plain files are absent
(`zlib.gunzipSync` in its load hook), so nothing needs the plain files
except a developer who prefers them locally. The worker already fetches
`.gz` first. History is not rewritten: the old blobs stay reachable
from earlier commits; a shallow clone of `dev` still downloads them
until the history is rewritten, which is a separate decision.

### BE. `.lisp` transcript import (small-medium)
`parseLispTranscript(text)` reads the `;;; ---- cell n · …` sections the
`.lisp` export writes (input forms, `;; OUT`, `;; WARNING:`,
`;; ERROR (TYPE):`, `;;=>` values, `;; resumed via`, the state line, the
run label, project-load tables) into the same `ImportedCell` shape as the
Markdown importer. Importing a `.lisp` file with sections adds cells;
one without sections still opens as a buffer.

### BG. Smoke summary on the job page (small)
`scripts/smoke-summary.mjs <report.json>` prints a Markdown summary
(totals, per-scenario table, failures with details, skips); the CI
smoke job appends it to `$GITHUB_STEP_SUMMARY` whatever the outcome.

### BH. Fetch progress and boot timing (small)
The worker logs each artifact as it arrives (inflated size, seconds so
far); the `sbcl` smoke scenario records the boot time in its check
label and the report.

### BB. Session-box search across cells (if time)

## Out of scope
Rewriting history to drop the plain blobs; port-side Ctrl-C (BI).

## Acceptance
- `git ls-files app/public/sbcl` lists only `.gz`; `pnpm test:sbcl`
  passes with the plain files deleted locally.
- Exporting a session as `.lisp` and importing it yields the same cells
  as the Markdown round trip (Node checks; a smoke check).
- The CI smoke job's summary shows the scenario table.
- Lint, build, all harnesses (SBCL included, now real) and the browser
  smoke pass; CI green; merged.
