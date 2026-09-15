# Sprint 29 — Implementation notes

## BU. Every series path on a `plot` line

`%plot-data-paths` (Lisp helper seeded into both workers, identical in
`app/public/sbcl-worker.js` and `app/public/wecl-worker.js`) used to
find the first `"` on a `plot`/`replot` line and take the string up to
the next `"`. A line such as

    plot "/tmp/a" using 1:2 title "a" with lines, "/tmp/b" using 1:2 title "b" with points

therefore shipped only `/tmp/a` in the `;;PLOT64` payload; the browser
parser (`parsePlotCommand` in `src/plot/gnuplot.ts`) already split the
line into two series but found no content for `/tmp/b` and drew an
empty series.

The new `%plot-line-paths` walks the line once with an `expect` flag:
the first quoted string after the keyword is a path, a quoted string
that follows a comma is a path, any other quoted string (a `title`) is
skipped, and an empty `""` (gnuplot's "same file again") is ignored.
`%plot-data-paths` keeps its line loop and de-duplicates across lines
with `pushnew`. This mirrors the browser's `split(/,(?=\s*")/)` so the
two ends agree on what a series is.

Both harnesses gain the same eval job (`TWO_SERIES_CODE`): it writes
two data files and a script whose `plot` line names both, with quoted
titles between them, and runs it through `ext:shell`, which
`%shell-dispatch` intercepts as a gnuplot script.

- ECL harness (`boot-harness.mjs --exercise`, job 105, check 14): the
  payload unpacked by the real `unpackPlotPayload` lists exactly
  `/tmp/cc-two-a.dat,/tmp/cc-two-b.dat`, the second file has its own
  rows, and the real `parseGnuplot` yields `a:lines:2 b:points:2` with
  the second series' second point at y = 40.
- SBCL harness (`sbcl-test.mjs`, job 116): the decoded payload contains
  both path strings and both file bodies, and neither `"a"` nor `"b"`
  was shipped as a data file.

## BV. Licence wording and the LICENSE file

- Root `LICENSE` (MIT) added, with a trailer pointing at the README's
  licence notes for the third-party components. `package.json` now
  carries `"license": "MIT"`.
- `README.md`, `README.zh-CN.md` and `app/README.md`: SBCL is described
  as mostly public domain with MIT-style and BSD-style parts, deferring
  to its `COPYING`; the wasm port is named as our re-work of that source
  ([yfyang86/sbcl](https://github.com/yfyang86/sbcl)) from which the
  `.gz` artifacts are built. WECL is described as shipped unmodified
  under LGPL-2.1+, notice kept, not linked against (worker message
  protocol only), with the source available from the ECL project. The
  "LICENSE lands with the alpha tag" promise is gone because the file is
  here. The engine comparison table's licence row follows.

## BM. SBCL boot cache — spike result: not implemented

Measured in headless Chromium against `pnpm preview` (local, so fetch
time is a floor, not a network figure), engine preference `sbcl`, three
boots in one browser context (first cold, then two reloads):

| boot | fetch + inflate (worker's own clock) | artifacts loaded (from navigation) | ready (from navigation) |
|---|---|---|---|
| cold | 1.2 s | 2.15 s | 6.5 s |
| warm 1 | 1.0 s | 1.8 s | 5.5 s |
| warm 2 | 0.6 s | 1.45 s | 4.0 s |

Fetching the `.gz` copies and inflating 124.7 MB is 0.6–1.2 s. The
remaining 2.5–4.3 s is `WebAssembly` instantiation of the 44 MB core
module plus the image's own initialisation, which a byte cache does not
touch. A cache of the inflated bytes would cost ~125 MB of Cache API
or IndexedDB storage per origin and read it back at roughly the speed
of the inflate it replaces, for at most a second. Decision: no cache.

What would help is compiled-module caching: Chromium caches compiled
wasm for `WebAssembly.instantiateStreaming` over a fetched `Response`,
which the current path (inflate in memory, compile from bytes) does not
trigger. Getting there means serving `sbcl-core.wasm` with
`Content-Encoding: gzip` from the host (pre-compressed, so the browser
inflates and the code cache applies) instead of a `.gz` file the worker
inflates itself. That is a hosting decision, recorded for a later
sprint, not a worker change.

## Files touched

- `app/public/sbcl-worker.js`, `app/public/wecl-worker.js` —
  `%plot-line-paths`, `%plot-data-paths`.
- `app/scripts/boot-harness.mjs` — job 105 and check 14.
- `app/scripts/sbcl-test.mjs` — job 116.
- `LICENSE` (new), `app/package.json`, `README.md`, `README.zh-CN.md`,
  `app/README.md`.
