# ConsCell — Developer Manual

Everything a contributor needs: layout, architecture, the two Lisp
engines, the worker protocol, tests, artifacts and the release process.
For the user-facing story start with [README.md](README.md). The
sprint-by-sprint history lives in `Sprints/SprintN/` (goal →
implementation → test log → next-sprint proposal); this manual is the
stable cross-section of it. 中文版：[Developer-Manual.zh-CN.md](Developer-Manual.zh-CN.md).

## Repository layout

```
app/                      the IDE (Vite + React + TypeScript)
  src/                    main-thread code
    lisp/                 runtime client: engine ladder, worker protocol,
                          marker parsing (runtime.ts, types.ts)
    store/                zustand stores (workspace, project, cells, ui)
    components/ide/       Toolbar, StatusBar, ExplorerPanel, SettingsDrawer,
                          Cell, SessionPanel, CommandPalette, …
    project/              project loading, zip import/export, examples
    plot/                 ;;PLOT64 payload → gnuplot parse (+ expression
                          evaluator for function series) → SVG render
    session/              cells, transcripts, history/lineage
  public/
    wecl/ + wecl-worker.js   the ECL engine (WECL image + hand-written worker)
    sbcl/*.gz + sbcl-worker.js  the SBCL engine (wasm32-wasip1 artifacts +
                             hand-written browser host worker)
    sample-projects/cl-plot.zip
    sw.js                 service worker: offline after the first load,
                          cache named after the app version
  scripts/                Node harnesses (the whole test suite), the
                          browser smoke, artifact fetch, smoke summary
Sprints/                  sprint records (Sprint 1 … current)
CHANGELOG.md · RELEASE.md what shipped, and how to cut a release
.github/workflows/ci.yml  lint · build · all harnesses (PRs + dev)
```

Toolchain: Node 22, pnpm 10, TypeScript strict, ESLint (zero warnings).
There is no backend — everything runs in the browser.

## Architecture in one page

```
main thread                     worker thread (per engine)
───────────                     ─────────────────────────
UI (React stores)               classic Web Worker running the Lisp image
  │  runtime.ts (LispRuntime)     • ECL: wecl-worker.js + WECL (Emscripten)
  │    eval/loadProject/etc →     • SBCL: sbcl-worker.js — a hand-written
  │      postMessage OR             WASI shim + the sbcl_host contract,
  │      SharedArrayBuffer mailbox  REPL driven over a WASI stdin we own
  │  ◄── stdout/stderr lines with ;; markers, done/joberror, …
```

Both engines speak **the same wire protocol** (`WorkerInMessage` /
`WorkerOutMessage`, `src/lisp/types.ts`), so the main thread is
engine-agnostic. A job's output is parsed from line markers
(`parseEclOutput` in `runtime.ts`):

| marker | stream | meaning |
|---|---|---|
| `;;=> value` | stdout | one value per line (`; no values` for zero) |
| `;;ERROR:` / `;;ERRTYPE:` / `;;DETAIL:` | stderr | an error, its `type-of`, condition slots |
| `;;WARNING:` (located form: `path\|offset\|text`) | stderr | warnings |
| `;;PACKAGE:` | stdout | the reader package the next job reads in |
| `;;FILE:/;;PKG:/;;SYM:/;;NOTE:/;;HINT:/;;DEF:` | stdout | project-load progress |
| `;;PLOT64 <base64>` | stdout | gnuplot capture → in-browser SVG |
| `;;READ-WAIT` / `;;DEBUG:/;;RESTART:/;;DEBUG-WAIT` | stderr | stdin request / debugger pause |
| `;;MODULES-CHANGED` | stdout | persist /modules to IndexedDB |

The markers are **emitted by a Lisp helper (`cc` package) living inside
each worker** — `CC_HELPER_SRC` in `wecl-worker.js` and its SBCL port in
`sbcl-worker.js`. Both are plain strings of CL source; keep the two in
step when changing marker semantics.

### The engine ladder

