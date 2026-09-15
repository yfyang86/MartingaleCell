# Sprint 31 — Implementation notes

## BY. Function series drawn

`src/plot/expr.ts` (new)

- `compileExpression(src)`: tokenizer (numbers incl. `.5` and `1.5e2`,
  identifiers, `+ - * / % ** ( ) ,`) and a recursive-descent parser
  producing closures: `expr := term (('+'|'-') term)*`, `term := unary
  (('*'|'/'|'%') unary)*`, `unary := ('-'|'+') unary | power`, `power :=
  atom ('**' unary)?`. So `-x**2` is `-(x**2)` and `2**3**2` is `512`,
  as in gnuplot. Atoms: number, `x`, `pi`, `( expr )`, `f(expr)` for
  `sin cos tan asin acos atan sinh cosh tanh exp log log10 sqrt abs
  floor ceil round int sgn`, `f(expr, expr)` for `atan2 min max`.
  Anything else (unknown name, wrong arity, dangling operator) → `null`.
- `sampleFunction(fn, xmin, xmax, samples = 200)`: evenly spaced
  samples, split into segments where the value is not finite or jumps
  by more than half the sampled span (asymptotes such as `1/x`, `tan`).

`src/plot/build-svg.ts`

- `plotXRange(spec)` (exported for the test): the data's auto range,
  or gnuplot's default `[-10, 10]` when there is no data point or arrow,
  resolved against `set xrange`.
- Every `missing: 'function'` series whose label compiles is sampled over
  that range; its samples join the y-range; it is drawn by
  `functionElements` (a polyline per segment, circles for `with
  points`/`dots`). `notDrawn(s)` — missing and not compiled — now drives
  the legend suffix and the footnote, so a drawn function shows a plain
  legend entry (its title or its expression).
- The persisted `PlotSpec` is unchanged: `missing`/`label` from the
  parser, the drawing decision at render time.

`src/plot/gnuplot.ts`: a function series without `with` defaults to
`lines` (gnuplot's default for functions).

## BB. Ctrl+R over cell inputs

`src/session/history.ts`: `HistoryEntry { text, cell? }`,
`historyEntries(history, cells)` — cells newest first, project-load
cells and blank inputs skipped, one entry per distinct trimmed input
carrying the number of its newest run, then the box's own history
entries not already present — and `filterEntries` (substring, list
order, capped). `SessionPanel` computes the entries from the store's
`sessionHistory` and `cells` (memoised), searches them, recalls
`.text`, and renders an `In [n]` chip (`data-testid="history-cell"`)
next to entries that come from a cell (`data-testid="history-entry"`
on the text). The persisted history list is untouched.

## BZ. Service worker for offline use

`public/sw.js` (new; plain script, outside the lint/tsc trees like the
engine workers)

- Cache `conscell-<version>`, the version taken from the registration
  URL's `?v=`; `install` precaches the scope root and `index.html` and
  calls `skipWaiting`; `activate` deletes every other `conscell-*` cache
  and claims the clients.
- `fetch`: GET only, same origin only, never `sw.js` itself. Navigations
  are network-first (a successful response is also stored as
  `index.html`), falling back to the cached `index.html`, then a 503
  text when nothing was ever cached. Everything else is cache-first;
  successful `basic` responses are stored on the way through.
- A navigation response served from the cache keeps the COOP/COEP
  headers it arrived with, so `crossOriginIsolated` holds offline and
  the SBCL worker can still share its mailbox buffer.

`src/main.tsx`: on `load`, production builds only, registers
`./sw.js?v=<__APP_VERSION__>` (relative, like the app's assets under
`base: './'`); failure is silent — the app is unchanged without it.

Docs: the FAQ's offline answer, the Persistence "Local first" card, the
Getting started Boot step and lead, the Engines SBCL card and the
app README architecture table describe the worker.

## Tests

- `scripts/plot-test.mjs`: 33 checks — the Sprint 30 set (the
  "not drawn" cases now use unknown functions) plus the evaluator
  (precedence, associativity, functions, rejections), sampling (`log`,
  `1/x`, `sin`) and rendering (function-only default range, `set
  xrange`, data + function, default style, drawn and not-drawn side by
  side).
- `scripts/session-history-test.mjs`: 5 checks on `historyEntries` /
  `filterEntries`.
- `scripts/boot-harness.mjs`: the three-series SVG now expects `sin(x)`
  drawn (two polylines, plain legend entry, no footnote).
- `scripts/browser-smoke.mjs`: the `history` scenario reads the entry
  texts and chips separately and expects the two box forms first, then
  the buffer-evaluated cells with chips; the `landing` scenario expects
  the Persistence card to say the IDE opens offline; new `offline`
  scenario (5 checks): worker registered and active, page controlled
  after a reload, offline reload boots ECL from the cache,
  `crossOriginIsolated` still true, a cell evaluates.

## Files touched

- New: `src/plot/expr.ts`, `public/sw.js`.
- `src/plot/build-svg.ts`, `src/plot/gnuplot.ts`, `src/session/history.ts`,
  `src/components/ide/SessionPanel.tsx`, `src/main.tsx`.
- Docs site: `Faq.tsx`, `Persistence.tsx`, `GettingStarted.tsx`,
  `Engines.tsx`; `app/README.md`.
- Tests: `plot-test.mjs`, `session-history-test.mjs`,
  `boot-harness.mjs`, `browser-smoke.mjs`.
