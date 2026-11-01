# Sprint 35 — Implementation

Branch `sprint35` from `dev` `b2d1836`. Six review blockers and the CI
gap; each fix carries a test.

## Blocker 1 — IndexedDB rename migration
`app/src/lib/rename-migration.ts` is now a module with three exports:
`migrateLocalStorage(storage)` (the old loop, now returning the number
of keys copied), `migrateIndexedDb(idb)` (the six idb-keyval keys the
rename touched: `workspace-v1`, `editor-states-v1`, `definitions-v1`,
`virtual-project-v1`, `dir-handle`, `modules-v1` — each copied from
`conscell-*` when `martingalecell-*` is still undefined; never rejects)
and `migrateStorage()` which runs both. The localStorage part still runs
at first import (the engine preference is read at module evaluation);
`main.tsx` awaits `migrateStorage()` before `createRoot(...).render`,
because the workspace, editor-state, project and module stores hydrate
on mount. `idb` is injectable, so `scripts/storage-migration-test.mjs`
(14 checks) runs the IndexedDB part against a Map-backed fake: all six
keys copied, an existing new key wins, a fresh profile writes nothing,
a second run copies nothing, a throwing store is survived; plus the
localStorage part against a fake `Storage`.

## Blocker 2 — curated completions survive the live dump
`registerLiveSymbols` skipped dump entries that are also curated (the
curated entry has docs) and then added curated entries only when the
dump lacked them — a symbol in both lists ended up in neither. The
curated list is now pushed in full. `liveCompletionLabels()` is exported
for the test; `completion-test` registers a dump containing `defun` and
`format` and checks both are still offered, once, with `loop` (absent
from the dump) and `my-own-fn` (dump only).

## Blocker 3 — interrupt-safe SBCL submit
`sbclSubmit` captures the `SharedArrayBuffer` it starts with and throws
`StaleChannelError` whenever `this.sbclSab` is no longer that buffer —
before writing, and inside the drain-wait loop (the old worker is gone
and will never clear its flag). `send()`'s catch ignores that error
(the request belonged to the old image; its job was already resolved as
aborted by `interrupt()`), and still reports any other failure through
`onCrash`. `killWorker` resets `sbclSendQueue` so sends to the new image
do not chain behind the stale promise. The `sbcl` smoke scenario now
evaluates `(loop)`, queues two more cells, clicks Interrupt, evaluates
`(+ 40 2)` on the respawned image and, 31 s after the queued submit,
`(+ 1 2)` — checking for `RUNTIME-FAULT` and "sbcl submit failed" text.

## Blockers 4 and 5 — chemicl layout
`chemicl-svg.lisp` inside `public/sample-projects/chemicl.zip` (the only
copy; re-zipped flat with `zip -X -D`, `openSample` now fetches `?v=6`):
- `%layout` seeds the first heavy atom at the origin when no ring placed
  anything (`%seed-component`: a ring atom seeds its whole ring as a
  regular polygon there), then loops `%place-chains` until every atom
  is placed, seeding each still-unplaced component 2.5 bond lengths to
  the right of the drawn bounding box (`%next-component-origin`). The
  parent and ring-atom tables of the runs are merged for the flip pass.
  A seed the placer cannot grow from is dropped in place rather than
  looping.
- `%flip-pass`: descendant sets come from a children table built once
  (`%children-table`, `%descendants` takes it), the pass is skipped
  above `*mol-flip-max-atoms*` (60), candidates whose partial score is
  zero are not reflected, and at most four passes run. `%overlap-score`
  takes an optional `moved` table and then counts only terms that a
  rigid reflection of `moved` can change: pairs with exactly one atom
  moved, and atom/bond contacts whose three atoms are not all on one
  side — exact for the before/after comparison at O(k·(N−k)). Pairs
  farther than 1.5 bond lengths apart on either axis are skipped before
  any distance is computed (the engines run this interpreted).
  Measured on SBCL/wasm: branched 43-atom alkane 7.9 s → 93 ms, 36-atom
  chain 69 ms → 11 ms (layout with flips; 4 ms and 1 ms without).
- `%orient-horizontal` uses two-argument `atan` (no division by zero
  when the covariance axes are equal — cyclobutane).
- `molecule-svg` reports empty only when no atom is placed, and draws
  the placed atoms and the bonds between them.
`scripts/chemicl-verify.mjs` resolves its entry from the repo root,
bundles to a per-process temp file, and after the caffeine checks
evaluates nine layout probes (ethanol, hexane, lysine, a salt, a
hydrate, cyclobutane, 36- and 66-atom chains, a branched 43-atom
alkane) asserting bond lines are drawn, nothing is "(empty molecule)",
no NaN, and time bounds of 5 s / 10 s / 5 s.

## Blocker 6 — SVG sanitising
`app/src/plot/sanitize.ts`: `sanitizeSvgText` (regex pass: comments,
CDATA and processing instructions out; script, foreignObject, iframe,
object, embed, frame, meta, link, base, form elements out with their
subtrees; `on*` attributes out; `javascript:`/`data:`/`vbscript:`/
`file:`/`blob:` and any non-fragment scheme out of `href`, `xlink:href`,
`src`, `xml:base`, `to`/`from`/`values`/`by`; `style` with `url(`,
`expression(`, `javascript:` or `@import` out) and `sanitizeSvg` (the
text pass, then in the browser a DOMParser walk applying the same rules
and re-serialising; falls back to the text result when the markup does
not parse or DOMParser is absent). `parsePlotMarker` applies it to the
raw-SVG branch. `plot-test` gains nine checks (hostile payload stripped,
drawing kept, clean SVG unchanged, CDATA-hidden and mixed-case script);
the new `svgsafe` smoke scenario prints a hostile payload through
`format` and checks the rendered cell and `window.__pwned`.

## CI gap
`.github/workflows/ci.yml` gains steps for `mop-probe`, `ecl-mop-probe`,
`chemicl-verify`, `ansi-test`, `completion-test`, `i18n-test` and the new
`storage-migration-test`; `pnpm test` chains the last one too (25
suites). `mop-probe` fails when it collects fewer than its 34 results.
Docs: CHANGELOG (Changed + Fixed), Developer-Manual and RELEASE scenario
counts (12).
