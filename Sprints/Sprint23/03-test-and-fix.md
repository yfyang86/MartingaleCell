# Sprint 23 — Test and fix

Loop: `node scripts/sbcl-test.mjs` against the real image
(artifacts built from sbcl `wasm-dev` at ~/Git/sbcl, 2026-09-10; the
sbcl tree itself needed `version.lisp-expr` filled — the clone has no
tags, so `generate-version.sh` left it empty and pass-1 died on EOF).

Findings, in the order they surfaced:

1. **exnref**: V8 in Node still gates try_table/throw behind
   `--experimental-wasm-exnref` (it is NOT allowed via NODE_OPTIONS, and
   worker threads reject it in execArgv) — the harness re-execs itself
   with the flag; workers inherit the main process's V8 flags.
2. **`--dynamic-space-size` is a runtime option**: after `--noinform`
   SBCL refuses the mix ("C runtime option in the middle of Lisp
   options"). It now precedes the toplevel options.
3. **Std fds must be character devices** (see 02): filetype 0 sent SBCL
   into a poll_oneoff↔fd_filestat_get busy loop (8 M+ calls/min) because
   `unix-simple-poll` only short-circuits for S_IFREG/S_IFCHR. With char
   devices the block moves into fd_read, and stdout becomes
   line-buffered — markers flush per line.
4. **The whole fed form is read before it runs**: `(progn (defpackage
   :cc) (in-package :cc) …)` cannot work — `cc:`-qualified symbols later
   in the same form read before the package exists (reproduced under the
   reference host). The helper is now delivered as a read/eval loop over
   a string input stream.
5. **Reader EOF mid-helper**: a missing paren at the end of `eval-string`
   swallowed the rest of the helper source. Guard: the extracted
   `SBCL_HELPER_SRC` is read-checked with native SBCL (all 57 forms).
6. **A fed form parks after reading**: SBCL's reader consumed the form
   but its evaluation only started when further input arrived. Every fed
   form now carries a trailing blank line.
7. **The REPL prompt** shares a line with the first output ("* ;;CC-DONE")
   — `;;` markers now match on the line suffix, and the prompt is
   suppressed entirely (`sb-int:*repl-prompt-fun*` = no-op).
8. **Worker heap**: Node's default worker limit counts the wasm linear
   memory; the harness raises maxOldGenerationSizeMb.

Also fixed in the worker along the way: WASI event struct is 16 bytes
(errno u16@8, type u8@10) and the subscription fd is the u32 at +16;
write-back for files opened for output (module copies, registry.sexp)
buffers per fd and commits at close; fd0 and /dev/cc-stdin backlogs are
tagged per channel so a large form's remainder is never mistaken for
stdin data.

Final state:
- `pnpm lint`, `pnpm build` clean; the full `pnpm test` chain green
  (transcript/search/outline/editor/boot/package/settings/debugger/
  stdin/perf + the new sbcl harness).
- `node scripts/sbcl-test.mjs` PASS: ready in ~2 s after instantiation,
  eval/values/output, DIVISION-BY-ZERO with details, package persistence
  across jobs, project load with the full marker set, post-load
  acceptance, ;;READ-WAIT round trip, clean exit.
- Boot-time noise: one "SIGBUS handler not installed" line from the
  runtime (normal on this port) and per-function compile style-warnings
  during the helper load (~1 s) — visible in the boot log only.

Not yet exercised (honest gaps): the interactive debugger pause
(;;DEBUG:/;;RESTART:/;;DEBUG-WAIT path is ported but untested), the
interrupt (Ctrl-C) bit, timers (with-timeout), modules snapshot/restore
round trip, and the browser itself (Chrome ≥ 137 for exnref) — the
browser smoke still boots ECL. All are follow-ups.
