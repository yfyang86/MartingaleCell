# ConsCell 1.0.0-beta.0

The first tagged release of ConsCell, a notebook-style Common Lisp IDE
that runs entirely in the browser: SBCL 2.4.8 compiled to
`wasm32-wasip1` as the default engine, ECL (WECL) as the fallback, a
CodeMirror editor, result cells with a real interactive debugger,
projects, gnuplot plots as SVG, and offline use after the first load.

What changed since the untagged alpha, by area, is in
[CHANGELOG.md](https://github.com/yfyang86/ConsCell/blob/main/CHANGELOG.md);
how to host it is in
[RELEASE.md](https://github.com/yfyang86/ConsCell/blob/main/RELEASE.md#4-deploy)
(COOP/COEP headers on every response, `sw.js` at the site root and not
long-cached, `.gz` artifacts served as-is, every SPA route serving
`index.html`).

## Engine artifacts shipped in this release

| File | Size | SHA-256 |
|---|---|---|
| `app/public/sbcl/sbcl.wasm.gz` | 526 777 B | `6e1c2f8f396f7d285f7032c3dfc23d0deb0ca3cb01185a91a2ed7c8aed8c4ad2` |
| `app/public/sbcl/sbcl.core.gz` | 12 448 824 B | `b627705281cc33cdf229db509f19e70b28a7f8095150582710ce57a13647f235` |
| `app/public/sbcl/sbcl-core.wasm.gz` | 5 160 249 B | `b7e74cd522fbaa4735105f28efdf17ea3466b8cef3af5af24b0d1905ad0a3ae5` |
| `app/public/wecl/wecl.wasm` | 9 471 642 B | `6e910806d34d01c0624774f498c024f7b8b63fbeac7332064d4b1be3c549c3c6` |

The SBCL artifacts come from the `wasm-dev` branch of
[yfyang86/sbcl](https://github.com/yfyang86/sbcl); the runtime, the core
and the core module must come from one build.

## Verification

Lint, type-check and build; the 17 Node suites (pure-TS rules and the
real-image harnesses for ECL and SBCL); the ECL harness with the bundled
cl-plot sample; the 11 Playwright smoke scenarios (debugger, stdin,
definitions, transcript, persistence, replace, landing and docs, history,
sbcl, engine, offline) — all green on the release commit, locally and in
CI (`check` and `smoke` jobs).

## Known limitations (beta)

- One Lisp image per tab; no `sb-thread`; no networking or subprocesses
  from Lisp (`ext:shell` is intercepted for gnuplot or reported cleanly).
- Ctrl+. restarts the SBCL image (the port cannot deliver Ctrl-C to Lisp
  yet); SBCL needs a `crossOriginIsolated` page, otherwise ECL boots.
- The first boot needs the network; the service worker caches the
  artifacts from then on.
- The JSCL fallback is a CL subset.
