# Sprint 30 — Implementation notes

## BL. Engines in the docs site

- `src/components/docs/Engines.tsx` (new): section `#engines` with four
  cards (SBCL default, ECL fallback, switching, same session either
  way) and a six-row comparison table (`data-testid="engine-table"`:
  standard, boot, compiler, threads, subprocesses, licence). Wired into
  `pages/Docs.tsx` after Getting started and into `DOC_SECTIONS` in the
  sidebar.
- `GettingStarted.tsx`: title "in a few seconds", lead without "caches
  itself", the Boot step names the HTTP cache as the only reason a
  return visit is quicker, and the sample boot log is what
  `public/sbcl-worker.js` prints (artifact lines with inflated sizes,
  "artifacts loaded … instantiating the runtime", the ready line) with
  the Sprint 29 timings.
- `FeatureMatrix.tsx`: lead and footer name both builds; the threads
  row says `sb-thread` is absent from the wasm image and that the
  isolation headers are already served.
- `Persistence.tsx`: IndexedDB holds buffers, cells, settings and
  project files; the artifacts come through the HTTP cache; "the Lisp
  engine — SBCL or ECL".
- `Faq.tsx`: the real-Common-Lisp answer names both engines and the
  full ladder; the download answer gives each engine's size and boot
  time; the offline answer says there is no service worker.
- Landing page (`Hero`, `FeatureGrid`, `HowItWorks`, `MiniRepl`) and
  `Examples.tsx`: "ECL" → "SBCL and ECL" / "the Lisp engine".
- Smoke: the `landing` scenario also opens `/docs`, waits for the
  engine table, checks the sidebar link and that the page no longer
  says "Cache API" or promises a service worker (2 new checks).

## BX. Series without a data file

`src/plot/gnuplot.ts`

- `splitPlotSegments(rest)` (exported for the test) splits a plot
  command on commas outside quotes and parentheses. The old
  `split(/,(?=\s*")/)` only split before a quoted string, so a function
  after a data series was swallowed into the previous segment's options.
- A segment that does not start with a quoted path is a function
  expression: `{ points: [], missing: 'function', label: <expr>, title?,
  style }`, the expression being the text before the first plot keyword
  (`using`, `with`, `title`, `lt`, `pt`, …).
- A quoted path with no content in the payload gets
  `missing: 'no-data'` and `label: path`.
- `""` reuses the previous segment's path (gnuplot semantics), so
  `plot "a" u 1:2, "" u 1:3` draws two series from one file; a leading
  `""` has nothing to reuse and stays a no-data series.
- `PlotSeries` gains the optional `missing` and `label` fields; every
  consumer that ignores them behaves as before.

`src/plot/build-svg.ts`

- Legend entries include series that are `missing` (under their title
  or label) with the suffix "(not drawn)".
- A footnote inside the plot area, bottom-left, `not drawn: <name>
  (function|no data), …`, with `data-plot-missing="<count>"` so the UI
  or a test can find it. Under `set nokey` the legend is off but the
  footnote still tells the truth.

Workers (`%plot-line-paths` in both): the scan starts after the
`plot`/`replot` keyword; after a comma the first non-blank character
decides whether the series is a file (a quote) or an expression
(anything else). Before this, `sin(x) title "s"` after a comma shipped
`s` as a data file. Both harness scripts now carry that third series and
assert nothing but the two data files ships; the ECL harness also runs
the real `buildSvg` on the result and expects the footnote and legend
entry.

`scripts/plot-test.mjs` (new, `pnpm test:plot`, a `check` step in CI):
15 checks on splitting, function and no-data series, `""`, the
footnote, the legend and the untouched drawing of data series.

## Files touched

- Docs site: `Engines.tsx` (new), `Docs.tsx`, `DocsSidebar.tsx`,
  `GettingStarted.tsx`, `FeatureMatrix.tsx`, `Persistence.tsx`,
  `Faq.tsx`; landing: `Hero.tsx`, `FeatureGrid.tsx`, `HowItWorks.tsx`,
  `MiniRepl.tsx`; `pages/Examples.tsx`.
- Plots: `src/plot/gnuplot.ts`, `src/plot/build-svg.ts`,
  `public/sbcl-worker.js`, `public/wecl-worker.js`.
- Tests: `scripts/plot-test.mjs` (new), `scripts/boot-harness.mjs`,
  `scripts/sbcl-test.mjs`, `scripts/browser-smoke.mjs`, `package.json`,
  `.github/workflows/ci.yml`.
- `app/README.md` (plot row).
