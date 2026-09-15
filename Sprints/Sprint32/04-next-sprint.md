# Sprint 33 — Proposed plan: the release

Follow `RELEASE.md` for `1.0.0-beta.0`:

1. Verify `dev` locally (suites, harness, smoke) and record the
   artifact sizes and hashes in the sprint's test log.
2. Branch `release/1.0.0-beta.0` from `dev`; pull request into `main`,
   labelled `smoke`; merge when both jobs are green.
3. Tag `v1.0.0-beta.0` on the merge commit; GitHub release with the
   `CHANGELOG.md` entry and the artifact table.
4. Post-release checks from a fresh browser profile and from one that
   had the alpha (the service worker's cache name changes).
5. Back on `dev`: bump `app/package.json` to `1.0.0-beta.1` so the next
   sprints' builds do not share the released cache name.

The sprint's `03-test-and-fix.md` doubles as the release record.

## After the release

- BW streaming SBCL artifacts (hosting decision).
- Precache the engine artifacts in the service worker (first boot
  offline) if the first-visit cost is acceptable.
- gnuplot integer division and user-defined functions in the plot
  evaluator.
- The plain-artifact history rewrite (Sprints/Sprint26, item BK).
