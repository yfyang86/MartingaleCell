# Sprint 32 — Implementation notes

No feature work. Every change is a version string, a document, or a
comment.

## CA. Version bump

- `app/package.json`: `1.0.0-alpha.0` → `1.0.0-beta.0`. Nothing else
  carries the version: `vite.config.ts` defines `__APP_VERSION__` from
  it (Sprint 28), which the boot screen, About and the service-worker
  registration read. The production bundle therefore registers
  `./sw.js?v=1.0.0-beta.0`, whose cache name `conscell-1.0.0-beta.0`
  makes every existing installation's worker install afresh and delete
  the `conscell-1.0.0-alpha.0` cache on activate (artifacts re-fetched
  once).
- Comments that said "alpha" (`engine-pref.ts`, `runtime.ts`, two in
  `browser-smoke.mjs`) now say "1.0" and describe SBCL's licence the way
  the README does. The remaining "alpha" outside `Sprints/` is JSCL's own
  package version in its CDN URL.

## CB. `CHANGELOG.md`

Keep-a-Changelog layout. One `[1.0.0-beta.0]` entry grouped by area
(engines; session and debugger; editor; projects and plots; offline and
hosting; docs and licences; tests and CI), each bullet naming the
sprints it came from, then a sprint-history table (1–32) drawn from
each sprint's goal and scope headings. The compare link points at the
tag Sprint 33 will create.

## CC. Documents pass

- **Root README (en)**: offline after the first load; boot time 4–6 s
  as measured in Sprint 29, "downloaded once"; the tour's status-bar
  line says SBCL (it said ECL); Ctrl+R described as the session-wide
  search; no sprint number in the engine table; "Limitations (beta)";
  status line with links to the changelog, the manual and the release
  checklist. Found and fixed on the way: the engine table's interrupt,
  hosting-requirement and quirks rows had the SBCL and ECL columns
  swapped (the Ctrl-C limitation, the COOP/COEP requirement and the
  `(directory …)`/fixnum quirks all belong to SBCL; the zh-CN table
  already had them right).
- **Root README (zh-CN)**: the same edits.
- **Developer Manual (en, zh-CN)**: layout gains `sw.js`, the
  expression evaluator under `plot/`, and the two new root files; the
  engine ladder drops "the alpha default"; the testing section lists
  the 17 suites by group (10 pure-Node, 6 real-ECL, 1 real-SBCL) and the
  11 smoke scenarios with the CI trigger; the release process no longer
  names two hard-coded version strings (gone since Sprint 28), points at
  `RELEASE.md`, and states the `sw.js` serving rules.
- **`app/README.md`**: both engines' artifact folders and the header
  requirement in "Run it"; the `pnpm test` comment lists all 17 suites;
  the CI sentence counts 10 pure-Node and 7 wasm tests; the SBCL section
  is no longer "experimental" and its `auto` description matches
  `engine-pref.ts` (it still said ECL first); the architecture table's
  runtime-image and runtime-client rows name both engines and the real
  ladder.
- **`app/index.html`**: title, description and Open Graph description
  name SBCL and ECL and mention offline use (they said "ECL → WASM").

## CD. `RELEASE.md`

The ordered checklist for Sprint 33: preconditions on `dev`, local
verification (the 17 suites, the ECL harness with the sample, the 11
smoke scenarios, the version on the boot screen and in the worker
registration, artifact sizes and SHA-256), the `release/<version>` →
`main` pull request labelled `smoke`, the annotated tag on the merge
commit, the GitHub release with the changelog entry, the hosting
requirements (COOP/COEP on every response, `sw.js` at the root and not
long-cached, `.gz` artifacts served as-is, SPA routes to `index.html`),
and the post-release checks from a fresh and from an upgraded browser
profile.

## Files touched

`app/package.json`, `app/index.html`, `app/src/lisp/engine-pref.ts`,
`app/src/lisp/runtime.ts`, `app/scripts/browser-smoke.mjs` (comments),
`README.md`, `README.zh-CN.md`, `Developer-Manual.md`,
`Developer-Manual.zh-CN.md`, `app/README.md`, `CHANGELOG.md` (new),
`RELEASE.md` (new).
