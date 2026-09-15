# Sprint 30 — Proposed plan

## Candidates

### BW. Streaming SBCL artifacts for the browser's code cache (medium)
Serve `sbcl-core.wasm` pre-compressed with `Content-Encoding: gzip` and
instantiate it with `WebAssembly.instantiateStreaming` so Chromium's
compiled-module cache applies on a warm boot (the Sprint 29 spike put
2.5–4.3 s of a 4–6.5 s boot in instantiation + image init). Needs a
hosting decision (which server serves the alpha) and a fallback to the
current in-memory inflate where streaming is unavailable.

### BL. SBCL in the docs site (small)
A card on switching engines and what differs (boot time, licence,
`sb-thread` absent, the `ext:shell` intercept).

### BB. Session-box search across cells (small)
Carried.

### BX. Plot series without a data file (small)
`plot sin(x)` and `plot "" using 1:3` are parsed as series with no
points; the SVG should say so (a legend entry with "no data") rather
than draw nothing silently.

## Suggested Sprint 30 scope
BL + BX, with BW once the hosting question is settled.
