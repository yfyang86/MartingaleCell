# Sprint 31 — Goal and plan

Date: 2026-09-15 · Branch: `sprint31` → PR into `dev` · The candidates of `Sprints/Sprint30/04-next-sprint.md`, stacked into one sprint

## Road to the release

The next three sprints are the run-up to the first tagged release:

| Sprint | Purpose |
|---|---|
| 31 (this one) | The last feature sprint: every open candidate that does not depend on the hosting decision, stacked. |
| 32 | Code cut: version bump, changelog, README / Developer Manual / docs-site pass, no new features. |
| 33 | Release PR: `dev` → the release branch, tag, release notes. |

BW (streaming SBCL artifacts for the browser's code cache) stays out
until the host is chosen; it changes how the artifacts are served, not
the app.

## Goal

Draw the function series the plot parser already recognises, let
Ctrl+R in the session box recall anything evaluated in the session, and
make the IDE usable offline after its first load.

## Scope

### BY. Function series drawn (medium)
`src/plot/expr.ts`: a recursive-descent parser for the gnuplot
expression subset — numbers, `x`, `pi`, `+ - * / %`, unary minus, `**`
(right-associative, binding tighter than unary minus as in gnuplot),
parentheses, and the one- and two-argument functions `sin cos tan asin
acos atan atan2 sinh cosh tanh exp log log10 sqrt abs floor ceil round
int sgn min max`. `compileExpression` returns a function of `x` or
`null`; `sampleFunction` samples it over a range into segments, split
where the value is not finite (asymptotes, `log` of a negative). In
`buildSvg` a `missing: 'function'` series whose label compiles is
sampled over the plot's x-range (the data series' range, an explicit
`set xrange`, or gnuplot's default `[-10:10]` when there is nothing
else), contributes to the y-range and is drawn as lines; one that does
not compile keeps the Sprint 30 footnote. The persisted `PlotSpec` does
not change; the decision is made at render time.

### BB. Ctrl+R over cell inputs (small)
`historyEntries(history, cells)` merges the session box's own history
with the inputs of the session's cells (newest first, one entry per
distinct input, with the cell number of its newest run); `filterEntries`
searches them. The Ctrl+R list shows `In [n]` on entries that come from
a cell, so a form evaluated from a buffer with Ctrl+Enter can be recalled
into the box. Persisted history is untouched; the merge is computed on
the fly.

### BZ. Service worker for offline use (medium)
`public/sw.js`, registered in production builds only from `main.tsx`
as `./sw.js?v=<app version>`. The cache is named after that version, so
a new build installs a new worker that drops the old cache on activate.
Navigations are network-first with the cached `index.html` as the
offline fallback (the SPA routes all serve it); every other same-origin
GET — hashed assets, the two workers, the engine artifacts, the sample
zip — is cache-first, stored on first successful fetch. Cross-origin
requests (the Google Fonts stylesheet) are left to the browser. Cached
navigation responses keep their COOP/COEP headers, so `crossOriginIsolated`
holds offline and SBCL still boots. The docs (FAQ, Persistence, Getting
started) say so; the `landing` smoke check that asserted "no service
worker" flips to asserting the offline answer.

A new smoke scenario `offline`: boot ECL, reload so the page is
controlled by the worker and the artifacts pass through it, go offline
(`context.setOffline(true)`), reload, ECL boots from the cache and a cell
evaluates; `crossOriginIsolated` is still true.

## Acceptance
- `plot sin(x)` and `plot "a" u 1:2, x**2` draw the function; `foo(x)`
  stays footnoted. `plot-test` covers the evaluator, sampling and both
  render paths; both harness scripts' third series is drawn (no
  footnote).
- Ctrl+R after evaluating from a buffer lists that form with its cell
  number and recalls it; the `history` smoke scenario passes with the
  richer list.
- The `offline` smoke scenario passes locally and in CI.
- Lint, build, all suites and the browser smoke pass; CI green; merged.
