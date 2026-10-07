# Sprint 35 — Test and fix

## Local runs (branch `sprint35`)

| Check | Result |
|---|---|
| `pnpm lint` | clean (after one fix: the URL-scheme test used a control-character regex, which the config rejects; a `charCodeAt` filter does the same) |
| `tsc -b` + `vite build` | clean |
| Fast suites (transcript 47, search 26, outline 9, editor 21, history 29, fold 23, lineage 28, package 10, settings 13, debugger 55, stdin 17, sbcl-artifacts 11, ansi, completion, i18n 1209, smoke-summary 6, plot 63, sw 19, storage-migration 14) | all pass |
| `boot-harness`, `perf` (7), `sbcl-test`, `mop-probe` (34/34), `ecl-mop-probe` (16/16) | pass |
| `chemicl-verify` | 23/23 (caffeine, SMILES, show-smiles marker, nine layout probes with time bounds) |
| Browser smoke (12 scenarios) | PASS: 77 checks, no uncaught page errors |

## Fixes during the sprint

- **Flip pass was not the only hotspot — it was the whole hotspot.** The
  first rewrite (descendants cached, score once per pass) brought the
  36-atom chain from 4 s to 0.12 s on SBCL but left a branched 43-atom
  alkane at 5.9–8.3 s. A phase profile on the real engine (parse 5 ms,
  cycles 0, layout 7889 ms, layout without flips 5 ms) showed the user
  code runs interpreted on the wasm ports, so every overlap-score form
  counts. Second rewrite: the partial score counts only cross-side terms
  (exact for a rigid reflection), skips pairs farther than 1.5 bond
  lengths on either axis before any distance is computed, skips
  candidates whose partial score is zero, and caps passes at four.
  Result: branched 43 atoms 93 ms (SBCL) / 1.4 s (ECL); 36-atom chain
  11 ms (SBCL) / 100 ms (ECL, was 131 s); 66-atom chain 22 ms / 210 ms.
- The second rewrite first dropped a closing paren in `%overlap-score`;
  the file loaded only up to that form and `show-smiles` came back
  undefined (0/9 checks). A balance check over the file found it.
- `chemicl-verify` timed the branched probe at 8.3 s while the build
  ran beside it — the bounds (5 s / 10 s / 5 s) now sit two orders of
  magnitude above the measured times, so parallel CI load cannot flip
  them.
- Self-closing tags came out of the text sanitiser as `<line … />`
  (a space before the slash), failing the "clean SVG unchanged" check;
  the attribute rewriter now re-emits the closing slash as found.

## Negative test for the interrupt fix

The `sbcl` scenario was run once against the unfixed `runtime.ts` (the
`dev` version, everything else from this branch): both new checks fail
— the respawned image never answers `(+ 40 2)` (its send is chained
behind the stale submit) and after 31 s the page shows `RUNTIME-FAULT`
(`stillUp=false faulted=true`). With the fix both pass. The scenario is
a real regression test for the blocker.

## CI

- PR #35 (`sprint35` → `dev`, label `smoke`): run 169
  (https://github.com/yfyang86/ConsCell/actions/runs/37560950839),
  both jobs green — `lint · build · wasm tests` with the seven new steps
  (MOP SBCL 7 s, MOP ECL 1 s, chemicl 31 s, ANSI, completion, i18n,
  migration) and `browser smoke` (12 scenarios in 2 min 3 s). The run
  opened by the `pull_request` event was cancelled by the labelled one,
  as since Sprint 29.
- Merged as `0e23269` (merge commit) into `dev`.

- Merge-commit run on `dev` (`0e23269`): run 170
  (https://github.com/yfyang86/ConsCell/actions/runs/37561475754) —
  in progress when this log was committed; its result is recorded in
  the follow-up commit below.
MERGE_RESULT
