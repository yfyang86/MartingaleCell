# Sprint 23 — Implementation

Branch `sbcl-dev`. All three items (AS/AT/AU) landed; the SBCL engine
boots the real image and passes its harness.

## AS. The SBCL browser host — `app/public/sbcl-worker.js`

- **WASI preview1 shim** over an in-memory FS: args/environ, clocks,
  fd_read/fd_write/fd_seek/fd_close/fd_fdstat/fd_filestat, preopens
  (fd 3 = "/"), fd_readdir, path_open/filestat/create-dir/unlink/rename,
  poll_oneoff, proc_exit. Std fds 0/1/2 report as **character devices**:
  SBCL's `unix-simple-poll` (the #+wasm branch in `src/code/unix.lisp`)
  then treats them as always-ready and the block happens in `fd_read`
  itself — with filetype 0 SBCL spins in a wasi-libc select loop
  (measured: millions of poll_oneoff calls, no progress). Char devices
  also make libc line-buffer stdout, so markers flush per line.
- **`sbcl_host` imports** per SBCL-Handoff §4.2: a synchronous
  `instantiate` (copy bytes out of linear memory, `new WebAssembly.Module`,
  read the `sbcl.core.table` custom section, grow the shared funcref
  table, link against the runtime's memory/table/`thread`/`table_base`
  globals, ONE shared `lisp_unwind` WebAssembly.Tag and the four runtime
  entry points, plus `table`-module imports by decimal index), `set_timer`
  (JS deadline, bit 16 of the interrupt-pending word at the next clock
  read — V8 has no epoch interruption), `run_process` → -1, `process_id`.
  `env`: madvise & co bound to stubs.
- **Threading model**: after boot the worker thread lives inside
  `_start()` — the SBCL REPL sits in our fd_read when idle. The page
  submits requests through a SharedArrayBuffer (form ring, stdin ring,
  single-slot JSON mailbox, interrupt flag); the imports serve them,
  `Atomics.wait` is the block; output flows back as WorkerOutMessage.
  Every fed form ends in a `;;CC-DONE` marker = job-done; `*repl-prompt-fun*`
  is set to a no-op so the prompt never glues onto output lines, and each
  fed form carries a trailing blank line (SBCL's reader otherwise parks a
  fully-buffered form until more input arrives — verified empirically).
- **The Lisp helper** (`SBCL_HELPER_SRC`): a port of the wecl worker's
  `cc` package — eval-string with the full marker protocol (;;=>, ;;ERROR:,
  ;;ERRTYPE:/;;DETAIL:, ;;WARNING:, ;;PACKAGE:), per-form project loading
  (;;FILE:/;;PKG:/;;SYM:/;;DEF:/;;NOTE:/;;HINT:), module management under
  /modules, restart-based debugger pause. Blocking waits read the magic
  `/dev/cc-stdin` (a WASI fd whose fd_read blocks on the stdin ring) —
  the js-wait equivalent; `*standard-input*`/`*query-io*`/`*terminal-io*`
  are bound to a Gray `%stdin` stream so user reads never touch the form
  channel, with `;;READ-WAIT` as the page's cue.
  The helper is delivered read/eval per form inside one fed form
  (`with-input-from-string` + loop): the whole fed form is READ before it
  runs, so an `(in-package :cc)` inside it could never affect the reader
  otherwise (found under the reference host: `Package CC does not exist`
  mid-form).

## AT. Engine plumbing

- `types.ts`: `EngineKind` + `'sbcl'`, `EngineStatus` + `'ready-sbcl'`.
- `runtime.ts`: `bootEcl` refactored into generic `spawnWorker(url,
  engine, label, opts)` (both workers speak the same outbound protocol;
  the SBCL one additionally posts `{type:'sbcl-sab', sab}` before
  ready); `send()` routes requests (postMessage for ECL, mailbox write
  for SBCL); interrupt is a real Ctrl-C (interrupt-pending bit, serviced
  at the next clock read) instead of a respawn; modules
  snapshot/restore/persist and package/print-length apply to both worker
  engines. Settings → "Lisp implementation: auto | sbcl"
  (localStorage `conscell-engine-pref`; auto keeps the ECL→JSCL→mock
  ladder; sbcl falls back to ECL when `/sbcl/` is missing). Boot timeout
  120 s (the artifacts are ~112 MB).
- UI: `ready-sbcl` handled in Toolbar/StatusBar/ExplorerPanel/Ide/
  actions/SettingsDrawer (labels, colors, run-enablement, export
  metadata).

## AU. Artifacts + tests

- `scripts/fetch-sbcl.mjs` copies sbcl.wasm/sbcl.core/sbcl-core.wasm
  from a local sbcl checkout into gitignored `public/sbcl/`.
- `scripts/sbcl-test.mjs` boots the real worker in a real
  `worker_threads` thread (so SAB/Atomics.wait behave as in the browser;
  memory/stack raised; re-execs itself with `--experimental-wasm-exnref`,
  which Node still gates, browsers ≥ Chrome 137 ship it). Exercises: a
  warm-up eval, printed output, error reporting (type + details),
  defpackage/in-package persistence across jobs, a cross-job defun call,
  a 3-file asd project load with marker assertions, a post-load
  acceptance eval, a `;;READ-WAIT` stdin round trip, and a clean
  `(sb-ext:exit)`. Skips (exit 0) without artifacts. Wired into
  `pnpm test` and CI.
