# ConsCell 1.0.0-beta.2

A fix release for the SBCL engine: evaluating a whole buffer could
starve or reorder jobs, which looked like functions vanishing between
cells (the *Fractal plots* and *Fibonacci* examples failing with
`UNDEFINED-FUNCTION`, then the session hanging in the debugger).

## What was fixed

- **Whole-buffer evaluation on SBCL** (any browser) — two job-channel
  races:
  - `poll_oneoff` parked without draining the mailbox: a request
    arriving while the REPL polled starved (its wakeup had already been
    consumed, and fd0-readiness only measured the form ring). The poll
    loop now drains a pending request before parking again.
  - Submits to the worker's single-slot mailbox were fire-and-forget:
    the flag handshake prevents overwriting but not *overtaking*, so
    with every cell of a buffer submitted up front, a call cell could
    pass the defun cell above it and run first. Submits are now
    serialized through a promise chain.
- **The form splitter on unbalanced source**: one stray `)` used to
  drive the top-level splitter depth-negative and shred every following
  form into garbage cells; it now stops at the stray closer and hands
  the engine the rest as one form (one clean reader error).
- The SBCL engine artifacts are re-synced from the port's master-sync
  build (`sbcl.core.gz` and `sbcl-core.wasm.gz` changed; the runtime
  was unchanged) — runtime, core and core module from one build.
- An interim note in the docs wrongly blaming a browser/V8 bug is
  corrected: both races were ConsCell's own.

## Engine artifacts shipped in this release

| File | Size | SHA-256 |
|---|---|---|
| `app/public/sbcl/sbcl.wasm.gz` | 526 777 B | `6e1c2f8f396f7d285f7032c3dfc23d0deb0ca3cb01185a91a2ed7c8aed8c4ad2` |
| `app/public/sbcl/sbcl.core.gz` | 12 455 319 B | `011777cc38a9c003a436872f7096ef5ba059719fa68114b46086beca3e5fb534` |
| `app/public/sbcl/sbcl-core.wasm.gz` | 4 128 584 B | `33fa42a53f2fa921f4cfb7f467700d6f4a036906306de457a1703b2763d81e12` |
| `app/public/wecl/wecl.wasm` | 9 471 642 B | `6e910806d34d01c0624774f498c024f7b8b63fbeac7332064d4b1be3c549c3c6` |

The SBCL artifacts come from the `wasm-dev` branch of
[yfyang86/sbcl](https://github.com/yfyang86/sbcl).

## Verification (this release, locally)

- `pnpm lint`, `pnpm build`, all 17 Node suites, the ECL boot harness
  with the cl-plot sample (`--exercise`): green.
- Browser smoke (Chromium, fresh build): **51 of 54 checks pass**. The
  three failing checks are the known local UI flakes
  (`definitions`, `persistence`, `replace` — 5–10 s waits on the search
  panel / a fold placeholder / a poll; every functional check inside
  those scenarios passes, and they fail identically on the pre-fix
  build, so they are unrelated to this release). The `sbcl` and
  `engine` scenarios pass, as do `debugger`, `stdin`, `transcript`,
  `offline`, `history` and `landing`.
- The regression itself: the *Fractal plots* example (15 top-level
  forms, plots) and the *Fibonacci* example (7 forms) run to completion
  in Chromium, Firefox and the Node harness — previously
  `UNDEFINED-FUNCTION` on a function defined one cell earlier, with
  the pause-on-error debugger blocking the session.

## Hosting

Unchanged — see
[RELEASE.md](https://github.com/yfyang86/ConsCell/blob/main/RELEASE.md#4-deploy)
(COOP/COEP headers on every response, `sw.js` at the site root and not
long-cached, `.gz` artifacts served as-is, every SPA route serving
`index.html`).
