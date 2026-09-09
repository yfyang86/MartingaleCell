# Sprint 5 — Proposed plan

Four sprints in, the runtime is a real REPL: packages, settings, honest
errors, a debugger with restarts, and standard input. What remains is
mostly about *projects* and *the parts that are still mock-shaped*.

## Candidates, ranked

### A. Project loads through the debugger (medium)
`%load-file-forms` still swallows per-form errors with `handler-case`. Offer
"pause on first error" for Load Project: a broken file can be fixed in
place with STORE-VALUE / DEFINE-FUNCTION / RETRY instead of being skipped.
The pause protocol exists; the load cell needs the `DebuggerBlock`.

### B. Nested error while a restart runs (small)
An error inside a chosen restart (e.g. a DEFINE-FUNCTION lambda that itself
errors on retry) currently surfaces as a plain `;;ERROR:`. Re-pause instead
— `eval-one` already re-enters itself on RETRY, so this is a matter of
routing the second signal through `%debug-pause` again.

### C. Mock and JSCL rungs (decision + small)
Decide whether the mock interpreter and the CDN-loaded JSCL fallback still
earn their place now that the ECL path is solid. Whatever stays, make the
fallback state louder in the runtime pill and disable the debugger /
stdin UI honestly on those rungs (they cannot pause).

### D. Examples that use the new powers (small)
Add gallery examples for `read-line` / `y-or-n-p`, a `restart-case`
walkthrough, and a "fix it live" undefined-function demo; wire them to the
docs' debugger section.

### E. Entry-chunk diet (small)
Lazy-load framer-motion/gsap/lenis effects on the landing page.

## Suggested Sprint 5 scope
A + B + D, with C as a decision recorded in the sprint docs. Same loop.
