# ConsCell

**A notebook-style Common Lisp IDE that runs entirely in your browser.**
Real Common Lisp, compiled to WebAssembly — no server, no install, nothing
leaves your machine.

```lisp
(mapcar (lambda (n) (* n n)) '(1 2 3 4))   ; ⇒ (1 4 9 16)
```

## What you get

- **Two real Lisp engines**, switchable in Settings:
  - **ECL** (Embeddable Common Lisp, ANSI CL) compiled to WebAssembly —
    the default, boots in a second.
  - **SBCL** compiled to `wasm32-wasip1` — a second choice with the same
    editor, cells and project tooling (see *Differences* below).
- **A notebook session**: evaluate a form or a whole buffer (`Ctrl+Enter`),
  get one result cell per run with values, printed output, warnings,
  errors with condition details, timing, and gnuplot plots rendered as
  SVG in the page.
- **A real editor**: CodeMirror with Lisp syntax highlighting, paren
  matching, per-buffer undo, dirty tracking, autosave, buffer tabs,
  outline of definitions (`Ctrl+Shift+O`) and workspace search
  (`Ctrl+Shift+F`).
- **Projects**: open a local folder (or import a ZIP / a folder of files),
  edit and save, then **Load Project into Runtime** — ASDF systems are
  loaded in `:components` order, every file top-level-form by top-level
  form, so one bad form never kills the load. Try the bundled sample:
  *Open sample project: cl-plot*.
- **Interactive debugging**: on error, the image can pause and offer the
  live restarts (retry, store-value, define-function, abort — and
  skip-form during project loads). Standard input works too: `(read-line)`
  pauses the cell and asks you for a line.
- **A package manager for the runtime**: install / list / load / uninstall
  projects as modules inside the image (`(package-install "name")`); they
  persist across reloads via IndexedDB.
- **Everything local**: projects, editor state and modules are stored in
  your browser. Evaluation happens in a Web Worker. No telemetry, no
  backend, no account.

## Run it

The fastest way is a hosted deployment. To run locally from a checkout:

```sh
cd app
pnpm install
pnpm dev            # http://localhost:3000
```

Requirements: Node 22+ and pnpm 10. The ECL wasm image ships with the
repo. The **SBCL** engine additionally needs its artifacts (~19 MB,
git-tracked `.gz` copies) — with a full checkout they are already in
`app/public/sbcl/`.

## Choosing an engine

Settings → **Lisp implementation**: `auto` (ECL first, JSCL and a mock
fallback if the wasm fails) or `sbcl`. Switching takes effect on the next
runtime restart (toolbar ↻).

|  | ECL (default) | SBCL |
|---|---|---|
| standard | ANSI CL via WECL/wasm | SBCL 2.4.8 via wasm32-wasip1 |
| boot time | ~1 s | ~4–5 s (19 MB of .gz artifacts) |
| projects, cells, packages, debugger, stdin | ✓ | ✓ |
| gnuplot plots (cl-plot) | ✓ captured to SVG | ✓ captured to SVG (Sprint 28) |
| interrupt (Ctrl+.) | restarts the image | restarts the image (the port cannot deliver Ctrl-C to Lisp yet) |
| hosting requirement | none | page must be crossOriginIsolated (COOP/COEP headers — vite dev/preview send them) |
| quirks | — | no `(directory …)` enumeration; 30-bit fixnums |

If SBCL cannot boot (artifacts missing, or a host without the isolation
headers) the IDE says so in the boot log and falls back to ECL.

## A one-minute tour

1. Open the IDE; the status bar shows `ECL · WASM`.
2. Type `(defun hello () (format t "hi ~a" :world))` and press
   `Ctrl+Enter`.
3. New line, `(hello)` — the cell shows the printed output and the value.
4. `Ctrl+K` → *Open sample project: cl-plot* → *Load Project into Runtime*:
   seven files load in system order, and the example's gnuplot figure is
   captured and rendered as an SVG plot right in the session.
5. `(/ 1 0)` — a proper condition cell: type, message, operands.
   With *pause on error* on, you get the live restarts instead.

Useful shortcuts: `Ctrl+Enter` evaluate · `Ctrl+Shift+Enter` evaluate
buffer · `Ctrl+.` interrupt · `Ctrl+K` command palette · `Ctrl+B` project
explorer · `Ctrl+R` input history · `Ctrl+Shift+F` search ·
`Ctrl+Shift+O` outline · `Ctrl+S` save.

## Limitations (alpha)

- One Lisp image per tab; the image is single-threaded (no `sb-thread`).
- No networking from Lisp (no sockets in WASI/Emscripten); no
  subprocesses — `(ext:shell)`-style calls are intercepted or reported
  as a clean error.
- The JSCL fallback (CDN) is a CL subset, not full Common Lisp.
- Saved sessions persist cells, buffers, and modules — not the whole
  heap: definitions need a re-load after a reload (the Load Project
  button is one click).

## Licence notes

WECL / ECL are LGPL-2.1+. The SBCL engine is built from SBCL (public
domain / MIT-style, see the upstream project). The bundled sample project
cl-plot is MIT (© Martin Kersner). ConsCell's own code is not yet under a
decided licence (pre-release).

---

Status: **alpha** (v1.0.0-alpha). For hacking on ConsCell itself, see
[Developer-Manual.md](Developer-Manual.md).
