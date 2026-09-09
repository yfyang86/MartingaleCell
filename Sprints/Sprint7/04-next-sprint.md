# Sprint 8 — Proposed plan

## The remaining speed step needs a rebuilt WECL

With the trampolines fixed, the image runs a bytecode in ~3 µs; a native
ECL is still ~50× faster. What remains is structural: the JS round trip
per setjmp-bearing call and Asyncify's instrumentation. A rebuilt WECL
(`-sSUPPORT_LONGJMP=wasm`, JSPI instead of Asyncify, `-O2`, assertions
off) would remove both and, as a side effect, make a cooperative
interrupt possible. It needs ECL's sources and an Emscripten toolchain —
a separate environment, a separate branch, and the current image kept as
the fallback. Recipe and expected effect are in Sprint 7's notes.

## Candidates for the next in-repo sprint

### A. Examples that show the speed (small)
The gallery's Fibonacci benchmark and a couple of numeric examples now run
in under a second; make the expected-output cells reflect real timings and
add one "how fast is it" example with the loop table.

### B. Entry-chunk diet (small)
Lazy-load the landing page's framer-motion / gsap / lenis effects; the
IDE chunk is the one that matters and is already separate.

### C. `#|…|#` block comments in the offset probe (small)
`%skip-blank` handles `;` comments; block comments before a form still
shift the recorded definition offset to the comment start.

### D. Session export as a notebook (medium)
Cells already persist; an export to a Markdown/`.lisp` transcript with
values, warnings and plots would make sessions shareable beyond the URL
hash, which only carries the buffer.

### E. Workspace-level search (medium)
Search across project files from the explorer, with results that jump
(the go-to-definition plumbing already opens files at a line).

## Suggested Sprint 8 scope
A + C + D, with B if time allows. Same loop.
