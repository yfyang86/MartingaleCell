# Sprint 35 — Goal and plan

Date: 2026-10-07 · Branch: `sprint35` → PR into `dev` · From the review of
the 28-commit `dev` update (rename, chemicl, SBCL memory quota, terminal
rework): the six blockers and the CI gap.

## Goal

Make the renamed, chemicl-equipped `dev` safe to ship: no data loss on
upgrade, no lost completions, no false crash after Interrupt, every
molecule drawn, no quartic layout pass, no script injection through a
plot payload — and every Node suite the repo has actually running in CI.

## Scope

### Blocker 1. IndexedDB keys were renamed without migration (small)
`rename-migration.ts` copies `localStorage` keys only; the six idb-keyval
keys (`workspace-v1`, `editor-states-v1`, `definitions-v1`,
`virtual-project-v1`, `dir-handle`, `modules-v1`) moved from
`conscell-*` to `martingalecell-*` so an upgraded profile boots with an
empty workspace, no editor state, no project and no installed modules.
Fix: `migrateStorage()` copies each old idb key to the new one when the
new one is still absent, and `main.tsx` awaits it before the first
render. The function takes injectable `get`/`set` so a Node test
(`scripts/storage-migration-test.mjs`) covers: copies when absent, keeps
the new value when present, ignores a profile without old keys,
survives a throwing store. The file header and CHANGELOG say what is
migrated.

### Blocker 2. Live symbol dump drops curated completions (small)
`registerLiveSymbols` skips a dump entry that is also curated, then adds
curated entries only when the dump lacks them — a symbol present in both
(`defun`, `format`, …) ends up in neither list. Fix: push the curated
list unconditionally; `completion-test` checks `defun` survives a dump
that contains it.

### Blocker 3. Stale SBCL submit after Interrupt (small)
`interrupt()` replaces the worker and the SharedArrayBuffer; a submit
queued on the old buffer keeps polling the old mailbox flag, times out
after 30 s and calls `onCrash` on the healthy new image, and every send
queued behind it is lost. Fix: `sbclSubmit` captures the buffer it
started with and aborts with a "channel replaced" error when the
runtime's buffer changes; `send()` ignores that error; `killWorker`
resets the queue.

### Blocker 4. chemicl: acyclic molecules render "(empty molecule)" (small)
`%layout` seeds only the first ring; `%place-chains` grows from placed
atoms, so a molecule without rings has no placed atom and
`molecule-svg` reports it empty (ethanol, hexane, every amino acid
chain). Fix: seed the first heavy atom when there is no ring, and seed
each still-unplaced component (disconnected SMILES, `.`) to the right of
the drawn bounding box.

### Blocker 5. chemicl: flip pass is ~O(N⁴) (small-medium)
Each candidate bond recomputes `%descendants` (O(N²) per call) and two
full `%overlap-score`s; 36 heavy atoms take 4 s on SBCL and 131 s on
ECL, 66 atoms 52 s. Fix: cache descendants per pass, skip the flip pass
above 60 heavy atoms, and guard `%orient-horizontal` with 2-arg `atan`.
`chemicl-verify` gains an acyclic assertion (`CCO` draws a bond line)
and a timing bound on a 66-atom chain; it also stops writing its bundle
to a fixed `/tmp` path and resolves its entry from the repo root.

### Blocker 6. Raw SVG payload injected unsanitised (small)
A `;;PLOT64` payload that starts with `<svg` is rendered with
`dangerouslySetInnerHTML` as-is, so a script, `<foreignObject>` or an
`onload` attribute in it runs on the IDE origin. Fix: `sanitizeSvg`
strips script/foreignObject/iframe/object/embed elements, `on*`
attributes and `javascript:`/`data:` hrefs (DOMParser in the browser, a
regex pass in Node); `parsePlotMarker` applies it. `plot-test` checks the
stripping; the smoke suite evaluates a malicious payload and asserts no
window flag was set.

### CI gap (small)
`ci.yml` lists steps explicitly and stops at `sw-test`; mop-probe,
ecl-mop-probe, chemicl-verify, ansi-test, completion-test and i18n-test
run only locally. Add them (and the new migration test); make the MOP
probe fail when it collects no results.

## Acceptance
- `storage-migration-test`, `completion-test`, `plot-test`,
  `chemicl-verify` pass with the new checks; `pnpm test` chains them.
- Smoke: a `<svg onload>` payload renders without executing.
- `ci.yml` runs every Node suite `pnpm test` runs; CI green; merged.
