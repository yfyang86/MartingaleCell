# After 1.0.0-beta.0 — Proposed plan

`dev` is at `1.0.0-beta.1`; the sprint loop continues into `dev`, and
the next release repeats `RELEASE.md`.

## Candidates

### BW. Streaming SBCL artifacts for the browser's code cache (medium)
Once the host is chosen: serve `sbcl-core.wasm` pre-compressed with
`Content-Encoding: gzip` and instantiate it with
`WebAssembly.instantiateStreaming`, keeping the in-memory inflate as
the fallback (Sprint 29 spike: 2.5–4.3 s of a 4–6.5 s boot is
instantiation + image init).

### CJ. Precache the engine artifacts (small)
The service worker stores the artifacts on first fetch; precaching them
at install would make even the first boot offline-capable at the cost
of a 19 MB download on the first visit to any page.

### CK. Plot evaluator: user-defined functions (small)
`f(x) = …` lines and gnuplot's integer division.

### BB-2. Session-box search: fuzzy match and cell jump (small)
Ctrl+R matches substrings; a fuzzy match and a "jump to In [n]" action
on the entry would round it off.

### BK. Plain-artifact history rewrite (destructive, owner's call)
~124 MB of uncompressed artifacts remain in early history
(Sprints/Sprint26).

## Suggested next scope
CJ + CK, with BW as soon as hosting is settled.
