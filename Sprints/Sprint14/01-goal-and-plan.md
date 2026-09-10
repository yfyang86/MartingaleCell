# Sprint 14 — Goal and plan

Date: 2026-09-10 · Branch: `sprint14` → PR into `dev` · Follows `Sprints/Sprint13/04-next-sprint.md`

## Goal

Make the editor honest about buffers: switching buffers must not put a
"switch" into the undo history, and a replace that dirtied project files
should be one click from saved. Pin the replace apply order down in CI.

## Scope (from the Sprint 13 proposal: V + W, Y if time)

### V. Editor state per buffer (small-medium)
The editor swaps documents by dispatching a whole-document change, so
Ctrl+Z after switching buffers undoes the switch. Keep an `EditorState`
per buffer: on switch, stash the outgoing state, restore the incoming
one when its document still matches the store (else build a fresh state
from the store content with the same extensions), and drop states of
closed buffers. Undo/redo then stay inside a buffer. Browser smoke:
after the replace, switch buffers — Ctrl+Z in the other buffer changes
nothing; back in the first, redo restores the replacement.

### W. Save all from the replace summary (small)
When a replace dirtied project buffers (open ones, or files it opened),
the toast offers "Save N files" — `saveAllDirty` — instead of leaving
the user to find them.

### Y. Apply order in CI (small)
Move the apply loop out of the panel into `src/search/apply-replace.ts`
with injected effects (editor dispatch, store update, open file, find
buffer) and test it with fakes in `search-test.mjs`: active buffer
through the editor, other buffers through the store, unopened files
opened then updated, counts and order.

## Out of scope
Rebuilt WECL; per-buffer scroll/selection restore beyond what the saved
state carries.

## Acceptance
- Ctrl+Z never changes which buffer's text is shown.
- Lint, build, all harnesses and the browser smoke pass; CI green; merged.
