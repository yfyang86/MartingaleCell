# Sprint 4 — Proposed plan

Three sprints in, the runtime layer is honest: packages persist, settings
work, errors carry their real type and frames, and the debugger is real.
Sprint 4 should turn to input and to the parts of the product that are
still mock-shaped.

## Candidates, ranked

### A. `(read-line)` and friends — the same pause primitive
`*standard-input*` currently fails with a C-level I/O error. Bind it to a
Gray/string stream that, when empty, `js-wait`s on the page for a line
(`;;READ-WAIT` marker → cell input prompt → `{type:'input', id, text}`).
The debugger already has the pause plumbing; this is the second consumer.
Acceptance: `(read-line)`, `(read)`, `(y-or-n-p)` work in a cell.

### B. Debugger polish
- Show the condition's *slots* for the common types (the expected type and
  datum for `type-error`, the name for `undefined-function` /
  `unbound-variable`) — `%note-error` can print them as `;;DETAIL:` lines.
- USE-VALUE for `undefined-function` / `unbound-variable`: the image does
  not offer these, but `eval-one` can establish them itself when the
  condition is one of those types (bind the symbol, retry the form).
- A nested error inside a chosen restart currently surfaces as a plain
  `;;ERROR:`; consider re-pausing instead.

### C. Project loads through the debugger
`%load-file-forms` still uses per-form `handler-case`. Offer "pause on
first error" as an option for project loads so a broken file can be fixed
in place (USE-VALUE / RETRY) instead of skipped.

### D. Mock and JSCL rungs
The mock interpreter is small and the JSCL rung loads from a CDN. Decide
whether to keep both, drop the mock, or vendor JSCL. Either way, make the
runtime pill's fallback state louder than it is now.

### E. Entry-chunk diet
The landing page still ships framer-motion, gsap and lenis (196 kB gzipped
entry). Lazy-load the marketing effects; the IDE chunk is the one that
matters and is already separate.

## Suggested Sprint 4 scope
A + the first two bullets of B, with C as stretch. Same loop: plan →
implement → test and fix → plan next → PR into `dev`, merge on green.
