# Changelog

All notable changes to MartingaleCell. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project
uses [Semantic Versioning](https://semver.org/). Work lands in sprints
(`Sprints/SprintN/`), each with a goal, implementation notes, a
test-and-fix log and a proposal for the next one.

## [1.0.0] — 2026-11-01

The first full release. Highlights since 1.0.0-beta.2, in one line each:

- **Chemistry in the notebook** — the bundled chemicl sample parses and
  writes SMILES, computes formulas/masses/rings, and **draws molecules
  as SVG** with an RDKit-style 2-D layout engine written in plain Lisp
  (benzene's Kekulé hexagon through cephalostatin-1's 12 fused rings;
  geometry verified against RDKit's own depictions).
- **Renamed ConsCell → MartingaleCell**, with one-shot migration of
  existing users' settings and caches.
- **Bilingual UI** (English / 中文) across the whole app, docs included.
- **Smarter autocomplete**: context-aware, ranked, backed by the live
  image's symbol table.
- **The MOP at native-SBCL parity** (34/34 battery), synced with the
  wasm-port fixes; a live ANSI terminal screen in cells; per-cell
  interrupt that safely replaces the worker; 22 example notebooks.
- **Release-blocker hardening** (Sprint 35): storage-migration test
  suite for the IndexedDB keys, sanitised raw-SVG plot payloads,
  interrupt-safe SBCL job submission.
- **Binaries vendored**: the SBCL 2.4.8 wasm release zip ships in
  `releases/` (see its README); the app's gzip'd engine artifacts stay
  git-tracked under `app/public/sbcl/`.

Details below (all changes since 1.0.0-beta.2):

`dev` carries version `1.0.0` as of this release, so builds after it
install their own service-worker cache.

### Changed
- **Renamed ConsCell to MartingaleCell** across the UI, docs, package
  metadata, storage keys and the service-worker cache. Existing users'
  state is migrated on load: localStorage keys (engine preference,
  memory quota, language, search options, session history) at first
  import, and the IndexedDB keys (workspace, editor states, project
  definitions, virtual project, directory handle, installed modules)
  before the first render (Sprint 35); pre-rename `conscell-*` caches
  are deleted by the service worker on activate.

### Fixed (Sprint 35 — review blockers)
- **Upgrade data loss**: the IndexedDB keys renamed with the product were
  not migrated, so an upgraded profile opened with an empty workspace,
  no editor state, no project and no installed modules. Covered by
  `scripts/storage-migration-test.mjs`.
- **Autocomplete lost curated symbols** once the live image's symbol
  dump arrived: a symbol in both the dump and the curated list was
  dropped from both (`defun`, `format`, …). The curated list is now
  always offered in full.
- **Interrupt on SBCL could mark the fresh image crashed**: a cell
  submit waiting for a busy image's mailbox kept waiting on the old
  shared buffer after the worker was replaced, timed out 30 s later and
  reported a crash on the healthy new image (every later evaluation a
  RUNTIME-FAULT until Restart). Stale submits are dropped; the `sbcl`
  smoke scenario interrupts with two queued cells and evaluates 31 s
  later.
- **chemicl: acyclic molecules drew as "(empty molecule)"** (ethanol,
  hexane, open-chain amino acids): the layout seeded only the first
  ring. The first heavy atom is seeded when there is no ring, and
  disconnected components (`.` in the SMILES: salts, hydrates) are
  seeded to the right of what is drawn.
- **chemicl: layout cost** — the flip pass recomputed every subtree
  and two full overlap scores per candidate (a 36-atom chain took 4 s on
  SBCL and over two minutes on ECL). Subtrees are computed once per
  pass, a candidate is judged on the partial score of the atoms it
  moves, and the pass is skipped above 60 heavy atoms: 36 atoms in
  about 0.1 s, 66 in under 0.1 s. The principal-axis orientation uses
  two-argument `atan` (cyclobutane no longer produces NaN coordinates).
- **Raw-SVG plot payloads are sanitised**: a `;;PLOT64` payload that is
  an SVG (chemicl's `show-smiles`) went into the page unchanged, so any
  Lisp code could run script on the IDE origin. Script, foreignObject,
  iframe/object/embed, `on*` handlers, `javascript:`/`data:` URLs and
  `url()` styles are stripped (DOMParser in the browser, a text pass in
  Node); `plot-test` and the `svgsafe` smoke scenario cover it.
- **CI ran only 18 of the 25 Node suites**: the MOP probes, chemicl,
  ANSI, completion and i18n suites (and the new migration test) are
  now workflow steps; the MOP probe fails when it collects no results.
  `chemicl-verify` resolves its entry from the repo root, writes its
  bundle to a per-process temp file, and asserts acyclic, disconnected
  and timing probes.

### Added
- **chemicl: show-smiles — molecules drawn as SVG in the cell**.
  `(chemicl:show-smiles "Cn1…")` parses a SMILES string and depicts the
  molecule: template-based 2-D coordinate generation (engine-side,
  plain Lisp, RDKit-style): rings are placed as regular polygons (fused
  rings share their edge; linked rings like nicotine grow as whole
  polygons off their attachment bond), chains use standardized bond
  geometry — 120-degree zig-zag continuations with alternating turns,
  even angular spread at branch points (109 degrees at tetrahedral
  centers like S(=O)2), radial directions for ring substituents — with
  clearance-picked mirrored candidates; a flip pass reflects chain
  subtrees across their attachment lines and a polish pass rotates
  terminal atoms when it buys space (overlap scored on atom-atom and
  atom-bond distances). Aromatic rings draw alternating inner accents
  (a matching, so fused systems never show adjacent double bonds) and
  bonds are trimmed at heteroatom labels. Spiro rings (one shared atom)
  and linked rings (no shared edge) place as whole polygons with
  clearance-picked orientation, so steroid-scale molecules like
  cephalostatin-1 (C54H74N2O10, 12 rings, 66 heavy atoms) depict —
  min non-bonded distance better than RDKit's own depiction of the same
  molecule; dense systems (4+ rings) get a short final relaxation, and
  label circles/fonts/trims scale with the render fit so big molecules
  never overlap labels, and the finished layout is rotated to its
  principal axis so long molecules read horizontally (cephalostatin-1
  spreads left-to-right like its reference depiction). Bracket-atom
  formal charges parse correctly ([n+] is +1, not 0 — the ++/-- counter
  was off by one) and display in the label (N+, O-). Thiamine (vitamin
  B1) draws its thiazolium N+ correctly. Ring detection now repairs
  fused-system envelope cycles by chord splitting — saccharin
  previously mis-detected a 9-ring around its 5+6 core and drew one
  bond 3x too long; rings attached only through a bridge (thiamine's
  pyrimidine) are placed whole when the BFS first reaches them instead
  of collapsing into a broken zig-zag. Benzene renders as a clean
  Kekulé hexagon; melatonin as a proper fused indole. Carbons
  as bare vertices, heteroatoms labeled with implicit H folded in,
  double/triple/aromatic bond line forms. The SVG travels through the
  existing ;;PLOT64 capture channel as a raw-SVG payload — the app
  renders it with the usual plot chrome (Download SVG/PNG included,
  markdown transcripts embed it), gnuplot captures unchanged. Both
  example notebooks draw (the Molecules example depicts caffeine,
  aspirin and saccharin; the SMILES gallery draws its whole shelf);
  `test:plot` covers the raw-SVG marker routing and `test:chemicl`
  asserts the marker end-to-end on both wasm images.
- **chemicl manual & examples**: a *Chemistry (chemicl)* section in the
  in-app docs (four cards — SMILES, round-trip writing, element/isotope
  data, the graph model — four evaluated code blocks with outputs
  captured from the real image, and an honest limits callout; fully
  translated), a second example notebook "SMILES gallery" (a shelf of
  known molecules with formulas, masses and ring counts, verified on
  the image), and README quick-start steps for both samples (en + zh).
- **chemicl: SMILES support** — `parse-smiles-string` and
  `write-smiles-string` are now in the port, as a fresh self-contained
  recursive-descent implementation (the upstream parser needs
  parser-combinators + fset, still not vendored). Organic + bracket
  atoms, all bond types (stereo direction accepted and dropped),
  branches, reusable ring closures, fragments, implicit-hydrogen
  completion; the writer is non-canonical but round-trips exactly.
  Cross-checked against RDKit over an 18-SMILES battery (17 formula
  + mass matches; [13CH4] differs only in average-vs-isotope mass
  semantics) with 18/18 write→parse round-trips. Also fixed in the
  port: ring closures now close once (upstream-style hash removal),
  and count-elements sees all fragments. Example notebook and
  `test:chemicl` extended; verified on both wasm images.
- **chemicl — chemical structures sample project** (port of Cyrus
  Harmon's chemicl, BSD): molecules as atom/bond graphs, periodic-table
  element and isotope data, molecular formulas, molar and exact masses,
  ring perception, canonicalization. Bundled like cl-plot (Explorer →
  *Open sample project: chemicl*); element/isotope data converted from
  the upstream XML to a sexp file (no cxml dependency), epigraph vendored
  with a two-function alexandria shim, one modern-CL fix in epigraph's
  sequence helpers; SMILES parsing (needs parser-combinators + fset) is
  not ported — details in the zip's PORT-NOTES.md. New "Molecules
  (chemicl)" example notebook and `test:chemicl` CI check; verified
  end-to-end on both the SBCL and ECL wasm images (caffeine
  C8H10N4O2 / 194.1906 on both).
- **Per-cell interrupt**: while a cell runs, its status row now carries an
  Interrupt button (not just the global Ctrl . / toolbar flow). One click
  resolves that evaluation as aborted and safely replaces the WASM worker
  behind it — nothing inside the image keeps running; the respawn boots in
  the background and the next evaluation works on the fresh image. Browser-
  verified: an endless `(loop)` cell aborted on click and `(+ 40 2)`
  evaluated to 42 on the respawned image.
- **MOP: SBCL team's fixes synced, our side landed** — the new wasm build
  fixes programmatic `ensure-class` `:direct-slots` and adds
  `sb-mop:slot-exists-p-using-class`; the 34-check battery now passes
  34/34 with the gap tolerance removed. Feature-matrix MOP row is *full*;
  autocomplete offers `SB-MOP` externals; a "Metaobject Protocol" example
  notebook; an ECL parity probe (16 checks; WECL's slot-value-using-class
  customization and funcallable instances recorded as engine gaps).
- **MOP coverage probe** (`pnpm run test:mop`): a 34-check AMOP battery
  (class protocol, slot metaobjects, the slot-*-using-class family,
  ensure-generic-function variants, method combinations, funcallable
  instances) run against the real SBCL wasm image through the worker
  protocol. Result: the port is at native-SBCL parity — 33/34 pass on
  both, the single failure (programmatic `ensure-class` `:direct-slots`)
  is an upstream SBCL gap, tolerated explicitly and enforced once fixed.
  Findings and both-teams plan in `MOP-Coverage.md`.
- **Bilingual UI (English / 中文)**: an EN · 中文 toggle in the navbar
  (and the language follows the browser default, remembered across
  visits). English strings are the dictionary keys, so a missing
  translation degrades to English; the IDE chrome, home page, examples
  gallery, settings, debugger, modals and the full in-app Docs pages
  (all eleven sections, feature matrix and FAQ included) are
  translated. The hero
  headline remounts on language change so the GSAP SplitText animation
  re-runs on the translated text.
- **Smarter autocomplete**: context-aware (only callables after `(`;
  everything in argument position; functions after `#'`; package
  symbols after a `foo:` prefix; buffer keywords after `:`), ranked
  (exact prefix > word-start > substring > subsequence, with boosts for
  locals, buffer and project symbols) instead of alphabetical, and
  backed by the live image — the full external-symbol alphabet of
  COMMON-LISP (~800 symbols with real kinds and, from the curated set,
  arglists/doc popovers) is dumped from the running engine at ready.
  `let`/`lambda`-list locals of the enclosing form are offered.
- **ANSI screen in cells** for escape-code-driven output (cursor
  addressing, clear, SGR colors): a live terminal grid rendered while
  the cell runs (`pnpm test:ansi`). The SBCL worker flushes
  escape-carrying partial lines so such programs animate; ECL flushes
  per newline only, so its screen stays blank (engine-side limitation).
- **Example: Matrix effect on the ANSI screen** — the classic falling
  characters, bounded to 20 frames by default
  (`(run-matrix-effect 60 20 0.05 0)` runs until Ctrl .).

## [1.0.0-beta.2] — 2026-09-16

A fix release for the SBCL engine: evaluating a whole buffer could
starve or reorder jobs, which looked like functions vanishing between
cells.

### Fixed
- **Whole-buffer evaluation on SBCL** (any browser): two job-channel
  races. (1) `poll_oneoff` parked without draining the mailbox, so a
  request arriving while the REPL polled starved — its wakeup had
  already been consumed and fd0-readiness only measured the form ring.
  (2) Submits to the worker's single-slot mailbox were fire-and-forget:
  the flag handshake prevents overwriting but not overtaking, so with
  every cell of a buffer submitted up front, a call cell could pass the
  defun cell above it and run first — `UNDEFINED-FUNCTION` for a
  function defined one cell earlier, after which the pause-on-error
  debugger (on by default) blocked the rest of the session. Poll now
  drains a pending request before parking; submits are serialized
  through a promise chain.
- **The form splitter on unbalanced source**: one stray `)` drove the
  top-level splitter depth-negative and shredded every following form
  into garbage atom/fragment cells. It now stops at the stray closer
  and hands the engine the rest as one form — one clean reader error.

### Changed
- SBCL engine artifacts re-synced from the port's master-sync build
  (`sbcl.core.gz` 12.4 MB, `sbcl-core.wasm.gz` 5.2 MB; the runtime was
  unchanged) — runtime, core and core module from one build.

### Docs
- End-user README, Developer Manual and their Chinese editions; an
  interim note wrongly blaming a browser/V8 bug is corrected.

## [1.0.0-beta.0] — 2026-09-15

The first tagged release. `1.0.0-alpha.0` was the working version of
the sprints below and was never tagged.

### Engines
- **SBCL 2.4.8 compiled to `wasm32-wasip1`** as the default engine: a
  from-scratch browser host (`public/sbcl-worker.js`) with a WASI
  preview-1 shim, a SharedArrayBuffer job mailbox, timers, the
  debugger pause, standard input, runaway-recursion recovery and module
  persistence. Artifacts ship as three gzip-compressed files (~19 MB,
  ~125 MB inflated in the worker), fetched with progress and inflated
  with `DecompressionStream`. (Sprints 23–26)
- **ECL via WECL** as the fallback engine (and selectable any time),
  with the setjmp-trampoline patch that made the interpreter ~30×
  faster. (Sprints 7, 23)
- **Settings → Lisp implementation**: `auto | ecl | sbcl`, download
  progress in the boot screen and the status bar, `crossOriginIsolated`
  preflight so non-isolated hosts skip straight to ECL. (Sprints 27–28)
- One version string (`__APP_VERSION__` from `package.json`) on the
  boot screen, in About and in the service-worker cache name. (Sprint 28)

### Session and debugger
- `in-package` persists across cells and drives the package pill;
  honest condition reporting with type, message and slots. (Sprints 1–2)
- A real interactive debugger: an unhandled error pauses the image
  inside the handler with the live restarts (USE-VALUE, CONTINUE,
  RETRY, ABORT, STORE-VALUE, DEFINE-FUNCTION and the user's own),
  frames and condition details, also during project loads with
  SKIP-FORM. (Sprints 3–5)
- Standard input: `read-line`, `read`, `y-or-n-p` pause the cell for a
  line. (Sprint 4)
- Per-line values, multi-line values kept whole, long values capped in
  transcripts. (Sprints 12–13, 15)
- Re-run history per cell: run chips, a side-by-side history view with
  value and input diffs, lineage kept across export and import.
  (Sprints 21–22, 24)
- Session-box input history persisted across reloads, Ctrl+R search
  over the box's history and every cell input evaluated in the session
  (`In [n]` chips). (Sprints 20–21, 31)
- Session export as Markdown or `.lisp` transcript, import back as
  cells (appending or replacing), a cell opened as a buffer stays
  linked to it. (Sprints 8, 10, 16–17, 26)

### Editor
- CodeMirror with Lisp syntax, rainbow parens, completion from the
  image and the project. Per-buffer undo history, selection, scroll
  position and folds, all persisted across reloads. (Sprints 14–18, 20)
- Workspace search with jump-to-hit, replace across the workspace
  applied through the editor (undoable) with a save-all summary, find
  references (Shift+F12). (Sprints 9–10, 13–14)
- Go-to-definition (F12) over project files, evaluated forms and the
  session box; an outline panel (Ctrl+Shift+O) of buffers and unloaded
  project files; a persisted definition index that follows the buffer
  a form was evaluated from. (Sprints 6, 9–12)

### Projects and plots
- Projects from a local folder, a ZIP or a set of files; ASDF systems
  loaded in `:components` order, form by form; load warnings with
  locations; the bundled cl-plot sample. (Sprints 5–6)
- In-runtime package manager (`package-install` and friends) with
  modules persisted in IndexedDB.
- gnuplot capture on `ext:shell` rendered as SVG in the cell, on both
  engines: every data file of a multi-series `plot` line ships,
  function expressions (`sin(x)`, `x**2`, …) are drawn from a built-in
  evaluator, series without data are named as "not drawn" instead of
  dropped. (Sprints 28–31)

### Offline and hosting
- A service worker (`public/sw.js`, production builds) keeps the app
  shell and the engine artifacts of the loaded version: the IDE opens
  and boots offline after its first load; a new version installs a new
  worker and drops the old cache. (Sprint 31)
- COOP/COEP headers from the dev and preview servers; the SBCL engine
  needs them on the host too (see `RELEASE.md`).

### Docs and licences
- Docs site with Getting started, Engines, Feature matrix, Session,
  Editor, Debugger, Projects, Modules, Shortcuts, Persistence and FAQ
  sections, kept in line with the code. (Sprints 6, 19, 28, 30)
- `LICENSE` (MIT) and licence notes for SBCL (public domain with
  MIT/BSD-style parts), WECL (LGPL-2.1+, shipped unmodified) and
  cl-plot (MIT). (Sprint 29)

### Tests and CI
- 17 Node suites, no test framework: pure-TS rules (transcript, search,
  outline, editor state, session history, fold, lineage, plot parser
  and evaluator, smoke summary, artifact loader) and real-image
  harnesses (ECL boot with the cl-plot sample, package, settings,
  debugger, stdin, performance floor, SBCL). (Sprints 1–31)
- Browser smoke: 11 Playwright scenarios (debugger, stdin,
  definitions, transcript, persistence, replace, landing and docs,
  history, sbcl, engine, offline) with a JSON report and a summary on
  the job page; runs on labelled pull requests and on every push to
  `dev`. (Sprints 18–21, 24, 26)
- GitHub Actions: lint, build and every suite on pull requests and
  `dev` pushes; the labelled run carries both jobs. (Sprints 1, 20–22, 29)

## Sprint history

| Sprint | What landed |
|---|---|
| 1 | `in-package` persistence across cells; lint clean; first CI gate |
| 2 | Settings that do what they say; honest condition reporting; restart-protocol spike |
| 3 | Interactive debugger with live restarts |
| 4 | Standard input via the pause primitive; debugger polish |
| 5 | Debugger during project loads; nested errors; examples gallery |
| 6 | Definitions from the loader, go-to-definition; load warnings with locations; docs pass |
| 7 | Profiling; fast setjmp trampolines (~30× interpreter speed); definition index persistence |
| 8 | Speed examples; block comments in the offset probe; session export as transcript |
| 9 | Workspace search; definitions from evaluated forms; navbar without framer-motion |
| 10 | Find references; import a transcript back; definitions from the session box |
| 11 | Outline panel; persisted definition index |
| 12 | Per-line values; definition freshness; outline for unloaded project files |
| 13 | Replace in workspace; multi-line values |
| 14 | Editor state per buffer; save-all from the replace summary; apply order in CI |
| 15 | Stashed-state edits; per-buffer scroll; transcript value limit |
| 16 | Editor stash rules in Node; open a cell as a buffer; replacing import |
| 17 | Cell ↔ buffer link; scroll-restore guard; replace confirm with preview |
| 18 | Smoke build guard; persisted editor states; transcript buffer note |
| 19 | Smoke scenarios; editor docs section; serialisation cache |
| 20 | Smoke in CI behind a label; persisted session history; folds per buffer |
| 21 | Cell history view; smoke on `dev` pushes; session-box history search |
| 22 | Run history in the transcript; input diff between runs; merge-commit CI run kept |
| 23 | SBCL/wasm as a second engine (browser host worker, plumbing, artifacts) |
| 24 | gzip'd artifacts; SBCL smoke scenario; value diff; smoke JSON report |
| 25 | SBCL hardened against the real image in the browser; CI browser install |
| 26 | Only `.gz` artifacts in git; `.lisp` transcript import; smoke summary; fetch progress |
| 27 | Engine choice `auto | ecl | sbcl` with loading progress; ECL comes back reliably |
| 28 | One default-engine story; cl-plot in CI on both engines; isolation preflight; version in one place |
| 29 | Every series' data file shipped; licence notes and LICENSE; boot-cache spike |
| 30 | Engines section in the docs; series without data named in plots |
| 31 | Function series drawn; Ctrl+R over cell inputs; service worker for offline use |
| 32 | Code cut: version `1.0.0-beta.0`, this changelog, documents pass, release checklist |

[Unreleased]: https://github.com/yfyang86/MartingaleCell/compare/v1.0.0-beta.0...dev
[1.0.0-beta.0]: https://github.com/yfyang86/MartingaleCell/releases/tag/v1.0.0-beta.0
