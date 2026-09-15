# Sprint 30 — Goal and plan

Date: 2026-09-15 · Branch: `sprint30` → PR into `dev` · From `Sprints/Sprint29/04-next-sprint.md` (BL and BX; BW waits on the hosting decision)

## Goal

Make the docs site and the landing page tell the same engine story as
the IDE (SBCL by default, ECL as the fallback, switchable in Settings),
drop the claims that are no longer true (an ECL-only runtime, a Cache
API image, a service worker), and stop plots from silently dropping
series that have no data file.

## Scope

### BL. Engines in the docs site (small)
A new **Engines** section on `/docs` (after Getting started, in the
sidebar): four cards — SBCL (default), ECL (fallback), switching in
Settings → Lisp implementation, what differs — and a compact
comparison. The stale copy around it is corrected:

- Getting started: the title, lead, "Boot" step and the sample boot log
  describe the SBCL boot as the worker prints it (the `.gz` artifacts,
  the inflate, "instantiating the runtime", ready in a few seconds);
  nothing "caches itself" beyond the browser's HTTP cache.
- Feature matrix: lead and footer name both builds; the threads row
  says `sb-thread` is absent from the wasm image.
- Persistence: buffers, cells and settings in IndexedDB; the artifacts
  through the HTTP cache; "the Lisp engine" instead of "the ECL
  runtime".
- FAQ: "Is this real Common Lisp?" names both engines and the ladder;
  the download answer gives each engine's size and boot time; the
  offline answer stops promising a service worker that does not exist.
- Landing page and Examples: "ECL" becomes "SBCL and ECL" where the
  copy names the engine.

### BX. Series without a data file (small)
`parsePlotCommand` split a `plot` line only before quoted strings and
skipped any segment without one, so `plot "a" using 1:2, sin(x)` lost
the function and `plot sin(x)` produced an empty plot; a missing data
file gave an empty series drawn as nothing. Now:

- segments split on commas outside quotes and parentheses;
- a function segment becomes a series with `missing: 'function'` and
  its expression as the label;
- a quoted path with no shipped content becomes `missing: 'no-data'`;
- `""` reuses the previous segment's file, as gnuplot does;
- `buildSvg` lists such series in a footnote ("not drawn: …") and marks
  their legend entries "(not drawn)".

The workers' `%plot-line-paths` (Sprint 29) treated any quoted string
after a comma as a path; a function's `title "s"` would have been
shipped as a file. After a comma, the first non-blank character decides:
a quote opens a path, anything else is an expression. Both harness
two-series scripts gain a third, function series and check that no
title ships and the parser reports the function as not drawn.

A new Node suite, `scripts/plot-test.mjs` (`pnpm test:plot`, a CI
step), covers the parser and the SVG builder directly: splitting,
function and no-data series, `""`, the footnote and legend text, and
that data series are still drawn.

## Acceptance
- `/docs` has an Engines section reachable from the sidebar; no page on
  the site calls ECL the only engine or mentions a Cache API image or a
  service worker.
- `plot "a" u 1:2, sin(x) title "s"` renders series `a` and a footnote
  naming `sin(x)`; both engines ship only `a`'s file.
- Lint, build, all suites (17 with `test:plot`) and the browser smoke
  pass; CI green; merged.
