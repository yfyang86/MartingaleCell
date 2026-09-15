# ConsCell

**A notebook-style Common Lisp IDE that runs entirely in your browser.**
Real Common Lisp, compiled to WebAssembly — no server, no install, nothing
leaves your machine.

```lisp
(mapcar (lambda (n) (* n n)) '(1 2 3 4))   ; ⇒ (1 4 9 16)
```

中文版文档：[README.zh-CN.md](README.zh-CN.md)

## What you get

- **Two real Lisp engines**, switchable in Settings:
  - **SBCL** compiled to `wasm32-wasip1` — the default engine (public
    domain with MIT/BSD-style parts, and the base of our own WebAssembly
    work).
  - **ECL** (Embeddable Common Lisp, ANSI CL) compiled to WebAssembly —
    the automatic fallback when SBCL cannot boot (artifacts missing, or
    a host without isolation headers), and selectable any time. Same
    editor, cells and project tooling either way.
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
  backend, no account — and after the first load the IDE opens and
  boots offline (a service worker keeps the app and the engine
  artifacts of the version you loaded).

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

Settings → **Lisp implementation**: `auto` (SBCL first — the default;
ECL, then JSCL and a mock fallback if SBCL cannot boot), `sbcl` or `ecl`.
Switching takes effect on the next runtime restart (toolbar ↻).

|  | SBCL (default) | ECL (fallback) |
|---|---|---|
| standard | SBCL 2.4.8 via wasm32-wasip1 | ANSI CL via WECL/wasm |
| licence | public domain + MIT/BSD-style parts (upstream `COPYING`) | LGPL-2.1+ (shipped unmodified as the fallback) |
| boot time | ~4–6 s (19 MB of .gz artifacts, downloaded once) | ~1 s |
| projects, cells, packages, debugger, stdin | ✓ | ✓ |
| gnuplot plots (cl-plot) | ✓ captured to SVG | ✓ captured to SVG |
| interrupt (Ctrl+.) | restarts the image (the port cannot deliver Ctrl-C to Lisp yet) | restarts the image |
| hosting requirement | page must be crossOriginIsolated (COOP/COEP headers — vite dev/preview send them; see RELEASE.md) | none |
| quirks | no `(directory …)` enumeration; 30-bit fixnums | — |

If SBCL cannot boot (artifacts missing, or a host without the isolation
headers) the IDE says so in the boot log and falls back to ECL.

> **Browser note (alpha, tracked upstream):** in **Chrome**, a V8
> WebAssembly bug can intermittently misfire calls to functions defined
> by earlier cells (e.g. the *Fractal plots* example) — the image reports
> `UNDEFINED-FUNCTION` for a function that is defined, and later calls
> can wedge. **Firefox runs the same workload flawlessly**, and so does
> the Node harness. Switch to ECL (Settings) or Firefox on Chrome until
> the port/V8 issue is fixed.

## A one-minute tour

1. Open the IDE; the status bar shows `SBCL · WASM` (or `ECL · WASM`
   when SBCL cannot boot or you chose ECL).
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
explorer · `Ctrl+R` search everything evaluated this session · `Ctrl+Shift+F` search ·
`Ctrl+Shift+O` outline · `Ctrl+S` save.

## Limitations (beta)

- One Lisp image per tab; the image is single-threaded (no `sb-thread`).
- No networking from Lisp (no sockets in WASI/Emscripten); no
  subprocesses — `(ext:shell)`-style calls are intercepted or reported
  as a clean error.
- The JSCL fallback (CDN) is a CL subset, not full Common Lisp.
- Saved sessions persist cells, buffers, and modules — not the whole
  heap: definitions need a re-load after a reload (the Load Project
  button is one click).

## Licence notes

- **ConsCell's own code** — MIT; see [LICENSE](LICENSE). This covers
  the IDE, the workers and the WebAssembly port work in this repository.
- **SBCL** (the default engine) — mostly public domain, with some parts
  under MIT-style and BSD-style licences; the authoritative text is the
  `COPYING` file in the SBCL source tree. The `wasm32-wasip1` port used
  here is our own re-work of that source
  ([yfyang86/sbcl](https://github.com/yfyang86/sbcl)); the `.gz`
  artifacts under `app/public/sbcl/` are built from it.
- **ECL / WECL** — LGPL-2.1+ (Daniel Kochmański's WebAssembly build of
  Embeddable Common Lisp). ConsCell ships the WECL binary unmodified as
  the fallback engine, keeps its licence notice, and does not link
  against it: the IDE talks to it through a worker message protocol. The
  source is available from the ECL project; ConsCell does not depend on
  it as its core engine.
- **cl-plot** (bundled sample) — MIT, © Martin Kersner (its LICENSE
  file is inside the sample zip).

---

Status: **beta** (v1.0.0-beta.0) — see [CHANGELOG.md](CHANGELOG.md).
For hacking on ConsCell itself, see [Developer-Manual.md](Developer-Manual.md);
for cutting a release, [RELEASE.md](RELEASE.md).
