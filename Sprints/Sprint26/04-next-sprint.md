# Sprint 27 — Proposed plan

## Candidates

### BB. Session-box search across cells (small)
Extend Ctrl+R's list to cell inputs evaluated from buffers, with their
cell numbers. Carried since Sprint 22.

### BK. History rewrite for the plain artifacts (small, destructive)
`dev` still carries the 124 MB of plain artifacts in `38dcbdd`. A
`git filter-repo` pass (or a fresh `dev` from a squashed state) would
shrink clones to the `.gz` copies; needs a decision and a coordinated
force-push.

### BL. SBCL in the docs site (small)
The docs mention the second engine in one sentence; a card on how to
switch, what differs (no plots, interrupt by respawn, boot time) and
the artifact story.

### BM. SBCL boot cache (small-medium)
The `.gz` fetch is ~19 MB on every boot; caching the inflated artifacts
in the Cache API or IndexedDB would make the second boot a few seconds.

### BI. Port-side Ctrl-C delivery (upstream)
Unchanged.

## Suggested Sprint 27 scope
BL + BM, with BB if time allows. BK when decided.