`LispRuntime.init()` boots the preference's engine (`src/lisp/engine-pref.ts`):
the default (`auto`) is **SBCL first** — ECL takes
over when SBCL cannot boot (artifacts missing, page not
crossOriginIsolated) — then JSCL (CDN, CL subset) → a built-in mock;
`ecl` is ECL-only with no fallback. Status surfaces as `ready-sbcl` /
`ready-ecl` / `ready-jscl` / `ready-mock`. Note for smoke scenarios: the
general scenarios pin `ecl` explicitly; the `sbcl` scenario sets its own
pref.

### The ECL worker (`public/wecl-worker.js`)

Loads the self-hosted WECL image (`/wecl/`), captures stdout/stderr,
bootstraps the `cc` helper, and talks `postMessage` both ways. Notable
tricks in there: the fast setjmp-trampoline patch (Sprint 7), the
gnuplot interception on `ext:shell`, and dummy-ASDF handling. Requests
are plain `postMessage`; evaluation is Asyncify-async and serialized.

### The SBCL worker (`public/sbcl-worker.js`)

A from-scratch browser host for the SBCL wasm port
(github.com/yfyang86/sbcl, branch `wasm-dev` — see its `SBCL-Handoff.md`):

- **WASI preview1 shim** over an in-memory file system (args, environ,
  clocks, fds, preopen, readdir, poll, file writes buffered per fd and
  committed at close). The std fds report as **character devices** —
  SBCL's `unix-simple-poll` then short-circuits and the block happens in
  `fd_read` (filetype 0 sends it into a wasi-libc select spin).
- **`sbcl_host` imports**: a synchronous `instantiate` (compile the Lisp
  module the runtime read into memory, grow the shared funcref table,
  link against the runtime's memory/table, one shared `lisp_unwind`
  WebAssembly.Tag), `set_timer`, `run_process` (−1), `process_id`.
  i64/u64 imports arrive as **BigInt** — always coerce.
