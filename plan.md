# Plan: WASM Common Lisp IDE (Browser)

## Goal
A browser-based Common Lisp IDE running a CL runtime via WebAssembly, with a traditional IDE layout:
- **Left**: syntax-highlighting editor (Monaco/CodeMirror, Lisp mode)
- **Right upper**: Jupyter/IPython-style result cells — highlighted output, warnings, scrollable, copy/paste
- **Right lower**: log / debug console (stdout, stderr, compile notes, stack traces)

## Stage 0 — Runtime research (no skill; research subagent)
- Verify a usable WASM Common Lisp runtime: ECL-compiled-to-WASM builds, SBCL/WASM ports, `ecl-wasm` packages/CDN URLs.
- Check concrete CDN/npm availability + JS API shape (eval-in, stdout capture).
- Fallback ladder if no WASM build is fetchable: JSCL (CL-to-JS compiler, real CL subset) → in-repo mini CL interpreter, clearly labeled in UI.
- Output: runtime integration brief (URLs, API, licensing notes).

## Stage 1 — Load `vibecoding-webapp-swarm` skill + workspace setup
- Read SKILL.md at stage start only. Follow its design-first workflow.
- Use `swarm-workspace` setup for shared repo + worktrees if skill requires.

## Stage 2 — Design (design subagent per skill)
- Traditional IDE layout, dark theme, Monaco-style editor left; right split: cells (top) / log-debug (bottom), draggable splitters, toolbar (Run, Run All, Clear, Share/load examples), CL examples library.
- Output: design spec (components, palette, interactions).

## Stage 3 — Implementation (subagents per skill, staged)
1. Core app shell + layout + editor (Lisp highlighting, paren matching).
2. Runtime integration per Stage-0 brief (WASM loader with async init + status indicator; fallback interpreter so IDE always works).
3. Notebook-style result cells: input echo, value render, warnings/errors with highlight, auto-scroll, per-cell copy/paste, re-run.
4. Log/debug console: levels (info/warn/error/debug), filter, clear, copy; wire stdout/stderr of runtime.
5. Examples + polish.

## Stage 4 — Verify & deliver
- Build production bundle, test in browser (load, eval `(+ 1 2)`, `(format t ...)`, error case).
- Save website version via website_version_manager. Deliver. ✅ (v1 = 061a3b1)

## Iteration 2 — Project mode (branch `feature-project`)
User requirements: (1) project = local folder, (2) open/save files, (3) load project scripts recursively into the runtime, then call them. Sample: cl-plot (MIT, ASDF `:serial t`, no ext deps).
- Single coder subagent: file explorer sidebar (File System Access API + zip/webkitdirectory fallback + IndexedDB handle persistence), open/save buffers (Ctrl+S), export zip, bundled sample project (public/sample-projects/cl-plot.zip), worker-side recursive loader (write files to Emscripten FS → ASDF `load-source-op` → fallback ordered `load`), post-load package/symbol enrichment for autocomplete, cells/log progress, docs+landing copy touch-ups.
- Verify: build + browser smoke test (sample project load, call a function). Fix loop if needed.
- Deliver: merge to master → build_version (static) → STOP.
