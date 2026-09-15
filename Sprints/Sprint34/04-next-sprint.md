# Sprint 35 — Proposed plan

## Candidates

### BW. Streaming SBCL artifacts for the browser's code cache (medium)
Still waiting on the hosting decision (Sprint 29 spike).

### CL. Plot evaluator: ternary and comparison operators (small)
`x > 0 ? x : -x` is common in gnuplot scripts; the evaluator has the
grammar in place to add `? :`, `< <= > >= == !=`, `&& || !`.

### CM. Warm the other engine too (small)
After SBCL boots, ECL's 9.5 MB could be warmed as well so the fallback
is offline-capable; a setting, since it doubles the background download.

### BB-2. Session-box search: fuzzy match and cell jump (small)
Carried.

### BK. Plain-artifact history rewrite (destructive, owner's call)
Carried.

## Suggested Sprint 35 scope
CL + BB-2, with BW as soon as hosting is settled.
