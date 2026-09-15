# Sprint 31 — Proposed plan

## Candidates

### BW. Streaming SBCL artifacts for the browser's code cache (medium)
Carried from Sprint 29's spike: serve `sbcl-core.wasm` pre-compressed
(`Content-Encoding: gzip`) and instantiate it with
`WebAssembly.instantiateStreaming` so Chromium's compiled-module cache
applies on a warm boot; keep the in-memory inflate as the fallback.
Needs the hosting decision first.

### BY. Function series drawn, not just named (medium)
`plot sin(x)` is footnoted as "not drawn". A small expression
evaluator (arithmetic, `sin cos tan exp log sqrt abs`, `x`, `**`) sampled
over the x-range would draw the common cases; anything it cannot parse
keeps the footnote.

### BZ. Service worker for offline use (medium)
The FAQ now says there is none. A minimal worker caching the app shell
and the engine artifacts would make the offline answer "yes"; it
interacts with the `.gz` fetch path and the COOP/COEP headers, so it is
a sprint of its own.

### BB. Session-box search across cells (small)
Carried.

## Suggested Sprint 31 scope
BY + BB, with BZ if the hosting question is still open (BW waits on it).
