# Sprint 25 — Implementation

Branch `sprint25`. The browser turned out to be where the real bugs
were; Node's harness had been silently forgiving all of them.

## The first checks (Sprint 24's AV gate)

- `pnpm fetch:sbcl --gzip` — worked as cherry-picked (~123 MB → 18.7 MB
  of .gz copies; the worker fetches .gz first and inflates with
  DecompressionStream).
- `pnpm test:sbcl` — green immediately.
- `node scripts/browser-smoke.mjs --only sbcl` — FAILED twice:

### 1. SharedArrayBuffer needs a crossOriginIsolated page
The worker's `new SharedArrayBuffer` threw instantly (no COOP/COEP
headers → the engine fell back to ECL before fetching anything).
- `vite.config.ts`: dev + preview now send `Cross-Origin-Opener-Policy:
  same-origin` and `Cross-Origin-Embedder-Policy: credentialless`
  (ECL/JSCL/mock don't care; a static host must send them for SBCL).
- The worker says so instead of dying on a bare ReferenceError.
- `playwright` added as a devDependency (the smoke script previously
  relied on a global install that no longer exists).

### 2. Browsers reject shared ArrayBufferViews in TextDecoder
The smoke then booted SBCL but every job died with "did not drain its
mailbox": Chrome's `TextDecoder.decode` (and friends) refuse views over
a SharedArrayBuffer — Node accepts them, which is why the harness never
caught it. `mailboxTake` now copies the bytes out of the SAB before
decoding. Found by stepping `serveForm` with per-statement console
traces in the worker (loop error surfaced the TypeError with a stack).

With those two fixed the smoke passes: SBCL boots (≈5 s warm), a cell
evaluates `(:ENGINE "SBCL" 42)`, no page errors.

## Hardening (the extended sbcl-test.mjs)

Each new job found one real bug:

- **with-timeout / set_timer**: `sbcl_host.set_timer` is an i64 import —
  `usec` arrives as a BigInt and `usec / 1000` throws ("Cannot mix
  BigInt"). Coerced with `Number(usec)`. With that, the timer bit (16)
  flows: `;;=> :TIMEOUT`.
- **debugger pause**: `(eval … :debug t)` on an error prints ;;DEBUG: /
  ;;RESTART: / ;;DEBUG-WAIT and blocks on /dev/cc-stdin; a decline
  (restart −1) falls through to ;;ERROR:. Worked as built (the Sprint 19
  gap was only test coverage).
- **runaway recursion**: SBCL's control-stack guard fires —
  `;;ERRTYPE: CONTROL-STACK-EXHAUSTED` (a storage-condition) in the
  512 MB-stack harness worker, no engine crash. The harness accepts
  either spelling.
- **the interrupt bit (Ctrl-C)**: the plumbing works end to end (the
  flag is consumed, the port prints "; interrupt request seen at a safe
  point"), but the PORT leaves delivery to Lisp unimplemented
  (`wasm-arch.c`: "delivery to Lisp is not implemented yet"). So
  `runtime.interrupt()` for SBCL now sets the bit AND respawns the
  image — the same abort-and-restart semantics ECL has.
- **package-install + modules round trip**: two more real bugs.
  - `fd_readdir`'s cookie is a u64 → BigInt in the loop arithmetic;
    coerced (`Number(cookieBig)`).
  - `path_readlink` returned ENOENT for everything, which makes
    realpath — and with it probe-file/truename — fail for every path;
    it now returns EINVAL for existing non-links (ENOENT stays for
    missing ones). probe-file works again.
  - `(directory …)` still cannot enumerate: this port build has no
    `sb-unix:unix-opendir` (filesys.lisp's directory iterator needs
    it). The helper's `%mod-project-files` therefore tracks the file
    list `load-project` already receives instead of globbing the FS.
  With those: `package-install "cc-demo"` copies sources under
  /modules, `;;MODULES-CHANGED` fires, `modules-snapshot` returns the
  registry + sources, `modules-restore` + `package-list` sees the
  restored registry, clean `(sb-ext:exit)`.

The stale per-step timeouts in the harness (an early step's 30 s timer
could fail a later step) are now a single `stepTimeout` that replaces
the previous one.

## Files

- `app/public/sbcl-worker.js` — SAB creation guard, mailbox copy,
  set_timer/fd_readdir BigInt coercion, path_readlink errno,
  *project-files* tracking, stack in bootstrap failures.
- `app/vite.config.ts` — COOP/COEP for dev + preview.
- `app/src/lisp/runtime.ts` — interrupt() respawns SBCL (bit still set).
- `app/scripts/sbcl-test.mjs` — jobs 107–112 + snapshot/restore ops.
- `app/package.json` + lockfile — playwright devDependency.
