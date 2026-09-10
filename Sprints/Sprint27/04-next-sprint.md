# Sprint 28 — Proposed plan

## Candidates

### BM. SBCL boot cache (small-medium)
Cache the inflated artifacts (Cache API or IndexedDB) so a second boot
is a few seconds instead of a 19 MB fetch; the progress line would then
read "from cache".

### BL. SBCL in the docs site (small)
A card on switching engines, what differs (no plots, interrupt by
respawn, boot time, the artifact story), now that the setting is
explicit.

### BB. Session-box search across cells (small)
Carried since Sprint 22.

### BK. History rewrite for the plain artifacts (decision needed)
Unchanged.

### BI. Port-side Ctrl-C delivery (upstream)
Unchanged.

## Suggested Sprint 28 scope
BM + BL, with BB if time allows.
