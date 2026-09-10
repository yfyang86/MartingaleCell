# Sprint 27 — Implementation notes

## BN. Engine choice

- `src/lisp/engine-pref.ts` holds `EnginePref = 'auto' | 'ecl' | 'sbcl'`
  and the `localStorage` mirror (`getEnginePref` / `setEnginePref`);
  `runtime.ts` re-exports them.
- `IdeSettings.engine` (default `auto`) is the source of truth:
  `setSettings({ engine })` writes the mirror; `hydrate` mirrors the
  persisted value, and adopts the `localStorage`-only value when the
  persisted settings predate this sprint (so an existing `sbcl` choice
  survives the upgrade, and the smoke's init-script preference works);
  `resetWorkspace` puts both back to `auto`.
- `runtime.init()` logs the preference as its first boot line and
  branches on it: `auto` — ECL, then JSCL, then the mock (unchanged);
  `sbcl` — SBCL, ECL on failure (unchanged); `ecl` — ECL only: a failure
  sets the `error` status, clears `bootPromise` so Retry can try again,
  and never falls through to JSCL or the mock.
- Settings drawer: the control is driven by `settings.engine` (it
  re-renders), offers the three choices, explains them in a line under
  the control, and the toast carries a "Restart now" action that opens
  the restart confirm.

## BO. Loading progress

- `WorkerOutMessage` gains `{ type: 'progress', file, loaded, total }`.
- Both workers share a `progressResponse(r, file)`: it wraps a fetch
  Response in a new one whose body is a `ReadableStream` that counts
  bytes as they pass (a message at most every 80 ms and one at the end
  with `total = loaded` when the server sent no length); without web
  streams (harness sandboxes) the original response is returned.
  - `wecl-worker.js` wraps `self.fetch` for `.wasm` URLs before the
    Emscripten glue loads, so the glue's own `instantiateStreaming`
    consumes the counted Response (content type preserved).
  - `sbcl-worker.js` wraps both artifact fetches (`.gz` first, then
    plain), reporting the compressed size for `.gz`.
- `runtime.subscribeProgress`; `Ide.tsx` writes `bootProgress` into the
  store and clears it whenever the status leaves `booting`.
- `BootScreen` shows `file · loaded / total MB` and drives its bar from
  the download when one is streaming (the line count otherwise);
  `StatusBar` shows `booting · file loaded / total MB` during a restart,
  where the boot screen is not shown.

## Tests

- `scripts/sbcl-artifact-test.mjs` +2 (11): a streamed `.gz` response
  still inflates to the original bytes and yields progress messages
  naming the file with the last one at `loaded === total`.
- Browser smoke: `sbcl` +1 (the boot screen shows the artifact
  progress); new `engine` scenario (5 checks): ECL progress on the boot
  screen; `sbcl` + Restart boots SBCL with the download in the status
  bar; `ecl` + Restart brings ECL back after the SBCL session
  (`(lisp-implementation-type)` → `"ECL"`); the choice survives a
  reload; Reset workspace returns it to `auto`. 63 checks in 10
  scenarios.

## Docs and README

README: the three choices, their meaning, where the choice lives and
that the boot screen shows progress.
