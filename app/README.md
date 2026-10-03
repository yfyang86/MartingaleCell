# MartingaleCell

A notebook-style Common Lisp IDE that runs entirely in the browser, with
**two real engines**: **SBCL** (compiled to `wasm32-wasip1`) boots by
default, and **ECL** (ANSI CL, compiled to WebAssembly as
[WECL](https://turtleware.eu/)) takes over when SBCL cannot boot or when
chosen in Settings. MartingaleCell wraps either in a CodeMirror editor,
Jupyter-like result cells, a log console, a project explorer and an
in-runtime package manager. Nothing leaves the browser.

User-facing documentation: [`../README.md`](../README.md). Architecture,
worker protocol, artifacts and the release process:
[`../Developer-Manual.md`](../Developer-Manual.md).

## Run it

```sh
cd app
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # production bundle in dist/
pnpm preview      # serve dist/
```

Node 22 and pnpm 10 are what CI uses. Both engines are self-hosted — ECL under
`public/wecl/`, the SBCL artifacts as `.gz` copies under `public/sbcl/` — and must
be served same-origin; the SBCL engine also needs the COOP/COEP headers (`vite dev`
and `vite preview` send them; a static host must too, see `../RELEASE.md`).

## Check it

```sh
pnpm lint            # ESLint, zero warnings expected
pnpm build           # tsc -b + vite build
pnpm test            # all 17 suites: transcript/search/outline/editor-state/
                     # history/fold/lineage/plot/smoke-summary/sbcl-artifacts (pure
                     # Node) + boot/package/settings/debugger/stdin/perf (real ECL
                     # image) + sbcl (real SBCL image)
pnpm test:sbcl       # the SBCL engine against the real image (skips without artifacts)
pnpm test:modules    # package manager + module persistence (needs SAMPLE_PROJECT_DIR)
pnpm smoke:browser   # real Chromium via Playwright against `pnpm preview` (--only name, --list); refuses a dist/ older than the sources (--allow-stale); --json writes a report
pnpm check           # lint + build + test
```

The SBCL artifacts (~19 MB of tracked `.gz` copies under `public/sbcl/`)
are refreshed from a local sbcl `wasm-dev` build with
`node scripts/fetch-sbcl.mjs --gzip` — see the Developer Manual.

The tests under `scripts/` boot the **real** `public/wecl-worker.js` and
`wecl.wasm` inside a Node `vm` sandbox and drive it over the same message
protocol the page uses, so a green run means the image, the worker and the
marker protocol agree. `test:modules` and `boot-harness.mjs --exercise`
load the bundled sample project; point `SAMPLE_PROJECT_DIR` at an unzipped
`public/sample-projects/cl-plot.zip`.

`.github/workflows/ci.yml` runs lint, build, the ten pure-Node tests and the seven wasm tests on every
pull request and on pushes to `dev` (docs-only pushes under `Sprints/` start no run). A second job,
`smoke`, runs the browser scenarios (Playwright + Chromium against `pnpm preview`) on pull requests
that carry the `smoke` label — add the label to opt a PR in — and on every push to `dev`, as a report
on the merge commit; on failure the scenario screenshots are attached as a workflow artifact.
Superseded runs are cancelled on pull requests only, so a `dev` run always completes.

## SBCL engine

The SBCL WebAssembly port (github.com/yfyang86/sbcl, branch `wasm-dev`) is the default
engine, next to ECL. Its artifacts are tracked as gzip'd copies only (`public/sbcl/*.gz`,
~19 MB); the plain files (~124 MB) are gitignored and optional:

```sh
pnpm fetch:sbcl [path-to-sbcl-checkout] --gzip     # from a local sbcl build: writes the plain files and the .gz copies into public/sbcl/ (only the .gz are committed)
pnpm test:sbcl                                    # boots the real worker + image in a worker thread from the .gz copies (inflated by the harness; skips if none are present)
pnpm test:sbcl-artifacts                          # the gzip loader on synthetic data — no artifacts needed
node scripts/browser-smoke.mjs --only sbcl        # the browser scenario: boots SBCL from the .gz copies (reported as skipped without them)
```

In the IDE, Settings → "Lisp implementation" offers `auto` (SBCL, then ECL, then JSCL, then the
demo interpreter — the default), `ecl` (ECL only — a boot failure stays a failure with Retry) and
`sbcl` (SBCL/wasm, ECL if its artifacts are missing or it cannot boot). The choice is part of the
workspace settings (reset with the workspace) and takes effect on Restart Lisp image; the boot
screen shows each artifact's download progress.

## How it is put together

| Layer | Where | What |
|---|---|---|
| Runtime images | `public/wecl/`, `public/sbcl/` | ECL: third-party `boot.js`, Emscripten glue `wecl.js`, `wecl.wasm` (9 MB), Asyncify build with async `wecl_eval`. SBCL: `sbcl.wasm`, `sbcl.core`, `sbcl-core.wasm` as `.gz` copies (19 MB, ~125 MB inflated) from our wasm32-wasip1 port. |
| Worker | `public/wecl-worker.js` | Hand-written classic Web Worker. Half of it is a Common Lisp helper library (package `cc`) embedded as a string: the eval loop, the project loader (parses `.asd` itself — the image has no ASDF), `ext:shell` polyfill with gnuplot capture, and the `package-install` family. It also swaps Emscripten's `invoke_*` setjmp trampolines for lean ones at instantiation — the interpreter runs ~30× faster for it (see `Sprints/Sprint7`). |
| Runtime client | `src/lisp/` | `runtime.ts` owns the engine ladder (`engine-pref.ts`: SBCL worker → ECL worker → JSCL from CDN → built-in mock, or the chosen engine), serialises jobs, parses markers. `symbols.ts` feeds completion and doc popovers. |
| Stores | `src/store/` | Zustand: `workspace` (buffers, cells, logs, settings; persisted to IndexedDB), `evaluate` (cell orchestration), `project` (local folder via File System Access API or virtual ZIP project), `ui`, `editor-meta`. |
| Service worker | `public/sw.js`, `src/lisp/sw-warm.ts` | Registered by `main.tsx` on production builds as `./sw.js?v=<version>`. Navigations network-first with the cached `index.html` offline; every other same-origin GET (assets, workers, engine artifacts, sample zip) cache-first. After an engine boots, the page asks the worker to warm the cache with that engine's artifacts (`warm` message), so the first visit is enough for offline use. The cache is named after the app version, so a new build drops the old one. |
| Project loading, plots | `src/project/`, `src/plot/` | Streams per-file load status into a cell; parses the gnuplot subset cl-plot emits and renders SVG. A `plot` line may name several data files (all are shipped); function expressions are drawn by `src/plot/expr.ts` (gnuplot's operators and maths functions, `f(x) = …` user functions, `a = …` variables, integer arithmetic on integer literals); anything outside that subset, and data files that did not ship, are listed in the plot as "not drawn" rather than dropped. |
| IDE UI | `src/components/ide/` | Editor (CL tokenizer, rainbow parens, completion, signature help), session cells, log panel, explorer, toolbar, command palette, settings, boot screen. |
| Pages | `src/pages/`, `src/components/{home,docs,examples}/` | Landing, docs, examples gallery. Routes are code-split; only `/ide` loads CodeMirror and the runtime client. |

### Worker marker protocol

The worker talks to the page over `postMessage` plus line-oriented markers
printed by the Lisp helpers (parsed main-side, never shown as output):

| Marker | Stream | Meaning |
|---|---|---|
| `;;=> v` | stdout | one value of a top-level form (one line per value) |
| `;;WARNING: …` | stderr | a muffled warning |
| `;;ERRTYPE: T` | stderr | `type-of` the unhandled condition (signal time) |
| `;;DETAIL: k\|v` | stderr | one condition slot worth showing (datum, expected, name, operands …) |
| `;;FRAME: FN` | stderr | one named user frame, innermost first (signal time) |
| `;;ERROR: …` | stderr | the condition report (after unwinding) |
| `;;DEBUG:`, `;;RESTART: i\|NAME\|report`, `;;DEBUG-WAIT` | stderr | the image is paused in the debugger; answer with `{type:'restart', id, index, value?}` |
| `;;READ-WAIT` | stderr | the image is blocked on standard input; answer with `{type:'input', id, text}` (null = EOF) |
| `;;PACKAGE: P` | stdout | reader package after the job — `in-package` persists across cells |
| `;;PLOT64 …` | stdout | base64 gnuplot script + data captured from cl-plot |
| `;;FILE:`, `;;PKG:`, `;;SYM:`, `;;NOTE:`, `;;HINT:` | stdout | project-load progress |
| `;;DEF: path\|offset\|NAME\|kind` | stdout | a definition and where its form starts — from the loader, and from `eval` when the page names the buffer |
| `;;MODULES-CHANGED` | stdout | `/modules` was written — persist it to IndexedDB |

## Development log

Work is organised in sprints under `../Sprints/`. Each sprint has a goal and
plan, implementation notes, a test-and-fix log and a proposal for the next
sprint, and lands on `dev` through a pull request that must be green in CI.

## Licence notes

MartingaleCell's own code is MIT (root `LICENSE`). The default engine is SBCL
(mostly public domain, with MIT-style and BSD-style parts — see SBCL's
`COPYING`); ECL / WECL (LGPL-2.1+) ships unmodified as the fallback
engine with its notice kept. The bundled sample project cl-plot is MIT
(© Martin Kersner). The root README's licence notes have the details.
