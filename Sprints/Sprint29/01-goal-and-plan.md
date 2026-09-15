# Sprint 29 — Goal and plan

Date: 2026-09-15 · Branch: `sprint29` → PR into `dev` · From `Sprints/Sprint28/04-next-sprint.md` (review items 5 and 6, plus the boot-cache spike)

## Goal

Ship every data file a multi-series `plot` line refers to, say the
right thing about the engines' licences and add the LICENSE file the
README promises, and find out whether caching the inflated SBCL
artifacts would make a second boot faster.

## Scope

### BU. Multi-series plots (small)
`%plot-data-paths` in both workers takes only the first quoted string
on a `plot`/`replot` line, so `plot "a" …, "b" …` ships `a` and the
browser renders `b` as an empty series. The helper now collects every
series path: the first quoted string after the keyword and every quoted
string that follows a comma, mirroring the browser parser's split on
`, "`; a quoted `title "…"` is never mistaken for a path. Both harnesses
gain a two-series check: a hand-written script with two data files,
captured through `ext:shell`, must ship both files, and (ECL harness,
real parser) produce two series with the right points.

### BV. Licence wording + LICENSE (docs)
The root READMEs called SBCL "MIT + BSD". SBCL is mostly public domain
with some MIT-style and BSD-style parts (its `COPYING`); the wording
follows that. WECL (ECL) is LGPL-2.1+: shipping it as the fallback keeps
the notice and points at the source. The root `LICENSE` file (MIT, for
ConsCell's own code) lands now instead of "with the alpha tag".

### BM. SBCL boot cache (spike, time-boxed)
Measure where a warm second boot spends its time (fetch of the `.gz`
copies from the HTTP cache, inflation, runtime instantiation, image
init) before writing any cache. Implement only if the inflate step
dominates; otherwise record the numbers and the decision.

## Acceptance
- `plot "a" …, "b" …` ships both files on ECL and on SBCL; the ECL
  harness's real-parser check sees two series.
- Root README (en + zh-CN) licence notes match the upstream licences;
  `LICENSE` exists at the repo root and `package.json` names it.
- The boot-cache decision is written down with measurements.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
