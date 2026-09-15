# Sprint 24 — Goal and plan

Date: 2026-09-10 · Branch: `sprint24` → PR into `dev` · Follows `Sprints/Sprint23/04-next-sprint.md`

## Goal

Make the SBCL engine cheaper to serve and ready to be smoke-tested the
moment its artifacts exist, and finish the run-history comparison with
a value diff and a machine-readable smoke report.

## Constraint

The SBCL wasm artifacts (`public/sbcl/`, ~112 MB) come from the
github.com/yfyang86/sbcl `wasm-dev` build, which is still being
finished and is not available in this environment. Everything in this
sprint that touches the SBCL path is therefore built so that its
artifact-free path is exercised here (Node checks against synthetic
data, skip paths in the harness and the smoke) and its real path runs
unchanged the first time the artifacts are present. AV (hardening
against the real image) waits for the artifacts.

## Scope (from the Sprint 23 proposal: AW + AX, and the carried BD, BF)

### AX. Artifact diet (small-medium)
`scripts/fetch-sbcl.mjs --gzip` writes a gzip'd copy next to each
artifact (`sbcl.core.gz`, …). The worker's `loadArtifactBytes` fetches
the `.gz` first and inflates it with `DecompressionStream`, accepting a
copy the server already decoded (no gzip magic) and refusing an HTML
SPA-fallback answer; anything else falls back to the plain file. The
engine presence check accepts either form. A Node test evaluates the
worker source with a fake `fetch` and checks the five cases on
synthetic data.

### AW. SBCL in the browser smoke (small)
A `sbcl` scenario: sets the engine preference before the page loads,
boots, expects the `SBCL · WASM` status and one evaluated cell. It
skips (reported as skipped, not passed) when `public/sbcl/` has no
artifacts; the runner gains a skip outcome for that.

### BD. Value diff between runs (small)
Values are one line each (the marker protocol prints one value per
line), so a token diff — parens, atoms, whitespace — shows the changed
element of a long list inline in the history view.

### BF. Smoke report (small)
`browser-smoke.mjs --json <file>` writes scenarios, checks, timings and
skips; the CI smoke job always uploads it with the screenshots.

### Docs
README: an "SBCL engine (experimental)" section — fetch, gzip, the
setting, the harness and the smoke scenario. Getting-started lead
mentions the second engine.

## Out of scope
AV (needs the real image); BE `.lisp` import; BB.

## Acceptance
- Node: the artifact loader test passes on synthetic gzip data; the
  token diff test passes.
- The smoke reports `sbcl` as skipped here and the JSON report lists it
  so; the history view shows a token diff for a changed value.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
