# Runtime Integration Brief — Common Lisp in the browser (verified 2026-09-07)

## PRIMARY: WECL — real ECL (ANSI Common Lisp) compiled to WebAssembly
- Author: Daniel Kochmański (ECL maintainer); built from upstream ECL's official `wasm32-unknown-emscripten` target. LGPL-2.1+ heritage.
- **Self-hosted in this repo** at `public/wecl/` (turtleware.eu has no CORS headers — MUST be served same-origin; do NOT load from CDN):
  - `/wecl/boot.js` (2,775 B) — creates `var Module = {}` and globals
  - `/wecl/wecl.js` (120,535 B) — Emscripten glue; fetches `wecl.wasm` relative to itself
  - `/wecl/wecl.wasm` (9,471,642 B) — the CL image
- **JS API** (all cwrapped `{async:true}` via Emscripten Asyncify → return Promises, MUST be awaited):
  - `wecl_eval(string)` → evaluates CL source; returns void; results come via printed output
  - `wecl_call(funId, argString)`, `wecl_lcall(fn, ...args)`, `wecl_lprep(fn)`
  - `wecl_init_hooks` — array; push callbacks to run after boot completes
- **stdout/stderr capture:** assign handlers AFTER loading `boot.js`, BEFORE `wecl.js` executes:
  `Module.print = (t) => {...}` (CL `*standard-output*`), `Module.printErr = (t) => {...}` (`*error-output*`)
- Minimal usage:
  ```js
  // after boot.js loaded:
  Module.print = (t) => { stdout += t + '\n'; };
  Module.printErr = (t) => { stderr += t + '\n'; };
  wecl_init_hooks.push(async () => {
    await wecl_eval('(princ (+ 1 2))');  // stdout === "3"
  });
  // then load wecl.js
  ```
- In React: load both scripts dynamically (script tags) in a Web Worker or on main thread. Prefer a **Web Worker** (design.md specifies one) so eval doesn't block UI; use Asyncify promises + postMessage protocol. If worker integration proves too costly for the schedule, main-thread load with async await is acceptable.
- To get *values* back, wrap user code so the REPL prints values, e.g. eval:
  `(let ((vals (multiple-value-list <form>))) (format t "~&;;=> ~{~s~^ ~}" vals))` style wrapper, or just eval user code verbatim and let CL print naturally. Keep it simple: capture printed output + echo.

## FALLBACK: JSCL (JS, NOT wasm) — only if WECL fails to load in the user's browser
- `https://cdn.jsdelivr.net/npm/jscl@0.9.0-alpha.0/dist/jscl.min.js` (200, CORS `*`)
- API: `jscl.evaluateString(str)` (one form; wrap in progn), convert results with `jscl.internals.lisp_to_js(...)`
- Capture stdout: override `jscl.packages.JSCL.symbols['%WRITE-STRING'].fvalue = function(values, s){ out += jscl.internals.lisp_to_js(s); return s; }`
- Show a runtime-status pill in the UI: "ECL (WASM)" vs "JSCL fallback".

## DEAD ENDS (do not attempt)
- SBCL→WASM: does not exist (no wasm backend). CLASP: no wasm target. No npm packages (`ecl-wasm`, `common-lisp-wasm` etc. all 404).

## Branding note
design.md names the product "MartingaleCell" and mentions "SBCL→WASM" — the actual engine is ECL (WECL). UI copy should say "ECL — ANSI Common Lisp, compiled to WebAssembly". Keep the MartingaleCell branding.
