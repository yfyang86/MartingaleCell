# Sprint 27 — Goal and plan

Date: 2026-09-10 · Branch: `sprint27` → PR into `dev` · Requested: an explicit engine choice with loading progress; ECL sometimes cannot be brought back

## Goal

Settings → Lisp implementation offers `auto | ecl | sbcl`, each engine
shows its download progress while booting, and choosing ECL always
brings ECL back.

## What was wrong (read from the code)

- The Segmented control read the preference once (`value={getEnginePref()}`)
  and nothing re-rendered on a click, so the choice looked unchanged;
  a second click could flip it back.
- The preference lived only in `localStorage`, outside the workspace,
  so "Reset workspace" (and any export/import of settings) kept `sbcl`.
- There was no `ecl` choice: `auto` and a failed SBCL both fall through
  the ECL → JSCL → mock ladder, so a user who wants ECL and gets JSCL or
  the mock has nothing to press but Retry.
- The boot screen's bar was a line counter (`lines / 6`), not progress:
  a 19 MB or 9 MB download showed no movement.

## Scope

### BN. Engine choice (small)
`settings.engine: 'auto' | 'ecl' | 'sbcl'` in the workspace settings
(persisted, reset with the workspace) mirrored into `localStorage` for
the runtime's synchronous read at boot. Semantics: `auto` — ECL first,
then JSCL, then the mock (unchanged); `ecl` — ECL only, a failure stays
a failure with Retry; `sbcl` — SBCL, then ECL when the artifacts are
missing or the boot fails. The Settings control is driven by the store
(re-renders), and the toast offers "Restart now".

### BO. Loading progress (small-medium)
Both workers report `{ type: 'progress', file, loaded, total }` while an
artifact streams in: the ECL worker wraps `fetch` for `.wasm` so the
Emscripten glue's own `instantiateStreaming` sees a Response whose body
is counted; the SBCL worker wraps its artifact fetches (the `.gz`
sizes). The runtime forwards them, the store keeps `bootProgress`, and
the boot screen shows the file, MB loaded / total and a real bar.

### Tests
The artifact loader test checks that a streamed fake response yields
progress messages ending at the total; the harnesses keep working
without web streams in their sandboxes; the smoke's `sbcl` scenario
runs as before; a `persistence`-style check switches to `ecl` and
restarts.

## Acceptance
- Choosing `ecl` and restarting boots ECL every time, including after an
  SBCL session and after a workspace reset.
- The boot screen shows `sbcl.core.gz 8.1 / 13.3 MB` (and `wecl.wasm
  4.2 / 9.0 MB`) moving during a boot.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
