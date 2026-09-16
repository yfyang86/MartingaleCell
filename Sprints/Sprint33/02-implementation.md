# Sprint 33 — Implementation notes

No code changed. The sprint is the execution of `RELEASE.md` for
`1.0.0-beta.0`, in the order the owner asked for: the release pull
request merged first, then the tag, the notes and the checks.

## CF. Release pull request

- `release/1.0.0-beta.0` branched from `dev` at `0921c6c` (the Sprint 32
  record commit) with one docs commit, the Sprint 33 plan (`fc15ed9`).
- Pull request https://github.com/yfyang86/ConsCell/pull/33 into
  `main`, body = the changelog entry, label `smoke`. `main` was the
  `init` commit `10e3f50` and an ancestor of `dev`, so the merge is
  conflict-free and carries the whole 200-commit history.
- Merged as a merge commit `c4c0b3e` ("Release 1.0.0-beta.0") once both
  jobs were green on `fc15ed9`.

## CG. Tag and notes

- Annotated tag `v1.0.0-beta.0` on `c4c0b3e`, pushed.
- `release-notes.md` in this folder: the summary, the artifact table
  (sizes and SHA-256), the verification and the known limitations —
  the body for the GitHub release, which is created by hand from the
  tag (this session has no release-creation tool).

## CH. Post-release checks (against the release build, `pnpm preview`)

- `upgrade-check` (a Playwright script kept in the sprint record, not
  in the repo): a profile carrying a planted `conscell-1.0.0-alpha.0`
  cache loads the IDE; after the new worker activates the only cache is
  `conscell-1.0.0-beta.0` and the controlling worker is
  `sw.js?v=1.0.0-beta.0`; a fresh profile boots SBCL and shows the
  version. PASS.
- The `offline` smoke scenario (part of the 71-check run) covers the
  offline reload.

## CI. Back on `dev`

- `dev` fast-forwarded to `c4c0b3e` (it was an ancestor of the merge
  commit), so `dev` and `main` share the release point.
- `app/package.json` → `1.0.0-beta.1`, so builds after the release do
  not share the released service-worker cache name; `CHANGELOG.md`
  gains an `[Unreleased]` section.
- This sprint's `02`, `03`, `04` and `release-notes.md` ride the same
  commit; its push starts a CI run on `dev` (a version change is not a
  docs-only push).

## Files touched

`app/package.json`, `CHANGELOG.md`, `Sprints/Sprint33/*`.
