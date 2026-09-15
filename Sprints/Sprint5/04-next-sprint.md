# Sprint 6 — Proposed plan

Five sprints in, the runtime side is complete for a notebook REPL:
packages, settings, honest errors, a debugger that also covers project
loads, standard input, and honest fallbacks. The next gains are in the
editor and in how projects are worked on.

## Candidates, ranked

### A. Definitions you can jump to (medium)
The completion index knows project symbols after a load, but "go to
definition" only searches open buffers by regex. Have the worker report
source locations for project-defined symbols (`;;SYM:` already lists them;
add the file and, via `read`'s file position, the form offset) and wire
Ctrl+click / a palette command to open the file at that spot.

### B. Compile notes in the log (small)
`compile` mode and project loads produce ECL compiler notes and style
warnings that currently land in the OUT well as noise. Route
`;;WARNING:` lines that carry a file/form context into the log's WARNINGS
tab with a jump link, like the existing "redefining" warnings.

### C. Interrupt without losing the image (research, time-boxed)
Interrupt still means "kill the worker". With Asyncify, the image could
poll a shared flag at safe points (e.g. in `%warn`, `%stdin-fill`, and a
periodic hook) — a real `SIGINT` equivalent would need cooperative
checks inside long-running user loops, which ECL does not offer. Spike:
can `ext:*interrupt-enable*` / `si::interrupt-process` be driven from a
`js-eval` callback? Outcome recorded either way.

### D. Entry-chunk diet (small)
Lazy-load the landing page's framer-motion / gsap / lenis effects; the
entry chunk is still 196 kB gzipped for a page that is mostly text.

### E. Docs pass (small)
FeatureMatrix and the docs sections should reflect Sprints 3–5: the
debugger row, stdin, the package pill, the settings that exist.

## Suggested Sprint 6 scope
A + B + E, with C as a time-boxed spike. Same loop.