- **Threading model**: after boot the worker thread is inside `_start`
  forever; the page submits jobs through a SharedArrayBuffer (a form
  ring, a stdin ring, a one-slot JSON mailbox, an interrupt flag) served
  from inside the WASI imports; `Atomics.wait` is the block. Copy bytes
  out of the SAB before `TextDecoder` — browsers reject shared views.
  Every fed form ends with a `;;CC-DONE` marker (= job done) and a
  trailing blank line (SBCL's reader otherwise parks a buffered form).
- **Boot requirements**: SharedArrayBuffer ⇒ the page must be
  crossOriginIsolated (COOP `same-origin` + COEP `credentialless`;
  `vite.config.ts` sends them for dev and preview — a static host must
  too, otherwise the engine bootfails with a clear message and ECL
  takes over). Node needs `--experimental-wasm-exnref` (the harness
  re-execs itself with it).
- **Project loading**: `ext-compat.lisp` (if present) loads first —
  ECL-targeted systems read `EXT:SHELL`/`EXT:CD` at load time; a dummy
  ASDF package + a `*module-provider-functions*` entry make
  `(require :asdf)` / `(asdf:load-system …)` behave; the gnuplot capture
  replaces `EXT:SHELL` after every file (loader files can reload
  `ext-compat.lisp` and revert it). `(directory …)` cannot enumerate on
  this port build — track file lists explicitly.

## Testing

All harnesses are plain Node scripts in `app/scripts/` — no test
framework, deterministic, each exits 0/1. `pnpm test` chains them all;
CI runs lint → build → every harness.

- Pure-TS (10): transcript, search, outline, editor-state,
  session-history (incl. the Ctrl+R merge), fold, lineage, plot (gnuplot
  subset parser, expression evaluator, SVG builder), smoke-summary,
  sbcl-artifacts (the gzip loader on synthetic data).
- Real ECL image (6): `boot-harness.mjs` (boots the actual worker + wasm
  in a `vm` sandbox; `--exercise` loads the cl-plot sample end-to-end
  incl. the SVG render and a multi-series plot), package, settings,
  debugger, stdin and perf harnesses reuse the pattern.
- Real SBCL image (1): `sbcl-test.mjs` boots `sbcl-worker.js` in a real
  `worker_threads` thread (so SAB/Atomics behave as in the browser) and
  exercises eval, errors, packages, project load, stdin, timers, the
  debugger pause, runaway recursion, the interrupt ack, module
  persistence, the cl-plot sample and a multi-series plot. Skips (exit
  0) when the artifacts are absent.
- Browser: `smoke:browser` (Playwright/Chromium, `--only name`,
  `--list`, `--json report`) — 11 scenarios: debugger, stdin,
  definitions, transcript, persistence, replace, landing (+ the docs
  site), history, sbcl, engine, offline (service worker). Refuses a
  stale `dist/` unless `--allow-stale`. In CI the `smoke` job runs on
  pull requests labelled `smoke` and on every push to `dev`.

When you touch the worker or the helper, run at minimum:

```sh
cd app
pnpm test:boot -- --exercise      # ECL, real image + sample
pnpm test:sbcl                    # SBCL, real image
pnpm smoke:browser -- --only sbcl # browser, if UI/engine-visible
```

## The SBCL artifact pipeline

The artifacts are built from the sbcl repo (branch `wasm-dev`,
`./build-wasm-darwin-arm64.sh`, ~35 min; `version.lisp-expr` must be
non-empty in a fresh clone). `scripts/fetch-sbcl.mjs [--gzip]` copies
`sbcl.wasm` / `sbcl.core` / `sbcl-core.wasm` into gitignored
`public/sbcl/`; **only the `.gz` copies are tracked** (~19 MB total,
`!app/public/sbcl/*.gz` in `.gitignore`) — the runtime, core and core
module must come from one build (the ABI changes between port sprints).
The worker fetches `.gz` first and inflates with `DecompressionStream`.
After syncing artifacts, run `pnpm test:sbcl` before committing.

## Conventions

- Work lands as **sprints**: branch `sprintN` → PR into `dev` → CI green
  → merge; `Sprints/SprintN/` documents it (01 goal/plan … 04 next
  proposal). Direct `dev` commits are fine for chores.
- Every behavioural change ships with a harness or smoke assertion the
  first time it is exercised — several browser-only bugs survived only
  because a path had never been tested (see Sprints/Sprint25).
- No new dependency without a harness-visible reason; no backend.
- Match the existing style: TS strict, plain-JS hand-written workers
  (`/* eslint-disable */`, ES5-ish idioms), marker protocol first.

## Release process

The checklist is [RELEASE.md](RELEASE.md); in short:

1. `pnpm check` green (lint + build + all harnesses) on `dev`, and
   `pnpm smoke:browser` (all scenarios) against a fresh `pnpm build`.
2. The version lives in `app/package.json` only: `vite.config.ts`
   defines `__APP_VERSION__` from it for the boot screen, About and the
   service-worker registration (`./sw.js?v=<version>`, which names the
   cache — a new version drops the old cache on activate).
3. Pull request `dev` → `main`, merged when green; tag `v<version>` on
   the merge commit; GitHub release with the `CHANGELOG.md` entry.
4. Deploy `app/dist/` behind `Cross-Origin-Opener-Policy: same-origin`
   and `Cross-Origin-Embedder-Policy: credentialless` (required for the
   SBCL engine; ECL works either way), with `sw.js` at the site root and
   not long-cached, and every SPA route serving `index.html`.

## Known open ends

- **ANSI screen (cells)**: cells whose output is escape-code driven
  (clear/cursor/SGR — the Matrix-effect style) render as a live
  terminal grid (`src/terminal/ansi.ts`, the `ansi screen` block in the
  cell; `pnpm test:ansi` covers the parser). SBCL streams such output
  live (the worker flushes escape-carrying partial lines). ECL's wasm
  build only flushes stdout per newline, which escape-driven programs
  never emit — the screen stays blank there; that needs an ECL-side
  flush, not a ConsCell fix.

- Ctrl-C delivery to Lisp is unimplemented in the sbcl port itself
  (`wasm-arch.c`) — `interrupt()` respawns the SBCL image; drop the
  respawn when a port build grows delivery.
- SBCL on static hosts without COOP/COEP: falls back to ECL (clear
  boot-log message).
- Plain (uncompressed) SBCL artifacts are still in early git history
  (~124 MB); a history rewrite is proposed but undecided
  (Sprints/Sprint26/04-next-sprint.md, item BK).
