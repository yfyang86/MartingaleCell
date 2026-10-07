# Sprint 35 — Proposal for Sprint 36

The blockers from the `dev` review are closed. The review's "important"
findings are the natural next sprint; the "minor" ones can ride along
where they touch the same file.

## CL. Terminal and SBCL memory follow-ups from the review (medium)
- `evaluate.ts`: `paint(true)` when a job finishes or aborts, so the
  last frames of a Matrix-style animation and the final colour reset
  are rendered (today anything within 150 ms of the last paint is lost).
- `terminal/ansi.ts`: keep an incomplete CSI at the end of a chunk and
  finish it with the next one; escape stdout before it reaches the
  screen buffer; do not persist raw frames in the workspace.
- SBCL memory quota: the Segmented control in Settings does not
  re-render after a change; `?mem=` and the stored quota disagree
  until reload.

## CM. Offline completeness and the sample projects (small-medium)
- `sw-warm.ts`: add `/sbcl/sbcl-home.tar.gz` (the contribs bundle the
  worker fetches lazily) to the SBCL artifact list so an offline
  `(require …)` works after the first visit.
- Keep an unpacked copy of the chemicl port under
  `app/sample-projects/chemicl/` and build the zip from it in a script
  (`scripts/pack-samples.mjs`), so the Lisp is diffable in PRs and the
  vendored zip cannot drift from the source. Same for `cl-plot`.
- chemicl parser gaps from the review: the "saccharin" demo SMILES is
  not saccharin; bracket atoms with explicit H counts and charges;
  `%fmt` of a non-finite number.

## CN. Completion and docs polish (small)
- Completion: prefix matching after a package separator for project
  symbols, the `type` of dump-only symbols (`other` → function), and
  the filter that hides `&key` markers also hiding `&rest`-named
  locals.
- Docs: `CC_ISOLATION=off` in the Developer Manual; the MOP page's
  contradictory ECL statements; the stale suite counts in the README
  table; `RELEASE.md` to mention the new CI steps.

## Carried
- BW (hosting decision for the docs site) still waits on the user.
