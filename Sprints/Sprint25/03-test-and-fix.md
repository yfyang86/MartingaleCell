# Sprint 25 — Test and fix

Final state, all on this machine against the real image built from
sbcl `wasm-dev` (artifacts + .gz copies in gitignored public/sbcl/):

- `pnpm fetch:sbcl --gzip` — sbcl.wasm.gz 0.5 + sbcl.core.gz 13.3 +
  sbcl-core.wasm.gz 4.9 ≈ 18.7 MB over the wire.
- `pnpm test:sbcl` — PASS. Full sequence: warm-up eval, printed output,
  DIVISION-BY-ZERO with details, package persistence, cross-job defun,
  asd-ordered project load with markers, post-load acceptance,
  ;;READ-WAIT stdin round trip, **with-timeout → :TIMEOUT**, **debug
  pause + decline**, **runaway recursion → CONTROL-STACK-EXHAUSTED**,
  **interrupt request acknowledged by the port**, **package-install +
  modules snapshot/restore + package-list**, clean exit.
- `node scripts/browser-smoke.mjs --only sbcl` — PASS (3 checks) after
  the COOP/COEP and shared-view fixes; SBCL boot ≈5 s warm.
- `pnpm lint`, `pnpm build` clean; the whole `pnpm test` chain (15
  harnesses) green.

The debug loop, for the record: the browser failure modes were
invisible to the Node harness because (a) Node allows SharedArrayBuffer
without isolation, (b) Node's TextDecoder accepts shared views, (c) the
BigInt import arguments only surface when a code path actually runs
(set_timer first fired with with-timeout, fd_readdir's cookie first
fired with package-install). Lesson banked: every new host-side surface
needs its own harness job the first time it's exercised.

Known limitations (honest list):
- Ctrl-C delivery to Lisp is a port limitation ("interrupt request seen
  … not implemented"); ConsCell interrupts by respawn, like ECL.
- `(directory …)` cannot enumerate (no sb-unix:unix-opendir in this
  port build) — the module copier uses the known project file list.
- SBCL on a static host needs COOP/COEP headers (vite dev/preview have
  them); without them the engine bootfails with a clear message and
  falls back to ECL.
- The gzip boot fetch itself was not re-timed precisely this sprint
  (≈5 s warm in the smoke, artifacts cached); a progress line for the
  fetch is still open.
