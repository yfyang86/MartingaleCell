# Sprint 29 — Proposed plan

## Candidates

### BU. Multi-series plots (small)
`%plot-data-paths` (both workers) collects only the first quoted path
per `plot`/`replot` line; a `plot "a" …, "b" …` loses the second data
file. Collect every quoted path on the line; a harness check with two
series.

### BV. Licence wording (docs)
Root README: SBCL is mostly public domain with MIT and BSD-style parts
(point at SBCL's COPYING); shipping WECL as a fallback keeps the LGPL
notices and source availability; add the LICENSE file the README
promises.

### BM. SBCL boot cache (small-medium)
Cache the inflated artifacts so a second boot is a few seconds.

### BL. SBCL in the docs site (small)
A card on switching engines and what differs.

### BB. Session-box search across cells (small)
Carried.

## Suggested Sprint 29 scope
BU + BV, with BM if time allows.
