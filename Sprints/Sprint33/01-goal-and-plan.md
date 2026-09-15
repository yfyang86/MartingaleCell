# Sprint 33 — Goal and plan

Date: 2026-09-15 · Branch: `release/1.0.0-beta.0` (from `dev`) → PR into `main` · The release from the roadmap in `Sprints/Sprint31/01-goal-and-plan.md`

## Goal

Release `1.0.0-beta.0`: the first tagged version of ConsCell, following
`RELEASE.md` step by step, with the release pull request merged first
and the tag, the notes and the post-release checks after it. No code
changes; the release branch is `dev` as cut in Sprint 32.

## Scope

### CE. Verify `dev` (record)
Lint, build, the 17 suites, the ECL harness with the sample, the 11
smoke scenarios against a fresh build; the sizes and SHA-256 of the
engine artifacts that ship. Recorded in `03-test-and-fix.md`, which is
the release record.

### CF. Release pull request
`release/1.0.0-beta.0` branched from `dev`; pull request into `main`
titled `Release 1.0.0-beta.0` with the changelog entry as its body,
labelled `smoke` so both CI jobs run; merged as a merge commit when
green. `main` is the untouched `init` commit and an ancestor of `dev`,
so the merge carries the whole history.

### CG. Tag and notes
Annotated tag `v1.0.0-beta.0` on the merge commit, pushed. Release
notes: the changelog entry plus the artifact table, written to
`Sprints/Sprint33/release-notes.md` for the GitHub release (created by
hand from the tag; this session has no release-creation tool).

### CH. Post-release checks
Against the release build: a fresh browser profile boots SBCL and
shows `v1.0.0-beta.0` in About; a profile that carries a
`conscell-1.0.0-alpha.0` cache ends up with only
`conscell-1.0.0-beta.0` after the new worker activates; an offline
reload still boots.

### CI. Back on `dev`
`dev` fast-forwarded to `main`'s merge commit (it is a descendant of
`dev`), `app/package.json` bumped to `1.0.0-beta.1` so later builds do
not share the released cache name, the sprint's `03` and `04` docs
committed with it.

## Acceptance
- `main` carries `1.0.0-beta.0` with both CI jobs green on the merge
  commit; tag `v1.0.0-beta.0` points at it.
- The release record lists the checks and the artifact hashes.
- `dev` is at `1.0.0-beta.1`.
