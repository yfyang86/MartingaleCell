# Vendored runtime releases

Self-contained build artifacts for the in-browser engines, so the repo
can reproduce a working IDE without building the runtimes locally.

- `sbcl-2.4.8-wasm.1-macos-arm64.zip` — the SBCL 2.4.8 WebAssembly port
  release (built from the `wasm-dev` branch, macos-arm64 host). Contains
  `Release/sbcl-home/` plus the runtime artifacts; unzip and point
  `scripts/fetch-sbcl.mjs` at the checkout, or copy `sbcl.wasm`,
  `sbcl.core` and `sbcl-core.wasm` into `app/public/sbcl/` yourself.

The app itself ships the preprocessed artifacts it needs (gzip'd) under
`app/public/sbcl/`; this zip is the upstream source of record.
