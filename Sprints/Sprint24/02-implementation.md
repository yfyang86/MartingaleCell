# Sprint 24 — Implementation notes

## AX. Artifact diet

`scripts/fetch-sbcl.mjs --gzip` writes `sbcl.wasm.gz`, `sbcl.core.gz`
and `sbcl-core.wasm.gz` next to the plain copies (zlib level 9). In
`public/sbcl-worker.js`, `loadArtifactBytes(path)` now goes through
`fetchGzipArtifact` first: it fetches `path + '.gz'`, and

- inflates it with `DecompressionStream('gzip')` when the bytes carry
  the gzip magic (`1f 8b`);
- uses the bytes as they are when they do not (a server that sends
  `Content-Encoding: gzip` hands the browser the inflated file);
- refuses an answer whose content type is `text/html` without the magic
  (a single-page-app fallback for a missing file);
- returns null on a 404, a network error, a missing
  `DecompressionStream`, or a corrupt stream — and the plain artifact is
  fetched as before.

The harness hook (`self.__ccSbclLoadBytes`) still short-circuits
everything, so `scripts/sbcl-test.mjs` reads the plain files from disk
as it did. `runtime.bootSbcl` accepts either `sbcl.wasm` or
`sbcl.wasm.gz` in its presence check (a HEAD that answers HTML counts
as absent).

`scripts/sbcl-artifact-test.mjs` evaluates the worker source in a Node
`vm` context — with the trailing `boot()` call stripped and a fake
`fetch` routing table — and checks nine cases on synthetic data; it
needs no artifacts and runs in `pnpm test` and CI.

## AW. SBCL in the browser smoke

`browser-smoke.mjs` gains a third outcome: a scenario may throw
`SkipScenario(reason)` and is reported as `– [name] skipped: reason`,
counted separately from passed and failed. The `sbcl` scenario skips
when `public/sbcl/` lacks any of the three artifacts (plain or `.gz`);
otherwise it sets `conscell-engine-pref = sbcl` in `localStorage`
before the page loads, boots, waits for the `SBCL · WASM` status and the
`SBCL 2.4.8` label, and evaluates
`(list :engine (lisp-implementation-type) (+ 40 2))` expecting
`(:ENGINE "SBCL" 42)`. It is in `NO_BOOT` because it boots its own
way. Not run against the real image here (see the plan's constraint).

Also fixed on the way: `--only` was read from the first argument even
when the flag was absent, so `browser-smoke.mjs --json x` treated
`--json` as a scenario name.

## BD. Value diff between runs

Values are one line each (the worker prints one value per `;;=>`
line), so `diffTokens(a, b)` in `src/session/diff.ts` tokenises a
printed value into parens, whitespace runs, strings and atoms and runs
the same LCS as the line diff. The history view renders a changed
value as those tokens — removed ones struck through in red, added ones
in green — with the plain value in `data-value` and the title.

## BF. Smoke report

`--json <file>` writes `{ startedAt, base, scenarios: [{ name, seconds,
checks: [{ label, ok, detail }], skipped, screenshot? }], passed,
failed, skipped, finishedAt }`. The CI smoke job runs with
`--json dist/smoke-report.json` and always uploads it together with any
failure screenshots as the `smoke-report` artifact.

## Docs and README

README: an "SBCL engine (experimental)" section with the fetch, gzip,
setting, harness and smoke scenario; the smoke line mentions `--json`.
Getting-started lead: the second engine can be selected in Settings.
