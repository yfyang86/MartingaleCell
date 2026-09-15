# Sprint 32 — Goal and plan

Date: 2026-09-15 · Branch: `sprint32` → PR into `dev` · The code cut from the roadmap in `Sprints/Sprint31/01-goal-and-plan.md`

## Goal

Cut the code for the first tagged release: bump the version to
`1.0.0-beta.0`, write the changelog, bring every document in line with
the code, and write down the release steps Sprint 33 will follow. No
new features; no behaviour change beyond the version string.

## Scope

### CA. Version bump (small)
`app/package.json` → `1.0.0-beta.0`. It flows through
`__APP_VERSION__` into the boot screen, the About entry and the
service-worker registration (`./sw.js?v=1.0.0-beta.0`), so every
visitor's worker installs afresh, re-fetches the artifacts once and
drops the `conscell-1.0.0-alpha.0` cache. Code comments that say
"alpha" say "1.0" or "beta".

### CB. Changelog (docs)
Root `CHANGELOG.md`: the `1.0.0-beta.0` entry grouped by area (engines,
session, editor, projects and plots, offline and hosting, tests and
CI), followed by the sprint-by-sprint list drawn from
`Sprints/*/01-goal-and-plan.md`. `1.0.0-alpha.0` was never tagged, so
the beta entry is the first.

### CC. Documents pass (docs)
- Root README (en, zh-CN): the tour's status-bar line (SBCL, not ECL),
  boot time as measured (4–6 s), offline after the first load, Ctrl+R
  over the session, "Limitations (beta)", the status line, a pointer to
  the changelog; no sprint numbers in user-facing text.
- Developer Manual (en, zh-CN): repository layout gains `sw.js` and
  `src/plot/expr.ts`; the engine ladder drops "the alpha default"; the
  testing section lists all 17 suites and the 11 smoke scenarios; the
  release process no longer names two hard-coded version strings (gone
  since Sprint 28) and points at `RELEASE.md`; a note on serving
  `sw.js` at the site root without long cache headers.
- `app/README.md`: the test list and the CI sentence count 10 pure-Node
  and 7 wasm suites; both engines' artifact folders named.
- `app/index.html`: title and meta descriptions name SBCL and ECL.

### CD. Release checklist (docs)
Root `RELEASE.md`: the ordered steps for Sprint 33 — green `dev`,
version check, artifact sizes and hashes, release build and full smoke,
PR `dev` → `main`, tag `v1.0.0-beta.0` on the merge commit, GitHub
release with notes from the changelog, deploy headers, post-release
checks (service-worker cache name, boot from a cold profile).

## Acceptance
- The boot screen and About show `v1.0.0-beta.0`; the service worker
  registers with that version.
- `grep -rn alpha` outside `Sprints/` finds only JSCL's own version
  string and the canvas alpha channel.
- `CHANGELOG.md` and `RELEASE.md` exist at the root and the Developer
  Manual links to them.
- Lint, build, all 17 suites and the browser smoke pass; CI green;
  merged.
