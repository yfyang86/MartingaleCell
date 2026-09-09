# Sprint 7 — Proposed plan

## Lead candidate: make the image faster

Sprint 6 measured the interpreter at roughly 13 000 loop iterations per
second, unchanged by `compile`, `(speed 3)` or fixnum declarations. That is
slow enough to change what people will write in a cell. Before touching
the UI again, find out where the time goes:

1. **Profile in the browser.** Chrome's profiler over the wasm while a
   loop runs: is it the bytecodes interpreter, generic arithmetic and
   consing, the GC, or Asyncify's instrumentation of every call?
2. **Cheap wins inside the image.** `si::*interpreter-…*` tunables, a
   larger nursery / fewer GCs (`ext:set-limit`, `(si::gc-stats)`), and
   whether `ext:*bytecodes-compiler-*` options exist in this build.
3. **A rebuilt WECL** if the profile says Asyncify: WECL's build flags are
   upstream ECL's `wasm32-unknown-emscripten` target; a build with JSPI
   (`-sJSPI`) instead of Asyncify removes the instrumentation tax and,
   as a bonus, could add the periodic yield that a real interrupt needs.
   This is the first sprint that would touch the third-party image; treat
   it as a spike with its own branch and keep the current image as the
   fallback.

## Also worth doing

- **Session persistence of definitions.** The definition index dies with
  the worker; replay it from the session replay action, or re-index from
  the project on boot when a project is open.
- **Entry-chunk diet.** Still 196 kB gzipped for the landing page.
- **`#|…|#` block comments** in `%skip-blank` and in the tokenizer's
  top-level form splitting are handled by the reader but not by the
  offset probe; rare, small.

## Suggested Sprint 7 scope
Profile first (half a day), then whichever of 2 or 3 the numbers justify,
plus definition persistence. Same loop.
