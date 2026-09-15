# Sprint 32 — Proposed plan: the code cut

Per the roadmap in `Sprints/Sprint31/01-goal-and-plan.md`, Sprint 32 is
the code cut and Sprint 33 the release PR. No new features.

## Sprint 32 scope

### CA. Version bump
`app/package.json` from `1.0.0-alpha.0` to the release version (the
owner's call: `1.0.0-alpha.1`, `1.0.0-beta.0`, or `1.0.0`), which flows
into the boot screen, About, and the service-worker cache name, so
every visitor re-fetches the artifacts once and drops the alpha cache.

### CB. Changelog
`CHANGELOG.md` at the root, one entry per sprint from the sprint
docs (features, fixes, tests), newest first.

### CC. Documents pass
Root README (en, zh-CN), Developer Manual (en, zh-CN), `app/README.md`,
the docs site: every number (sizes, boot times, suite counts) re-read
against the code; the "Status: alpha" lines and `index.html`'s title and
meta description (still "ECL → WASM") updated.

### CD. Release checklist
A `RELEASE.md` with the steps Sprint 33 follows: branch, tag, notes,
the artifacts to verify (`.gz` sizes and hashes), the smoke run on the
release build.

## Left for after the release
- BW streaming SBCL artifacts (hosting decision).
- Function series: gnuplot's integer-division semantics and user-defined
  functions (`f(x) = …`) are not parsed.
- The service worker does not precache the artifacts; the first boot
  still needs the network.
