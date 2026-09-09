# ConsCell

A notebook-style Common Lisp IDE that runs entirely in the browser. The
runtime is **ECL** (Embeddable Common Lisp, ANSI CL) compiled to WebAssembly
as [WECL](https://turtleware.eu/) by the ECL maintainer; ConsCell wraps it in
a CodeMirror editor, Jupyter-like result cells, a log console, a project
explorer and an in-runtime package manager. Nothing leaves the browser.

## Run it

```sh
cd app
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # production bundle in dist/
pnpm preview      # serve dist/
```

Node 22 and pnpm 10 are what CI uses. The wasm image is self-hosted under
`public/wecl/` and must be served same-origin.

## Check it

```sh
pnpm lint            # ESLint, zero warnings expected
pnpm build           # tsc -b + vite build
pnpm test            # boot + package + settings + debugger + stdin + perf-floor tests (real wasm, Node)
pnpm test:modules    # package manager + module persistence (needs SAMPLE_PROJECT_DIR)
pnpm smoke:browser   # real Chromium via Playwright against `pnpm preview` (not in CI)
pnpm check           # lint + build + test
```

The tests under `scripts/` boot the **real** `public/wecl-worker.js` and
`wecl.wasm` inside a Node `vm` sandbox and drive it over the same message
protocol the page uses, so a green run means the image, the worker and the
marker protocol agree. `test:modules` and `boot-harness.mjs --exercise`
load the bundled sample project; point `SAMPLE_PROJECT_DIR` at an unzipped
`public/sample-projects/cl-plot.zip`.

`.github/workflows/ci.yml` runs lint, build and the six wasm tests on every
pull request and on pushes to `dev`.

## How it is put together

| Layer | Where | What |
|---|---|---|
| Runtime image | `public/wecl/` | Third-party: `boot.js`, Emscripten glue `wecl.js`, `wecl.wasm` (9 MB). Asyncify build; `wecl_eval` is async. |
| Worker | `public/wecl-worker.js` | Hand-written classic Web Worker. Half of it is a Common Lisp helper library (package `cc`) embedded as a string: the eval loop, the project loader (parses `.asd` itself — the image has no ASDF), `ext:shell` polyfill with gnuplot capture, and the `package-install` family. It also swaps Emscripten's `invoke_*` setjmp trampolines for lean ones at instantiation — the interpreter runs ~30× faster for it (see `Sprints/Sprint7`). |
| Runtime client | `src/lisp/` | `runtime.ts` owns the fallback ladder (ECL worker → JSCL from CDN → built-in mock), serialises jobs, parses markers. `symbols.ts` feeds completion and doc popovers. |
| Stores | `src/store/` | Zustand: `workspace` (buffers, cells, logs, settings; persisted to IndexedDB), `evaluate` (cell orchestration), `project` (local folder via File System Access API or virtual ZIP project), `ui`, `editor-meta`. |
| Project loading, plots | `src/project/`, `src/plot/` | Streams per-file load status into a cell; parses the gnuplot subset cl-plot emits and renders SVG. |
| IDE UI | `src/components/ide/` | Editor (CL tokenizer, rainbow parens, completion, signature help), session cells, log panel, explorer, toolbar, command palette, settings, boot screen. |
| Pages | `src/pages/`, `src/components/{home,docs,examples}/` | Landing, docs, examples gallery. Routes are code-split; only `/ide` loads CodeMirror and the runtime client. |

### Worker marker protocol

The worker talks to the page over `postMessage` plus line-oriented markers
printed by the Lisp helpers (parsed main-side, never shown as output):

| Marker | Stream | Meaning |
|---|---|---|
| `;;=> v1 v2` | stdout | values of a top-level form |
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
| `;;MODULES-CHANGED` | stdout | `/modules` was written — persist it to IndexedDB |

## Development log

Work is organised in sprints under `../Sprints/`. Each sprint has a goal and
plan, implementation notes, a test-and-fix log and a proposal for the next
sprint, and lands on `dev` through a pull request that must be green in CI.

## Licence notes

WECL / ECL are LGPL-2.1+. The bundled sample project cl-plot is MIT
(© Martin Kersner). See the respective upstream projects.
