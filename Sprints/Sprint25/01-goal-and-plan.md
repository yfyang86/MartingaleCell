# Sprint 25 — Goal and plan

Date: 2026-09-10 · Branch: `sprint25` → PR into `dev` · Follows
`Sprints/Sprint24/04-next-sprint.md` (item AV, pulled forward over
BE/BB/BG because the wasm build artifacts finally existed locally).

## Goal

The SBCL/wasm engine actually runs in the browser, and everything the
Sprint 23/24 proposals listed under "hardening against the real image"
is exercised: gzip'd artifacts, the browser smoke, timers, the debugger
pause, runaway recursion, the interrupt request, module persistence.

## Scope

### AV. SBCL hardening against the real image (medium)
First checks per the Sprint 24 plan — `pnpm fetch:sbcl --gzip`, `pnpm
test:sbcl`, `browser-smoke.mjs --only sbcl` — then everything they
expose, plus the carried hardening list (with-timeout, ;;DEBUG-WAIT
pause + decline, storage-condition on runaway recursion, the interrupt
bit, modules snapshot/restore round trip).

### Extra forced by the browser
COOP/COEP for SharedArrayBuffer; a browser-only TextDecoder
restriction; two BigInt coercion bugs in WASI/sbcl_host imports; a
path_readlink errno that broke probe-file.

## Out of scope
BE (.lisp transcript import), BB (session-box cell search), BG (smoke
summary in the PR) — next up. Real Ctrl-C delivery (the port itself
leaves it unimplemented). Making SBCL the default engine.

## Acceptance
- `pnpm fetch:sbcl --gzip && pnpm test:sbcl` green against the .gz
  artifacts (123 MB → ~19 MB over the wire).
- `node scripts/browser-smoke.mjs --only sbcl` green in Chromium
  (crossOriginIsolated via vite dev/preview headers).
- Lint, build, the full harness chain green.
