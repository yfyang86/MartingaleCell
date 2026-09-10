/* ConsCell — WECL (ECL → WebAssembly) classic Web Worker.
 *
 * Hand-written, NOT bundled. Loads the self-hosted WECL runtime from /wecl/:
 *   1. importScripts('/wecl/boot.js')  — creates `var Module = {}` + wecl_init_hooks
 *   2. install Module.print / Module.printErr stdout capture + locateFile
 *      (wecl.wasm otherwise resolves relative to THIS worker script)
 *   3. stub `document` — the ECL image's boot looks for CL <script> tags in
 *      the DOM; a bare worker has no document and boot would crash without it
 *   4. importScripts('/wecl/wecl.js')  — emscripten glue, fetches wecl.wasm
 *   5. wecl_init_hooks callback installs a CL helper (cc:eval-string) that
 *      reads every top-level form from a source string, evaluates each with
 *      multiple-value-list, prints values as `;;=> v1 v2`, and routes
 *      warnings/errors through handler-bind/handler-case so evaluation never
 *      drops into the debugger (a debugger entry would hang the worker).
 *
 * Verified facts about this build (tested against the real image):
 *   - wecl_eval(src) reads/evals ONE form — the helper is delivered as a
 *     single bootstrap form that reads the definitions from a string.
 *   - cc:eval-string must be :export'ed or the reader errors at call time.
 *   - some conditions (e.g. DIVISION-BY-ZERO) print unreadably; %report falls
 *     back to "<TYPE> signalled".
 *   - Module.print is line-buffered: markers need a trailing ~% to flush.
 *   - a reader/eval error at the TOP LEVEL of wecl_eval drops into the ECL
 *     debugger, which waits for input forever — i.e. the worker hangs. The
 *     bootstrap therefore reads/evals every helper form inside handler-case,
 *     and the helper must only reference symbols that exist in this image
 *     (EXT:CD does NOT — reading it throws SIMPLE-READER-ERROR at bootstrap).
 *
 * Protocol
 *   in : {type:'eval', id, code, compile?, debug?}
 *        (compile: bytecodes-compile each form; debug: pause on error)
 *      | {type:'restart', id, index, value?}  answer for a paused job
 *        (index into the ;;RESTART: list, -1 declines; value = Lisp form)
 *      | {type:'input', id, text}   a line for a job waiting on stdin
 *        (;;READ-WAIT); text null = end of file
 *      | {type:'load-project', id, files:[{path, content}], debug?}
 *        (debug: a failing project form pauses with SKIP-FORM / RETRY /
 *         STORE-VALUE / DEFINE-FUNCTION / ABORT-LOAD restarts)
 *   out: {type:'boot', line} | {type:'ready'} | {type:'bootfail', message}
 *        {type:'stdout', id, text} | {type:'stderr', id, text}
 *        {type:'done', id} | {type:'joberror', id, message}
 *        {type:'load-progress', id, path, status, message}
 *        {type:'load-note', id, note}
 *        {type:'crash', message}
 *
 * Every eval job ends with a ;;PACKAGE: <name> stdout marker (the package
 * the NEXT job will read in — (in-package …) persists across cells).
 * An unhandled condition prints, on stderr, ;;ERRTYPE: <type-of>, then
 * ;;DETAIL: key|value per interesting condition slot, then ;;FRAME: <fn>
 * per named user frame (innermost first, captured at signal time), then
 * the existing ;;ERROR: <report>.
 * Project loads additionally stream structured markers on stdout (parsed
 * main-side, never shown as output): ;;FILE: path|status|message,
 * ;;PKG: name|external-count, ;;SYM: pkg|symbol, and
 * ;;DEF: path|byte-offset|NAME|kind per defining form (go-to-definition).
 * Warnings raised while a project form loads are located:
 * ;;WARNING: path|byte-offset|text.
 *
 * All wecl_* functions are Asyncify async — always awaited, always serialized.
 */

/* eslint-disable */
'use strict';

var currentJobId = 0; /* evals are serialized, so output attribution is simple */
var verifyLines = null; /* during helper verification, also record lines here */

function bootLine(line) {
  self.postMessage({ type: 'boot', line: String(line) });
}

/* CL helper definitions (kept free of backslashes; embedded via escaping).
 *
 * load-project protocol (all printed markers are parsed by the main thread):
 *   ;;FILE: <path>|<ok|warn|error>|<message> — per-file load status
 *   ;;PKG: <NAME>|<external-symbol-count>    — package defined by the project
 *   ;;SYM: <PKG>|<SYMBOL>                    — reported symbol (autocomplete)
 *   ;;NOTE: <diagnostic>                     — loader diagnostic (log only)
 *   ;;HINT: <text>                           — verified "then call it" hint
 *
 * Loading strategy for a project written under /project/:
 *   0. Polyfills: EXT:CD (via ext:chdir/ext:getcwd), EXT:SHELL and
 *      EXT:RUN-PROGRAM stubs that SIGNAL a clean CL error (subprocesses are
 *      impossible in wasm) — defined only when missing, so project files
 *      READ cleanly and a gnuplot/subprocess call is a per-form condition,
 *      never a reader error or a debugger entry. When real ASDF is absent
 *      (this image has none: (require :asdf) fails) a minimal dummy ASDF
 *      package with exported DEFSYSTEM / LOAD-SYSTEM / OPERATE /
 *      *CENTRAL-REGISTRY* is created so .asd files and init files that
 *      reference asdf:* still read; dummy load-system is a quiet no-op.
 *   1. Each .asd is READ (never "loaded" as plain lisp): defpackage forms
 *      are evaluated, defsystem is parsed for :components order. If real
 *      ASDF is present, asdf:load-source-op is tried first (load-op is NOT:
 *      it routes through the bytecodes compiler, which can hang/crash the
 *      wasm worker); any failure is reported via ;;NOTE: and falls through
 *      to the manual path.
 *   2. Manual path loads files top-level-form by top-level-form (per-form
 *      error isolation: one bad form never nukes the rest of the file) in
 *      CL-USER — matching the upstream workflow for projects without
 *      in-package — in this order: asd :components order first, then all
 *      remaining .lisp files (examples/entry files) alphabetically.
 *      A file where every form evaluated is ok; a file where some forms
 *      failed (e.g. a subprocess call) is warn; a file where nothing
 *      evaluated is error.
 * Reporting is honest: only packages DEFINED BY PROJECT FILES (present
 * after the load but not before, infrastructure excluded) are emitted as
 * ;;PKG:/;;SYM:, plus freshly defined (fboundp/boundp/class) CL-USER
 * symbols when the project loaded into CL-USER. The ;;HINT: symbol is
 * verified (find-class/fboundp/boundp) before it is printed. */
var CC_HELPER_SRC = [
  '(defpackage :cc (:use :cl) (:export :eval-string :load-project :package-install :package-list :package-uninstall :package-load))',
  '(in-package :cc)',
  '(defvar *eval-package* (find-package :cl-user))',
  /* (path . byte-offset) of the project form being loaded, so warnings and
   * definitions can be located — bound in %load-file-forms (Sprint 6) */
  '(defvar *load-context* nil)',
  '(defun %report (e)',
  '  (let ((s (princ-to-string e)))',
  '    (if (and (> (length s) 1) (char= (char s 0) #\\#))',
  '        (format nil "~A signalled" (type-of e))',
  '        s)))',
  /* ;;WARNING: text  — or, while a project form is loading,
   * ;;WARNING: /project/path|byte-offset|text (a located warning) */
  '(defun %say-warning (msg)',
  '  (if *load-context*',
  '      (format *error-output* "~&;;WARNING: ~A|~D|~A~%"',
  '              (substitute #\\/ #\\| (princ-to-string (car *load-context*)))',
  '              (or (cdr *load-context*) 0)',
  '              (substitute #\\Space #\\Newline (princ-to-string msg)))',
  '      (format *error-output* "~&;;WARNING: ~A~%" msg)))',
  '(defun %warn (w)',
  '  (%say-warning (%report w))',
  '  (let ((r (find-restart \'muffle-warning w)))',
  '    (when r (invoke-restart r))))',
  /* ---- honest condition reporting ----
   * %note-error runs INSIDE handler-bind, i.e. at signal time before the
   * stack unwinds, so the invocation-history stack (si::ihs-*) still holds
   * the user frames. It prints the real condition type and the named user
   * frames (innermost first) as markers; the outer handler-case then
   * unwinds and prints ;;ERROR: as before. A user's own inner handler-case
   * runs first and unwinds past us, so these markers only appear for
   * conditions that really reach the top level. */
  '(defun %frame-name (i)',
  '  (let* ((f (ignore-errors (si::ihs-fun i)))',
  '         (n (and f (ignore-errors (si::compiled-function-name f)))))',
  '    (and n (symbolp n) n)))',
  '(defun %user-frames ()',
  '  (let ((cc (find-package :cc)) (si (find-package :si)))',
  '    (loop for i from (si::ihs-top) downto 1',
  '          for n = (%frame-name i)',
  '          until (eq n (quote eval-one))',
  '          when (and n',
  '                    (not (eq (symbol-package n) cc))',
  '                    (not (eq (symbol-package n) si)))',
  '            collect (prin1-to-string n))))',
  /* condition slots worth showing: printed as ;;DETAIL: key|value */
  '(defun %condition-details (e)',
  '  (let ((out nil))',
  '    (flet ((add (k v) (push (cons k (%oneline (handler-case (prin1-to-string v) (serious-condition () "?")))) out)))',
  '      (handler-case',
  '          (progn',
  '            (when (typep e (quote type-error))',
  '              (add "datum" (type-error-datum e))',
  '              (add "expected" (type-error-expected-type e)))',
  '            (when (typep e (quote cell-error))',
  '              (add "name" (cell-error-name e)))',
  '            (when (typep e (quote arithmetic-error))',
  '              (add "operation" (arithmetic-error-operation e))',
  '              (add "operands" (arithmetic-error-operands e)))',
  '            (when (typep e (quote package-error))',
  '              (add "package" (package-error-package e)))',
  '            (when (typep e (quote file-error))',
  '              (add "pathname" (file-error-pathname e)))',
  '            (when (typep e (quote stream-error))',
  '              (add "stream" (stream-error-stream e))))',
  '        (serious-condition () nil)))',
  '    (nreverse out)))',
  '(defun %note-error (e)',
  '  (handler-case',
  '      (progn',
  '        (format *error-output* "~&;;ERRTYPE: ~A~%" (type-of e))',
  '        (dolist (d (%condition-details e))',
  '          (format *error-output* "~&;;DETAIL: ~A|~A~%" (car d) (cdr d)))',
  '        (dolist (f (%user-frames))',
  '          (format *error-output* "~&;;FRAME: ~A~%" f)))',
  '    (serious-condition () nil)))',
  /* evalMode "compile": every top-level form goes through the bytecodes
   * compiler as a lambda before it runs (verified in this image). */
  '(defvar *eval-compile* nil)',
  '(defun %run (form)',
  '  (if *eval-compile*',
  '      (funcall (compile nil (list (quote lambda) (quote ()) form)))',
  '      (eval form)))',
  /* ---- interactive debugger (Sprint 3) ----
   * For a job sent with debug:true, an unhandled error PAUSES the image
   * inside the handler-bind handler: the live restarts are printed as
   * markers and js-wait suspends the wasm on a promise that the worker
   * resolves when the page posts {type:'restart', id, index, value?}
   * (see __ccDebugWait below). The chosen restart is invoked from the
   * handler (a non-local exit); a decline (index -1) returns normally and
   * the outer handler-case reports ;;ERROR: exactly as before.
   *   ;;DEBUG: <report>            start of a pause block
   *   ;;RESTART: i|NAME|<report>   one line per live restart
   *   ;;DEBUG-WAIT                 block complete, image suspended
   *   ;;DEBUG-NOTE: <text>         a value form failed; re-pausing
   * The image establishes no restarts of its own for top-level errors, so
   * eval-one adds RETRY and ABORT; user restart-case restarts are listed
   * before them (innermost first). */
  '(defvar *debug-enabled* nil)',
  '(defvar *debug-condition* nil)',
  '(defun %restart-report (r)',
  '  (%oneline (handler-case (princ-to-string r)',
  '              (serious-condition () (string (restart-name r))))))',
  '(defun %debug-choice ()',
  '  (handler-case',
  '      (eu.turtleware.wecl/implementation::js-wait "__ccDebugWait()")',
  '    (serious-condition () "-1")))',
  '(defun %debug-pause (e)',
  '  (%note-error e)',
  '  (setf *debug-condition* e)',
  '  (when *debug-enabled*',
  '    (let ((restarts (compute-restarts e)))',
  '      (loop',
  '        (handler-case (%flush-out) (serious-condition () nil))',
  '        (format *error-output* "~&;;DEBUG: ~A~%" (%oneline (%report e)))',
  '        (loop for r in restarts for i from 0',
  '              do (format *error-output* "~&;;RESTART: ~D|~A|~A~%"',
  '                         i (restart-name r) (%restart-report r)))',
  '        (format *error-output* "~&;;DEBUG-WAIT~%")',
  '        (finish-output)',
  '        (let* ((choice (string-trim " " (%debug-choice)))',
  '               (sp (position #\\Space choice))',
  '               (idx (parse-integer choice :end sp :junk-allowed t))',
  '               (r (and idx (>= idx 0) (< idx (length restarts)) (nth idx restarts))))',
  '          (unless r (return nil))',
  '          (if sp',
  '              (let ((val (handler-case (eval (read-from-string (subseq choice (1+ sp))))',
  '                           (serious-condition (ve)',
  '                             (format *error-output* "~&;;DEBUG-NOTE: value form failed: ~A~%" (%report ve))',
  '                             (finish-output)',
  '                             (quote %cc-bad-value)))))',
  '                (unless (eq val (quote %cc-bad-value))',
  '                  (invoke-restart r val)))',
  '              (invoke-restart r)))))))',
  '(defun eval-one (form)',
  '  (handler-case',
  '      (let ((vals (restart-case',
  '                      (handler-bind ((warning #\'%warn)',
  '                                     (serious-condition #\'%debug-pause))',
  '                        (multiple-value-list (%run form)))',
  '                    (retry ()',
  '                      :report "Retry evaluating this form"',
  '                      (return-from eval-one (eval-one form)))',
  /* set-and-retry restarts: only offered (via :test) when the condition
   * is the matching cell-error — the two mistakes every REPL session makes */
  /* NB: invoke-restart re-checks :test with NIL for the condition, so the
   * tests must accept NIL or the restart reports "not active" */
  '                    (store-value (v)',
  '                      :test (lambda (c) (or (null c) (typep c (quote unbound-variable))))',
  '                      :report "Set the variable to a value, then retry this form"',
  '                      (setf (symbol-value (cell-error-name *debug-condition*)) v)',
  '                      (return-from eval-one (eval-one form)))',
  '                    (define-function (f)',
  '                      :test (lambda (c) (or (null c) (typep c (quote undefined-function))))',
  '                      :report "Define the function (a lambda or a function name), then retry this form"',
  '                      (setf (symbol-function (cell-error-name *debug-condition*)) (coerce f (quote function)))',
  '                      (return-from eval-one (eval-one form)))',
  '                    (abort ()',
  '                      :report "Abort this form and return to top level"',
  '                      (format *error-output* "~&;;ERROR: ~A~%"',
  '                              (if *debug-condition* (%report *debug-condition*) "aborted"))',
  '                      (return-from eval-one nil)))))',
  /* one ;;=> line per value: a value that prints with spaces (#<"SMOKE" package>)
   * is still one value main-side (Sprint 12) */
  /* *print-pretty* nil: the pretty printer would wrap a long value over
   * several lines and only the first would be taken as the value (Sprint 13) */
  '        (if vals',
  '            (let ((*print-pretty* nil)) (dolist (v vals) (format t "~&;;=> ~S~%" v)))',
  '            (format t "~&;;=> ; no values~%"))',
  '        t)',
  '    (serious-condition (e)',
  '      (format *error-output* "~&;;ERROR: ~A~%" (%report e))',
  '      nil)))',
  /* *package* is rebound per job so a reader error can never leave the image
   * in a half-switched state, BUT the binding is copied back into
   * *eval-package* when the job ends: (in-package :foo) in one cell is
   * honored by every later cell, exactly like a terminal REPL. The final
   * ;;PACKAGE: marker keeps the IDE's package pill in sync (parsed
   * main-side, never shown as output). */
  /* PATH (the buffer name, when the page knows it) makes each successfully
   * evaluated definition print ;;DEF: path|offset|NAME|kind, offset being
   * the form's position in SRC — same probe as the project loader */
  '(defun eval-string (src &key compile debug path)',
  '  (let ((*package* (or *eval-package* (find-package :cl-user) *package*))',
  '        (*eval-compile* compile)',
  '        (*debug-enabled* debug)',
  '        (*debug-condition* nil))',
  '    (handler-case (%stdin-reset) (serious-condition () nil))',
  '    (with-input-from-string (in src)',
  '      (loop',
  '        (when path (handler-case (%skip-blank in) (serious-condition () nil)))',
  '        (let* ((pos (or (ignore-errors (file-position in)) 0))',
  '               (form (handler-case (read in nil :eof)',
  '                       (serious-condition (e)',
  '                         (format *error-output* "~&;;ERROR: reader: ~A~%" (%report e))',
  '                         :cc-read-fail))))',
  '          (when (eq form :eof) (return))',
  '          (unless (eq form :cc-read-fail)',
  '            (when (and (eval-one form) path) (%say-def path pos form)))',
  '          (finish-output))))',
  '    (setf *eval-package* *package*)',
  '    (format t "~&;;PACKAGE: ~A~%" (%package-label *package*))',
  '    (finish-output)))',
  /* shortest name/nickname, so the pill reads CL-USER, not COMMON-LISP-USER */
  '(defun %package-label (p)',
  '  (let ((names (remove nil (cons (package-name p) (package-nicknames p)))))',
  '    (if names',
  '        (first (sort (copy-list names) (function <) :key (function length)))',
  '        "CL-USER")))',
  ';;; ---- project loader ----',
  '(defun %oneline (s)',
  '  (substitute #\\Space #\\Newline (substitute #\\/ #\\| (princ-to-string s))))',
  '(defun %say-file (path status msg)',
  '  (format t "~&;;FILE: ~A|~A|~A~%" (%oneline path) status (%oneline (or msg "")))',
  '  (finish-output))',
  '(defun %say-note (msg)',
  '  (format t "~&;;NOTE: ~A~%" (%oneline msg))',
  '  (finish-output))',
  '(defun %say-hint (msg)',
  '  (format t "~&;;HINT: ~A~%" (%oneline msg))',
  '  (finish-output))',
  '(defun %snapshot-symbols ()',
  '  (let ((h (make-hash-table :test (quote eq))))',
  '    (dolist (p (list-all-packages) h)',
  '      (do-symbols (s p) (setf (gethash s h) t)))))',
  '(defun %read-forms-from (path)',
  '  (handler-case',
  '      (with-open-file (in path :direction :input)',
  '        (loop for f = (read in nil :eof) until (eq f :eof) collect f))',
  '    (serious-condition () nil)))',
  '(defun %head-named (form name)',
  '  (and (consp form) (symbolp (car form)) (string-equal (symbol-name (car form)) name)))',
  '(defun %flatten-components (comps dir)',
  '  (mapcan',
  '   (lambda (c)',
  '     (cond ((and (consp c) (%head-named c "FILE") (stringp (cadr c)))',
  '            (list (concatenate (quote string) dir (cadr c) ".lisp")))',
  '           ((and (consp c) (%head-named c "MODULE") (stringp (cadr c)))',
  '            (%flatten-components (getf (cddr c) :components)',
  '                                 (concatenate (quote string) dir (cadr c) "/")))',
  '           (t nil)))',
  '   comps))',
  '(defun %ext= (path ext)',
  '  (let ((p (string-downcase path)) (e (string-downcase ext)))',
  '    (and (>= (length p) (length e))',
  '         (string= e (subseq p (- (length p) (length e)))))))',
  '(defun %dir-of (path)',
  '  (namestring (make-pathname :directory (pathname-directory (pathname path)))))',
  /* ---- gnuplot capture (cl-plot) ----
   * cl-plot writes a gnuplot command file + data files under /tmp, then calls
   * (ext::shell "bash <cmdfile>"). No subprocess can exist in wasm, so the
   * ext:shell polyfill intercepts that pattern: it reads the script and every
   * data file referenced by its plot/replot commands (quoted absolute paths),
   * packs them as prin1-printed strings (script, then path/content pairs),
   * base64-encodes the pack (single-line safe), and prints ONE stdout marker:
   *   ;;PLOT64 <base64>
   * stdout posts carry the current job id, so the main thread attributes the
   * plot to the running eval/load job. The shell call then returns 0 so
   * cl-plot's do-plotting cleanup (delete-file of the temp files) proceeds. */
  '(defvar *b64-tab* "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/")',
  '(defun %b64-byte (s i)',
  '  (let ((c (char-code (char s i)))) (if (< c 256) c 63)))',
  '(defun %b64-encode (s)',
  '  (let ((out (make-string-output-stream)) (n (length s)))',
  '    (loop for i from 0 below n by 3 do',
  '      (let* ((b0 (%b64-byte s i))',
  '             (b1 (if (< (+ i 1) n) (%b64-byte s (+ i 1)) -1))',
  '             (b2 (if (< (+ i 2) n) (%b64-byte s (+ i 2)) -1)))',
  '        (write-char (char *b64-tab* (ash b0 -2)) out)',
  '        (write-char (char *b64-tab* (logior (ash (logand b0 3) 4) (if (< b1 0) 0 (ash b1 -4)))) out)',
  '        (write-char (if (< b1 0) #\\= (char *b64-tab* (logior (ash (logand b1 15) 2) (if (< b2 0) 0 (ash b2 -6))))) out)',
  '        (write-char (if (< b2 0) #\\= (char *b64-tab* (logand b2 63))) out)))',
  '    (get-output-stream-string out)))',
  '(defun %slurp-file (path)',
  '  (handler-case',
  '      (with-open-file (in path :direction :input)',
  '        (with-output-to-string (out)',
  '          (loop for ch = (read-char in nil nil) while ch do (write-char ch out))))',
  '    (serious-condition () nil)))',
  '(defun %starts-with (s prefix)',
  '  (and (>= (length s) (length prefix)) (string= prefix (subseq s 0 (length prefix)))))',
  '(defun %shell-script-path (cmd)',
  '  (let* ((trimmed (string-trim (quote (#\\Space #\\Tab)) (princ-to-string cmd)))',
  '         (sp (position #\\Space trimmed)))',
  '    (if sp',
  '        (let ((sh (subseq trimmed 0 sp))',
  '              (rest (string-trim (quote (#\\Space #\\Tab)) (subseq trimmed (1+ sp)))))',
  '          (when (and (member sh (quote ("bash" "sh")) :test (function string=))',
  '                     (plusp (length rest))',
  '                     (char= (char rest 0) #\\/)',
  '                     (not (find #\\Space rest)))',
  '            rest))',
  '        (when (and (plusp (length trimmed)) (char= (char trimmed 0) #\\/))',
  '          trimmed))))',
  '(defun %plot-data-paths (script)',
  '  (let ((paths nil) (start 0) (n (length script)))',
  '    (loop',
  '      (let ((eol (or (position #\\Newline script :start start) n)))',
  '        (let ((line (string-trim (quote (#\\Space #\\Tab #\\Return)) (subseq script start eol))))',
  '          (when (or (%starts-with line "plot ") (%starts-with line "replot "))',
  '            (let ((q1 (position #\\" line)))',
  '              (when q1',
  '                (let ((q2 (position #\\" line :start (1+ q1))))',
  '                  (when q2 (pushnew (subseq line (1+ q1) q2) paths :test (function string=))))))))',
  '        (when (>= eol n) (return))',
  '        (setf start (1+ eol))))',
  '    (nreverse paths)))',
  '(defun %emit-gnuplot (script)',
  '  (let* ((paths (%plot-data-paths script))',
  '         (files (mapcar (lambda (p) (cons p (or (%slurp-file p) ""))) paths)))',
  '    (format t "~&;;PLOT64 ~A~%"',
  '            (%b64-encode',
  '             (with-output-to-string (out)',
  '               (write script :stream out)',
  '               (dolist (f files)',
  '                 (write-char #\\Newline out)',
  '                 (write (car f) :stream out)',
  '                 (write-char #\\Newline out)',
  '                 (write (cdr f) :stream out)))))',
  '    (%say-note "gnuplot intercepted -- rendered in browser (SVG)")',
  '    (finish-output)',
  '    0))',
  '(defun %shell-dispatch (cmd)',
  '  (let ((path (%shell-script-path cmd)))',
  '    (if path',
  '        (let ((script (%slurp-file path)))',
  '          (if (and script (search "gnuplot" script))',
  '              (handler-case (%emit-gnuplot script)',
  '                (serious-condition (e)',
  '                  (error "gnuplot capture failed: ~A" (%report e))))',
  '              (error "~A (ext:shell ~S)" *subprocess-msg* cmd)))',
  '        (error "~A (ext:shell ~S)" *subprocess-msg* cmd))))',
  /* ---- portability polyfills (installed before any project file is read) ---- */
  '(defvar *subprocess-msg* "subprocesses are not supported in the WASM runtime")',
  '(defun %ensure-ext-fun (name thunk)',
  '  (handler-case',
  '      (let* ((pkg (find-package :ext))',
  '             (sym (and pkg (intern name pkg))))',
  '        (when (and sym (not (fboundp sym)))',
  '          (setf (symbol-function sym) thunk)',
  '          (export sym pkg)',
  '          t))',
  '    (serious-condition () nil)))',
  '(defun %install-ext-polyfills ()',
  /* ext:cd — the classic ECL REPL helper; missing from this wasm image */
  '  (%ensure-ext-fun "CD"',
  '    (lambda (&optional dir)',
  '      (when dir (ext:chdir dir))',
  '      (setf *default-pathname-defaults* (ext:getcwd))',
  '      (ext:getcwd)))',
  /* ext:shell — subprocesses are impossible in wasm, BUT the cl-plot gnuplot
   * hand-off (bash <script-file>) is intercepted and captured to the browser
   * via %shell-dispatch (see ;;PLOT64 above). Installed UNCONDITIONALLY:
   * even if the image exports its own SHELL, a real shell cannot work here.
   * Non-gnuplot commands keep the clean, catchable error behavior. */
  '  (handler-case',
  '      (let* ((pkg (find-package :ext))',
  '             (sym (and pkg (intern "SHELL" pkg))))',
  '        (when sym',
  '          (setf (symbol-function sym) (function %shell-dispatch))',
  '          (export sym pkg)))',
  '    (serious-condition () nil))',
  /* ext:run-program exists in this image (and already errors cleanly),
   * so only fill gaps. */
  '  (%ensure-ext-fun "RUN-PROGRAM"',
  '    (lambda (cmd &rest args)',
  '      (declare (ignorable cmd args))',
  '      (error "~A (ext:run-program)" *subprocess-msg*))))',
  '(defun %ensure-dummy-asdf ()',
  '  (unless (find-package :asdf)',
  '    (handler-case',
  '        (let ((pkg (make-package :asdf :use (quote ()))))',
  '          (dolist (n (list "DEFSYSTEM" "LOAD-SYSTEM" "OPERATE" "*CENTRAL-REGISTRY*"))',
  '            (export (intern n pkg) pkg))',
  '          (setf (symbol-value (intern "*CENTRAL-REGISTRY*" pkg)) nil)',
  '          (setf (symbol-function (intern "LOAD-SYSTEM" pkg))',
  '                (lambda (system &rest keys)',
  '                  (declare (ignorable keys))',
  '                  (format t "~&;;NOTE: asdf is not available in this runtime -- (asdf:load-system ~(~A~)) treated as already loaded~%" system)',
  '                  (finish-output)',
  '                  t))',
  '          (setf (symbol-function (intern "OPERATE" pkg))',
  '                (lambda (&rest args)',
  '                  (declare (ignorable args))',
  '                  (format t "~&;;NOTE: asdf is not available in this runtime -- asdf:operate ignored~%")',
  '                  (finish-output)',
  '                  t))',
  '          t)',
  '      (serious-condition () nil))))',
  '(defun %asdf-available-p ()',
  '  (handler-case (progn (require :asdf) (find-package :asdf))',
  '    (serious-condition () nil)))',
  '(defun %try-asdf-load (dir sysname comps opname)',
  '  (let ((asdf-pkg (find-package :asdf)))',
  '    (when asdf-pkg',
  '      (let ((op (find-symbol opname asdf-pkg))',
  '            (operate (find-symbol "OPERATE" asdf-pkg))',
  '            (registry (find-symbol "*CENTRAL-REGISTRY*" asdf-pkg)))',
  '        (if (not (and op operate (fboundp operate)))',
  '            (progn',
  '              (%say-note (format nil "asdf ~A is not usable here -- loading components manually" opname))',
  '              nil)',
  '            (handler-case',
  '                (progn',
  '                  (when registry',
  '                    (pushnew (pathname dir) (symbol-value registry) :test (function equal)))',
  '                  (funcall operate op sysname)',
  '                  (dolist (c comps)',
  '                    (%say-file c "ok" (format nil "via asdf ~(~A~)" opname)))',
  '                  t)',
  '              (serious-condition (e)',
  '                (%say-note (format nil "asdf ~(~A~) failed: ~A -- falling back to manual load" opname (%report e)))',
  '                nil)))))))',
  /* per-form file loader: like LOAD, but one bad top-level form never nukes
   * the rest of the file. Everything starts in CL-USER (upstream workflow
   * for projects without in-package); files that DO use in-package switch
   * themselves naturally when the form is evaluated. Per-form failures are
   * reported as ;;WARNING: on stderr (a raw ;;ERROR: would mark the whole
   * load job as failed main-side) and folded into the ;;FILE: status. */
  /* skip whitespace AND ;-comments so file-position lands on the form
   * itself (read consumes comments, peek-char only skips whitespace) */
  '(defun %skip-block-comment (in)',
  '  ;; called after the opening #| was consumed; handles nesting',
  '  (let ((depth 1))',
  '    (loop while (> depth 0)',
  '      do (let ((c (read-char in nil nil)))',
  '           (cond ((null c) (return))',
  '                 ((and (eql c #\\|) (eql (peek-char nil in nil nil) #\\#))',
  '                  (read-char in) (decf depth))',
  '                 ((and (eql c #\\#) (eql (peek-char nil in nil nil) #\\|))',
  '                  (read-char in) (incf depth)))))))',
  '(defun %skip-blank (in)',
  '  ;; skip whitespace, ; comments and #| |# comments so that the recorded',
  '  ;; file-position is the start of the next form',
  '  (loop',
  '    (peek-char t in nil nil)',
  '    (let ((c (peek-char nil in nil nil)))',
  '      (cond ((eql c #\\;) (read-line in nil nil))',
  '            ((eql c #\\#)',
  '             (let ((p (file-position in)))',
  '               (read-char in)',
  '               (if (eql (peek-char nil in nil nil) #\\|)',
  '                   (progn (read-char in) (%skip-block-comment in))',
  '                   (progn (file-position in p) (return)))))',
  '            (t (return))))))',
  '(defun %load-file-forms (path)',
  '  (let ((nok 0) (nerr 0) (first-err nil))',
  '    (handler-case',
  '        (with-open-file (in path :direction :input)',
  '          (let ((*package* (or (find-package :cl-user) *package*))',
  '                (*load-pathname* (pathname path))',
  '                (*load-truename* (pathname path)))',
  '            (loop',
  '              (%skip-blank in)',
  '              (let* ((pos (or (ignore-errors (file-position in)) 0))',
  '                     (*load-context* (cons path pos))',
  '                     (form (handler-case (read in nil :eof)',
  '                             (serious-condition (e)',
  '                               (setf first-err (or first-err (format nil "reader: ~A" (%report e))))',
  '                               :cc-read-fail))))',
  '                (cond ((eq form :eof) (return))',
  '                      ((eq form :cc-read-fail)',
  '                       (incf nerr)',
  '                       (%say-warning first-err)',
  '                       (return))',
  '                      (t',
  '                       (let ((r (%load-one-form path form)))',
  '                         (case r',
  '                           (:ok (incf nok) (%say-def path pos form))',
  '                           (:abort-load',
  '                            (incf nerr)',
  '                            (setf first-err (or first-err "load aborted from the debugger"))',
  '                            (setf *load-aborted* t)',
  '                            (return))',
  '                           (t (incf nerr) (setf first-err (or first-err r)))))))))))',
  '      (serious-condition (e)',
  '        (setf first-err (or first-err (%report e)))',
  '        (when (zerop nerr) (incf nerr))))',
  '    (values nok nerr first-err)))',
  /* One project form through the debugger (Sprint 5). With debug on, an
   * unhandled error pauses the image with load-specific restarts; with
   * debug off (or a decline) the form is skipped exactly as before and the
   * failure is folded into the file status. Returns :ok, :abort-load, or
   * the report string of the skipped form. */
  '(defvar *load-aborted* nil)',
  /* ;;DEF: path|byte-offset|NAME|kind for every defining form a project
   * file evaluated — the page turns these into go-to-definition targets */
  '(defvar *def-heads* (list "DEFUN" "DEFMACRO" "DEFVAR" "DEFPARAMETER" "DEFCONSTANT" "DEFCLASS"',
  '                           "DEFSTRUCT" "DEFGENERIC" "DEFMETHOD" "DEFTYPE" "DEFINE-CONDITION" "DEFPACKAGE"))',
  '(defun %def-name (n)',
  '  (cond ((and (consp n) (symbolp (car n)) (string= (symbol-name (car n)) "SETF") (consp (cdr n)))',
  '         (format nil "(SETF ~A)" (%def-name (cadr n))))',
  '        ((consp n) (%def-name (car n)))',
  '        ((symbolp n) (symbol-name n))',
  '        ((stringp n) (string-upcase n))',
  '        (t (%oneline (prin1-to-string n)))))',
  '(defun %say-def (path pos form)',
  '  (handler-case',
  '      (when (and (consp form) (symbolp (car form)) (consp (cdr form))',
  '                 (member (symbol-name (car form)) *def-heads* :test (function string=)))',
  '        (format t "~&;;DEF: ~A|~D|~A|~A~%"',
  '                (%oneline path) pos (%def-name (cadr form)) (string-downcase (symbol-name (car form))))',
  '        (finish-output))',
  '    (serious-condition () nil)))',
  '(defun %load-one-form (path form)',
  '  (loop',
  '    (let ((outcome',
  '            (restart-case',
  '                (handler-case',
  '                    (progn',
  '                      (handler-bind ((warning (function %warn))',
  '                                     (serious-condition (function %debug-pause)))',
  '                        (eval form))',
  '                      :ok)',
  '                  (serious-condition (e)',
  '                    (%say-warning (%report e))',
  '                    (%report e)))',
  '              (skip-form ()',
  '                :report "Skip this form and keep loading the project"',
  '                (let ((msg (if *debug-condition* (%report *debug-condition*) "skipped")))',
  '                  (%say-warning (format nil "~A (skipped)" msg))',
  '                  msg))',
  '              (retry ()',
  '                :report "Retry this form"',
  '                :cc-retry)',
  '              (store-value (v)',
  '                :test (lambda (c) (or (null c) (typep c (quote unbound-variable))))',
  '                :report "Set the variable to a value, then retry this form"',
  '                (setf (symbol-value (cell-error-name *debug-condition*)) v)',
  '                :cc-retry)',
  '              (define-function (f)',
  '                :test (lambda (c) (or (null c) (typep c (quote undefined-function))))',
  '                :report "Define the function (a lambda or a function name), then retry this form"',
  '                (setf (symbol-function (cell-error-name *debug-condition*)) (coerce f (quote function)))',
  '                :cc-retry)',
  '              (abort-load ()',
  '                :report "Stop loading the project here"',
  '                :abort-load))))',
  '      (unless (eq outcome :cc-retry) (return outcome)))))',
  '(defun %manual-load-ordered (files)',
  '  (dolist (f files)',
  '    (if *load-aborted*',
  '        (%say-file f "error" "not loaded -- load aborted from the debugger")',
  '        (multiple-value-bind (nok nerr first-err) (%load-file-forms f)',
  '          (cond ((zerop nerr)',
  '                 (%say-file f "ok" (format nil "loaded (~A form~:P)" nok)))',
  '                ((plusp nok)',
  '                 (%say-file f "warn" (format nil "~A/~A forms ok -- ~A" nok (+ nok nerr) first-err)))',
  '                (t',
  '                 (%say-file f "error" (or first-err "load failed"))))))))',
  '(defun %package-first (files)',
  '  (sort (copy-list files)',
  '        (lambda (a b)',
  '          (let ((pa (or (search "package" (string-downcase (or (pathname-name a) "")))',
  '                        most-positive-fixnum))',
  '                (pb (or (search "package" (string-downcase (or (pathname-name b) "")))',
  '                        most-positive-fixnum)))',
  '            (if (= pa pb) (string< a b) (< pa pb))))))',
  '(defun %load-with-asd (asd lisps asdf-real)',
  '  (let* ((forms (%read-forms-from asd))',
  '         (defpkgs (remove-if-not (lambda (f) (%head-named f "DEFPACKAGE")) forms))',
  '         (defsys (find-if (lambda (f) (%head-named f "DEFSYSTEM")) forms))',
  '         (dir (%dir-of asd))',
  '         (comps (if defsys (%flatten-components (getf (cddr defsys) :components) dir) nil))',
  '         (sysname (or (and defsys (symbolp (cadr defsys))',
  '                           (string-downcase (symbol-name (cadr defsys))))',
  '                      (pathname-name asd)))',
  '         (done nil))',
  '    (if forms',
  '        (%say-file asd "ok" (format nil "parsed -- system ~A (~A component~:P)" sysname (length comps)))',
  '        (%say-file asd "warn" "could not parse -- no component information"))',
  '    (dolist (dp defpkgs)',
  '      (handler-case (eval dp)',
  '        (serious-condition (e)',
  '          (%say-note (format nil "defpackage in ~A failed: ~A" asd (%report e))))))',
  '    (when asdf-real',
  '      (setf done (%try-asdf-load dir sysname comps "LOAD-SOURCE-OP")))',
  '    (unless done',
  /* asd :components order first (serial systems), then every remaining
   * project .lisp (examples/entry files like init.lisp) LAST, alphabetical */
  '      (let* ((ordered (remove-if-not (lambda (c) (member c lisps :test (function string=))) comps))',
  '             (rest (sort (set-difference lisps ordered :test (function string=))',
  '                         (function string<))))',
  '        (%manual-load-ordered (append ordered rest))))',
  '    done))',
  '(defun %count-external (p)',
  '  (let ((n 0)) (do-external-symbols (s p) (incf n)) n))',
  /* freshly DEFINED (fboundp/boundp/class) symbols that landed in CL-USER —
   * the project's API when no file uses in-package. The definition test
   * filters out symbols that were merely interned by reading. */
  '(defun %fresh-defined (syms-before)',
  '  (let ((cl-user (find-package :cl-user)) (out nil))',
  '    (when cl-user',
  '      (do-symbols (s cl-user)',
  '        (when (and (eq (symbol-package s) cl-user)',
  '                   (not (gethash s syms-before))',
  '                   (or (fboundp s) (boundp s) (find-class s nil)))',
  '          (push s out))))',
  '    (sort out (function string<) :key (function symbol-name))))',
  '(defun %emit-project-api (pkgs-before syms-before)',
  '  (let ((newpkgs (set-difference (list-all-packages) pkgs-before)))',
  '    (dolist (p newpkgs)',
  '      (let ((fresh nil))',
  '        (do-symbols (s p)',
  '          (when (and (eq (symbol-package s) p)',
  '                     (not (gethash s syms-before))',
  '                     (or (fboundp s) (boundp s) (find-class s nil)))',
  '            (push s fresh)))',
  '        (dolist (s fresh) (handler-case (export s p) (serious-condition () nil))))',
  '      (let ((syms nil))',
  '        (do-external-symbols (s p) (push (symbol-name s) syms))',
  '        (setf syms (sort syms (function string<)))',
  '        (format t "~&;;PKG: ~A|~A~%" (package-name p) (length syms))',
  '        (dolist (s syms) (format t "~&;;SYM: ~A|~A~%" (package-name p) s))))',
  '    (let ((fresh (%fresh-defined syms-before)))',
  '      (when fresh',
  '        (format t "~&;;PKG: CL-USER|~A~%" (length fresh))',
  '        (dolist (s fresh) (format t "~&;;SYM: CL-USER|~A~%" (symbol-name s)))))',
  '    (finish-output)))',
  '(defun %emit-hint (pkgs-before syms-before)',
  '  (let* ((fresh (%fresh-defined syms-before))',
  '         (callable (or (find-if (lambda (s) (find-class s nil)) fresh)',
  '                       (find-if (function fboundp) fresh)',
  '                       (find-if (function boundp) fresh))))',
  '    (if callable',
  '        (let* ((names (mapcar (lambda (s) (string-downcase (symbol-name s))) fresh))',
  '               (shown (subseq names 0 (min 8 (length names))))',
  '               (more (> (length names) 8))',
  '               (call (cond ((find-class callable nil)',
  '                            (format nil "(make-instance (quote ~A))"',
  '                                    (string-downcase (symbol-name callable))))',
  '                           ((fboundp callable)',
  '                            (format nil "(~A ...)" (string-downcase (symbol-name callable))))',
  '                           (t (format nil "~A (special variable)"',
  '                                      (string-downcase (symbol-name callable)))))))',
  '          (%say-hint (format nil "Loaded in CL-USER: ~{~A~^, ~}~:[~;, ...~] -- call e.g. ~A"',
  '                             shown more call)))',
  '        (let* ((newpkgs (set-difference (list-all-packages) pkgs-before))',
  '               (found nil))',
  '          (dolist (p newpkgs)',
  '            (unless found',
  '              (do-external-symbols (s p)',
  '                (unless found',
  '                  (when (or (fboundp s) (find-class s nil))',
  '                    (setf found (cons p s)))))))',
  '          (when found',
  '            (%say-hint (format nil "Loaded package ~A -- call e.g. (~A:~A ...)"',
  '                               (package-name (car found))',
  '                               (string-downcase (package-name (car found)))',
  '                               (string-downcase (symbol-name (cdr found))))))))))',
  '(defun load-project (files &key debug)',
  '  (setf *load-aborted* nil)',
  '  (let* ((*debug-enabled* debug)',
  '         (*debug-condition* nil)',
  '         (asds (remove-if-not (lambda (f) (%ext= f ".asd")) files))',
  '         (lisps (remove-if-not (lambda (f) (or (%ext= f ".lisp") (%ext= f ".lsp") (%ext= f ".cl")))',
  '                               files)))',
  '    (%install-ext-polyfills)',
  /* try real asdf FIRST; only when it is genuinely absent install the dummy
   * (the dummy exists purely so .asd / init files READ cleanly). Both the
   * package and symbol snapshots happen AFTER this infrastructure setup, so
   * it can never leak into the project API report. */
  '    (let* ((asdf-real (%asdf-available-p))',
  '           (pkgs-before (progn',
  '                          (if asdf-real',
  '                              (%say-note "asdf detected -- will try asdf:load-source-op for each system")',
  '                              (progn (%ensure-dummy-asdf)',
  '                                     (%say-note "asdf is not part of this runtime -- parsing .asd files directly, loading components in asd order")))',
  '                          (list-all-packages)))',
  '           (syms-before (%snapshot-symbols)))',
  '      (when (or asds lisps)',
  '        (setf *default-pathname-defaults*',
  '              (make-pathname :directory (pathname-directory (pathname (or (car asds) (car lisps)))))))',
  '      (handler-bind ((warning (function %warn)))',
  '        (if asds',
  '            (dolist (asd asds) (%load-with-asd asd lisps asdf-real))',
  '            (%manual-load-ordered (%package-first lisps))))',
  '      (%emit-project-api pkgs-before syms-before)',
  '      (%emit-hint pkgs-before syms-before)',
  '      (finish-output))))',
  /* ---- package management ------------------------------------------------
   * (package-install "name") — copy the open project (/project, populated by
   *   load-project) into /modules/<name>/ and load it there. The name is the
   *   asdf system name from the project *.asd (or any name, for a plain
   *   init.lisp project with no .asd). Re-installing over an existing module
   *   refreshes its files.
   * (package-list) — table of installed modules (registry kept in memory and
   *   mirrored to /modules/registry.sexp).
   * (package-uninstall "name") — remove the module files + registry entry;
   *   already-loaded definitions honestly stay until the runtime restarts.
   * All three are also imported into CL-USER so they read unqualified. */
  '(defvar *cc-modules* nil)',
  '(defun %mod-name (x) (string-downcase (string x)))',
  '(defun %mod-project-files ()',
  '  (remove-duplicates',
  '    (remove-if (function null)',
  '      (append (ignore-errors (directory "/project/*.*"))',
  '              (ignore-errors (directory "/project/**/*.*"))))',
  '    :test (function equal)))',
  '(defun %mod-asd-system-names ()',
  '  ;; ((system-name . asd-path) ...) — defsystem forms read from each .asd',
  '  (let ((out nil))',
  '    (dolist (p (%mod-project-files))',
  '      (when (and (pathname-name p) (string-equal (or (pathname-type p) "") "asd"))',
  '        (with-open-file (in p :direction :input)',
  '          (loop for form = (ignore-errors (read in nil nil))',
  '                until (null form)',
  '                when (and (consp form) (consp (cdr form)) (symbolp (cadr form))',
  '                          (string= (symbol-name (car form)) "DEFSYSTEM"))',
  '                  do (push (cons (string-downcase (symbol-name (cadr form))) p) out)',
  '                     and do (loop-finish)))))',
  '    (nreverse out)))',
  '(defun %mod-asd-meta (asd-path)',
  '  ;; (version description) from the defsystem plist',
  '  (let ((v "0") (d ""))',
  '    (with-open-file (in asd-path :direction :input)',
  '      (loop for form = (ignore-errors (read in nil nil))',
  '            until (null form)',
  '            when (and (consp form) (consp (cdr form))',
  '                      (string= (symbol-name (car form)) "DEFSYSTEM"))',
  '              do (loop for (k val) on (cddr form) by (function cddr)',
  '                       when (eql k :version) do (setf v (string val))',
  '                       when (member k (quote (:description :long-description)))',
  '                         do (when (plusp (length (string val))) (setf d (string val))))',
  '                 and do (loop-finish)))',
  '    (list v d)))',
  '(defun %mod-copy-files (name)',
  '  ;; copy every lisp/asd file from /project into /modules/<name>/ (flat);',
  '  ;; returns the list of module file pathnames',
  '  (let ((dir (ensure-directories-exist (format nil "/modules/~A/" name)))',
  '        (copied nil))',
  '    (dolist (p (%mod-project-files))',
  '      (let ((type (or (pathname-type p) "")))',
  '        (when (and (pathname-name p)',
  '                   (member type (quote ("lisp" "lsp" "cl" "asd")) :test (function string-equal)))',
  '          (let ((dest (merge-pathnames',
  '                        (make-pathname :name (pathname-name p) :type type) dir)))',
  '            (with-open-file (i p :direction :input)',
  '              (with-open-file (o dest :direction :output',
  '                                :if-exists :supersede :if-does-not-exist :create)',
  '                (loop for line = (read-line i nil nil)',
  '                      while line do (write-line line o))))',
  '            (push dest copied)))))',
  '    (nreverse copied)))',
  '(defun %mod-save-registry ()',
  '  (ensure-directories-exist "/modules/")',
  '  (with-open-file (o "/modules/registry.sexp" :direction :output',
  '                    :if-exists :supersede :if-does-not-exist :create)',
  '    (prin1 *cc-modules* o)))',
  '(defun %restore-modules ()',
  '  ;; page-side persistence: /modules tree was rewritten from IndexedDB —',
  '  ;; reload the registry so package-list works and package-install can',
  '  ;; re-load module files without the original project.',
  '  (setf *cc-modules*',
  '        (ignore-errors',
  '          (with-open-file (i "/modules/registry.sexp" :direction :input)',
  '            (read i nil nil))))',
  '  (length *cc-modules*))',
  '(defun package-install (name)',
  '  (let* ((nm (%mod-name name))',
  '         (sysnames (%mod-asd-system-names))',
  '         (hit (or (assoc nm sysnames :test (function string=))',
  '                  (find-if (lambda (x) (string= nm (pathname-name (cdr x)))) sysnames)))',
  '         (existing (assoc nm *cc-modules* :test (function string=))))',
  '    (when (and (not hit) (not existing) sysnames)',
  '      (error "package ~S not found. Loaded project system names: ~{~A~^, ~}"',
  '             nm (mapcar (function car) sysnames)))',
  '    (when (and (not hit) (not existing) (null sysnames) (null (%mod-project-files)))',
  '      (error "no project is loaded — open a project and Load Project into Runtime first, or (package-list) to see installed modules"))',
  '    (let* ((meta (if hit (%mod-asd-meta (cdr hit)) (quote ("0" ""))))',
  '           (version (first meta))',
  '           (desc (second meta))',
  '           (files (or (%mod-copy-files nm)',
  '                      (mapcar (function parse-namestring) (third (cdr existing))))))',
  '      (format t "~&;; installing ~A ~A into /modules/~A/ — ~D file~:P~%"',
  '              nm version nm (length files))',
  '      (when files (load-project (mapcar (function namestring) files)))',
  '      (setf *cc-modules*',
  '            (acons nm (list version desc (mapcar (function namestring) files)',
  '                            (get-universal-time))',
  '                  (remove nm *cc-modules* :key (function car) :test (function string=))))',
  '      (%mod-save-registry)',
  '      (format t "~&;;MODULES-CHANGED~%")',
  '      (format t "~&;; package ~A ~A installed~@[ — ~A~]~%" nm version desc)',
  '      nm)))',
  '(defun package-list ()',
  '  (if (null *cc-modules*)',
  '      (format t "~&No packages installed. Load a project, then (package-install ~S).~%" "name")',
  '      (progn',
  '        (format t "~&Packages installed under /modules/:~%")',
  '        (dolist (m (sort (copy-list *cc-modules*) (function string<) :key (function car)))',
  '          (destructuring-bind (name version desc files ts) m',
  '            (declare (ignore ts))',
  '            (format t "  ~A ~@[~A~] — ~D file~:P — ~A~%"',
  '                    name (unless (string= version "0") version)',
  '                    (length files)',
  '                    (if (plusp (length desc)) desc "no description"))))))',
  '  (mapcar (function car) *cc-modules*))',
  '(defun package-load (name)',
  '  (let* ((nm (%mod-name name))',
  '         (entry (assoc nm *cc-modules* :test (function string=))))',
  '    (unless entry',
  '      (error "package ~S is not installed~@[ — installed: ~{~A~^, ~}~]"',
  '             nm (mapcar (function car) *cc-modules*)))',
  '    (let ((files (mapcar (function parse-namestring) (third (cdr entry)))))',
  '      (unless (and files (ignore-errors (probe-file (first files))))',
  '        (error "module files for ~S are missing from /modules — reinstall from the project" nm))',
  '      (format t "~&;; loading ~A from /modules/~A/ — ~D file~:P~%" nm nm (length files))',
  '      (load-project (mapcar (function namestring) files))',
  '      (format t "~&;; package ~A loaded~%" nm)',
  '      nm)))',
  '(defun package-uninstall (name)',
  '  (let* ((nm (%mod-name name))',
  '         (entry (assoc nm *cc-modules* :test (function string=))))',
  '    (unless entry',
  '      (error "package ~S is not installed~@[ — installed: ~{~A~^, ~}~]"',
  '             nm (mapcar (function car) *cc-modules*)))',
  '    (dolist (f (third (cdr entry))) (ignore-errors (delete-file f)))',
  '    (ignore-errors (ext::rmdir (format nil "/modules/~A" nm)))',
  '    (setf *cc-modules* (remove nm *cc-modules* :key (function car) :test (function string=)))',
  '    (%mod-save-registry)',
  '    (format t "~&;;MODULES-CHANGED~%")',
  '    (format t "~&;; package ~A uninstalled — files removed from /modules/~A/~%" nm nm)',
  '    (format t ";; note: definitions already loaded remain in the image until the runtime restarts~%")',
  '    t))',
  /* ---- standard input (Sprint 4) ----
   * The image's fd-0 stream has no reader in wasm. %stdin is a Gray
   * character input stream whose buffer holds one line; when it runs dry
   * it prints ;;READ-WAIT (stderr, so a with-output-to-string around the
   * read cannot swallow it) and suspends on js-wait until the page answers
   * {type:'input', id, text}. A lone #\Eot (code 4) means end of file. It
   * is installed as *standard-input* and as the input half of *terminal-io*
   * (so *query-io* / y-or-n-p work) at bootstrap. */
  '(defclass %stdin (gray:fundamental-character-input-stream)',
  '  ((buf :initform "" :accessor %sbuf)',
  '   (pos :initform 0 :accessor %spos)',
  '   (eof :initform nil :accessor %seof)))',
  /* Emscripten's TTY holds a partial stdout line (a prompt like "Name? ")
   * until a newline arrives; %flush-out asks the worker to push it through
   * Module.print NOW, so the prompt reaches the cell before the wait marker. */
  '(defun %flush-out ()',
  '  (finish-output)',
  '  (handler-case (eu.turtleware.wecl/implementation::js-eval "__ccFlush()")',
  '    (serious-condition () nil))',
  '  nil)',
  '(defun %stdin-reset ()',
  '  ;; each job starts with a fresh stdin: no leftover line, no sticky EOF',
  '  (let ((s *standard-input*))',
  '    (when (typep s (quote %stdin))',
  '      (setf (%sbuf s) "" (%spos s) 0 (%seof s) nil))))',
  '(defun %stdin-fill (s)',
  '  (unless (%seof s)',
  '    (%flush-out)',
  '    (format *error-output* "~&;;READ-WAIT~%")',
  '    (finish-output *error-output*)',
  '    (let ((line (handler-case',
  '                    (eu.turtleware.wecl/implementation::js-wait "__ccReadWait()")',
  '                  (serious-condition () (string (code-char 4))))))',
  '      (if (and (= (length line) 1) (char= (char line 0) (code-char 4)))',
  '          (setf (%seof s) t (%sbuf s) "" (%spos s) 0)',
  '          (setf (%sbuf s) (concatenate (quote string) line (string #\\Newline))',
  '                (%spos s) 0)))))',
  '(defmethod gray:stream-read-char ((s %stdin))',
  '  (when (>= (%spos s) (length (%sbuf s))) (%stdin-fill s))',
  '  (if (>= (%spos s) (length (%sbuf s)))',
  '      :eof',
  '      (prog1 (char (%sbuf s) (%spos s)) (incf (%spos s)))))',
  '(defmethod gray:stream-unread-char ((s %stdin) c)',
  '  (declare (ignore c))',
  '  (when (> (%spos s) 0) (decf (%spos s)))',
  '  nil)',
  '(defmethod gray:stream-peek-char ((s %stdin))',
  '  (when (>= (%spos s) (length (%sbuf s))) (%stdin-fill s))',
  '  (if (>= (%spos s) (length (%sbuf s))) :eof (char (%sbuf s) (%spos s))))',
  '(defmethod gray:stream-listen ((s %stdin))',
  '  (< (%spos s) (length (%sbuf s))))',
  '(defmethod gray:stream-clear-input ((s %stdin))',
  '  (setf (%sbuf s) "" (%spos s) 0)',
  '  nil)',
  '(defun %install-stdin ()',
  '  (handler-case',
  '      (let ((in (make-instance (quote %stdin))))',
  '        (setf *standard-input* in)',
  '        (setf *terminal-io* (make-two-way-stream in *standard-output*))',
  '        t)',
  '    (serious-condition () nil)))',
  '(%install-stdin)',
  /* make the four symbols read unqualified from CL-USER sessions */
  '(import (list (find-symbol (string :package-install) (find-package :cc))',
  '              (find-symbol (string :package-list) (find-package :cc))',
  '              (find-symbol (string :package-uninstall) (find-package :cc))',
  '              (find-symbol (string :package-load) (find-package :cc)))',
  '        (find-package :cl-user))',
].join('\n');

function escapeLispString(src) {
  return String(src).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/* A condition that escapes the helper library at the top level of
 * wecl_eval (a bug in cc itself, not in user code — user errors are handled
 * inside eval-string / load-project) would enter the ECL debugger, which
 * waits for terminal input for ever: a silent worker hang. Every top-level
 * call is therefore wrapped so such a bug is reported as ;;ERROR: instead. */
function guardTopLevel(form) {
  return '(handler-case ' + form +
    ' (serious-condition (e)' +
    '   (handler-case (format *error-output* "~&;;ERROR: internal: ~A~%" e)' +
    '     (serious-condition () (format *error-output* "~&;;ERROR: internal: ~A signalled~%" (type-of e))))))';
}

/* wecl_eval reads ONE form — deliver the helper via a single bootstrap form.
 * Every read AND eval is handler-case'd: an unhandled condition at the top
 * level of wecl_eval enters the ECL debugger, which waits for input forever
 * (a silent worker hang). A reader error stops the loop (the stream position
 * is unreliable afterwards) but keeps every form defined so far — the core
 * cc:eval-string helper comes first, so plain eval survives a loader bug. */
var CC_BOOTSTRAP =
  '(let ((*package* (find-package :cl-user)))' +
  '  (with-input-from-string (in "' + escapeLispString(CC_HELPER_SRC) + '")' +
  '    (loop for f = (handler-case (read in nil :eof)' +
  '                    (serious-condition (e)' +
  '                      (handler-case' +
  '                          (format *error-output* "~&;;BOOT-ERROR: reader: ~A~%" e)' +
  '                        (serious-condition ()' +
  '                          (format *error-output* "~&;;BOOT-ERROR: reader: ~A signalled~%" (type-of e))))' +
  '                      :cc-boot-stop))' +
  '          until (or (eq f :eof) (eq f :cc-boot-stop))' +
  '          do (handler-case (eval f)' +
  '               (serious-condition (e)' +
  '                 (handler-case' +
  '                     (format *error-output* "~&;;BOOT-ERROR: eval: ~A~%" e)' +
  '                   (serious-condition ()' +
  '                     (format *error-output* "~&;;BOOT-ERROR: eval: ~A signalled~%" (type-of e)))))))))';

var queue = Promise.resolve();

/* ---- debugger pause (Sprint 3) ----
 * The Lisp handler calls js-wait("__ccDebugWait()"): the glue evals that
 * expression on this global scope, awaits the promise and hands `.text()`
 * back to Lisp. The promise is resolved by a {type:'restart'} message for
 * the paused job. Only one pause can be pending (evals are serialized). */
var pendingDebug = null; /* { id, resolve(text) } */
self.__ccDebugWait = function () {
  return new Promise(function (resolve) {
    pendingDebug = {
      id: currentJobId,
      resolve: function (s) { resolve({ text: function () { return String(s); } }); },
    };
  });
};
function answerDebug(id, index, value) {
  if (!pendingDebug || pendingDebug.id !== id) return false;
  var p = pendingDebug;
  pendingDebug = null;
  p.resolve(value != null && value !== '' ? String(index) + ' ' + String(value) : String(index));
  return true;
}

/* Push any partial stdout/stderr line the Emscripten TTY is holding through
 * Module.print/printErr right now (prompts have no trailing newline).
 * Called synchronously from Lisp via js-eval before a wait marker. */
self.__ccFlush = function () {
  try {
    if (typeof TTY !== 'undefined' && TTY && TTY.ttys) {
      TTY.ttys.forEach(function (tty) {
        if (tty && tty.output && tty.output.length > 0 && tty.ops && tty.ops.fsync) tty.ops.fsync(tty);
      });
    }
  } catch (e) { /* best effort */ }
  return '';
};

/* ---- stdin (Sprint 4): same mechanism, one pending read per job ---- */
var pendingRead = null; /* { id, resolve(text) } */
self.__ccReadWait = function () {
  return new Promise(function (resolve) {
    pendingRead = {
      id: currentJobId,
      resolve: function (s) { resolve({ text: function () { return String(s); } }); },
    };
  });
};
/* text null/undefined = end of file (a lone EOT char, which no line can be) */
function answerInput(id, text) {
  if (!pendingRead || pendingRead.id !== id) return false;
  var p = pendingRead;
  pendingRead = null;
  p.resolve(text == null ? '' : String(text).replace(/\r?\n$/, ''));
  return true;
}

function runEval(id, code, opts) {
  opts = opts || {};
  queue = queue.then(function () {
    currentJobId = id;
    return Promise.resolve()
      .then(function () {
        return wecl_eval(guardTopLevel('(cc:eval-string "' + escapeLispString(code) + '"' +
          (opts.compile ? ' :compile t' : '') + (opts.debug ? ' :debug t' : '') +
          (opts.path ? ' :path "' + escapeLispString(String(opts.path)) + '"' : '') + ')'));
      })
      .then(function () {
        self.postMessage({ type: 'done', id: id });
      })
      .catch(function (e) {
        self.postMessage({ type: 'joberror', id: id, message: String(e && e.message || e) });
      })
      .then(function () {
        currentJobId = 0;
      });
  });
}

/* ---- project loading ---- */

/* Emscripten FS. IMPORTANT: do NOT read Module.FS — this build does not
 * export it, and the glue installs a getter on Module that calls abort()
 * (→ Module.onAbort → 'crash') on access. wecl.js declares a top-level
 * `var FS = …`, which importScripts leaves on the worker global scope. */
function getFS() {
  try { if (typeof FS !== 'undefined' && FS) return FS; } catch (e) {}
  return null;
}

function rmrf(fs, path) {
  var entries;
  try { entries = fs.readdir(path); } catch (e) { return; }
  entries.forEach(function (name) {
    if (name === '.' || name === '..') return;
    var p = path + '/' + name;
    var isDir = false;
    try {
      var st = fs.stat(p);
      isDir = fs.isDir ? fs.isDir(st.mode) : ((st.mode & 0xF000) === 0x4000);
    } catch (e) { return; }
    if (isDir) { rmrf(fs, p); try { fs.rmdir(p); } catch (e2) {} }
    else { try { fs.unlink(p); } catch (e3) {} }
  });
}

/* Write the project under /project/ (stale tree removed first). */
function writeProjectFiles(files) {
  var fs = getFS();
  if (!fs || !fs.mkdirTree || !fs.writeFile) return false;
  try {
    try { fs.mkdir('/project'); } catch (e0) {}
    try { fs.mkdirTree('/tmp'); } catch (e1) {} /* libraries that scribble temp files (cl-plot) */
    rmrf(fs, '/project');
    files.forEach(function (f) {
      var rel = String(f.path).replace(/^\/+/, '');
      var full = '/project/' + rel;
      var dir = full.slice(0, full.lastIndexOf('/'));
      if (dir) fs.mkdirTree(dir);
      fs.writeFile(full, String(f.content));
    });
    return true;
  } catch (e) {
    return false;
  }
}

function pathListLiteral(files) {
  return '(' + files.map(function (f) {
    return '"/project/' + escapeLispString(String(f.path).replace(/^\/+/, '')) + '"';
  }).join(' ') + ')';
}

function runLoadProject(id, files, debug) {
  queue = queue.then(function () {
    currentJobId = id;
    return Promise.resolve()
      .then(function () {
        if (writeProjectFiles(files)) {
          return wecl_eval(guardTopLevel('(cc:load-project (quote ' + pathListLiteral(files) + ')' + (debug ? ' :debug t' : '') + ')'));
        }
        /* no Emscripten FS — fall back to evaluating file contents in order */
        self.postMessage({
          type: 'load-note', id: id,
          note: 'Emscripten FS unavailable — evaluating files from memory (asdf path skipped)',
        });
        var sorted = files.slice().sort(function (a, b) {
          var pa = /(^|\/)packages?\.[^.]+$/i.test(a.path) ? 0 : 1;
          var pb = /(^|\/)packages?\.[^.]+$/i.test(b.path) ? 0 : 1;
          return pa - pb || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
        });
        var seq = Promise.resolve();
        sorted.forEach(function (f) {
          if (!/\.(lisp|lsp|cl)$/i.test(f.path)) return;
          seq = seq.then(function () {
            self.postMessage({ type: 'load-progress', id: id, path: f.path, status: 'loading', message: '' });
            return wecl_eval('(cc:eval-string "' + escapeLispString(String(f.content)) + '")').then(function () {
              self.postMessage({ type: 'load-progress', id: id, path: f.path, status: 'ok', message: 'evaluated in memory' });
            }, function (e) {
              self.postMessage({ type: 'load-progress', id: id, path: f.path, status: 'error', message: String(e && e.message || e) });
            });
          });
        });
        return seq;
      })
      .then(function () {
        self.postMessage({ type: 'done', id: id });
      })
      .catch(function (e) {
        self.postMessage({ type: 'joberror', id: id, message: String(e && e.message || e) });
      })
      .then(function () {
        currentJobId = 0;
      });
  });
}

/* ---- module persistence (snapshot/restore of /modules for IndexedDB) ---- */

/* Collect /modules as a flat {path, content} list (text files only — the
 * registry + lisp sources are all this tree ever holds). */
function collectModules(fs) {
  var out = []
  var decoder = new TextDecoder()
  var walk = function (dir, prefix) {
    var entries
    try { entries = fs.readdir(dir) } catch (e) { return }
    entries.forEach(function (name) {
      if (name === '.' || name === '..') return
      var p = dir + '/' + name
      var st
      try { st = fs.stat(p) } catch (e) { return }
      var isDir = fs.isDir ? fs.isDir(st.mode) : ((st.mode & 0xF000) === 0x4000)
      if (isDir) walk(p, prefix + name + '/')
      else {
        try {
          var bytes = fs.readFile(p)
          out.push({ path: prefix + name, content: bytes ? decoder.decode(bytes) : '' })
        } catch (e) { /* unreadable entry — skip */ }
      }
    })
  }
  try { fs.mkdir('/modules') } catch (e) {}
  walk('/modules', '')
  return out
}

/* modules-snapshot: reply with the tree; modules-restore: rewrite the tree
 * from the page's IndexedDB copy, then reload the CL-side registry. Both
 * round-trip as modules-data (snapshot) + done. */
function runModulesOp(id, msg) {
  queue = queue.then(function () {
    currentJobId = id
    return Promise.resolve()
      .then(function () {
        var fs = getFS()
        if (!fs || !fs.mkdirTree || !fs.writeFile) return
        if (msg.type === 'modules-snapshot') {
          self.postMessage({ type: 'modules-data', id: id, files: collectModules(fs) })
        } else if (msg.type === 'modules-restore') {
          var files = msg.files || []
          files.forEach(function (f) {
            var full = '/modules/' + String(f.path).replace(/^\/+/, '')
            var dir = full.slice(0, full.lastIndexOf('/'))
            try { fs.mkdirTree(dir) } catch (e) {}
            fs.writeFile(full, String(f.content))
          })
          if (files.length > 0) return wecl_eval('(cc::%restore-modules)')
        }
      })
      .then(function () { self.postMessage({ type: 'done', id: id }) })
      .catch(function (e) {
        self.postMessage({ type: 'joberror', id: id, message: String(e && e.message || e) })
      })
      .then(function () { currentJobId = 0 })
  })
}

self.onmessage = function (ev) {
  var m = ev.data || {};
  if (m.type === 'eval') runEval(m.id, m.code, { compile: !!m.compile, debug: !!m.debug, path: m.path || '' });
  else if (m.type === 'restart') answerDebug(m.id, m.index, m.value);
  else if (m.type === 'input') answerInput(m.id, m.text);
  else if (m.type === 'load-project') runLoadProject(m.id, m.files || [], !!m.debug);
  else if (m.type === 'modules-snapshot' || m.type === 'modules-restore') runModulesOp(m.id, m);
};

/* ---- fast setjmp trampolines (Sprint 7) ----------------------------------
 * The WECL build uses Emscripten's JavaScript setjmp/longjmp support: every
 * call made from a C function that contains a setjmp (ECL's frame stack —
 * i.e. the whole bytecodes interpreter) leaves wasm through an `invoke_*`
 * import. Measured: ~10 such calls per empty loop iteration, ~3.5 µs each,
 * which is 97 % of the interpreter's run time — the stock trampolines call
 * `stackSave` and `dynCall_*` through the glue's assertion + Asyncify
 * export wrappers. These replacements do the same three things (save the
 * stack pointer, call the table entry, on a longjmp restore + setThrew)
 * with the RAW exports and a cached table mirror: 20 000 loop iterations
 * drop from ~1450 ms to ~45 ms in the Node harness. Semantics are
 * unchanged, so Asyncify unwinding (debugger pauses, stdin) and longjmp
 * (handler-case) behave exactly as before — the harness suite proves it.
 * Installed by shadowing the worker's global WebAssembly with a thin
 * object that patches the import table at instantiation; if anything
 * looks unexpected the original trampolines are used. */
(function installFastInvoke() {
  var Orig = self.WebAssembly;
  if (!Orig || typeof Orig.instantiate !== 'function') return;
  var exportsRef = null;
  var table = null;
  var mirror = [];
  function entry(i) {
    var f = mirror[i];
    if (f === undefined) { f = table.get(i); mirror[i] = f; }
    return f;
  }
  function makeFast(orig, returnsValue) {
    return function (index) {
      if (exportsRef === null) return orig.apply(this, arguments);
      var ex = exportsRef;
      var sp = ex.emscripten_stack_get_current();
      var n = arguments.length;
      try {
        var f = entry(index);
        switch (n) {
          case 1: return f();
          case 2: return f(arguments[1]);
          case 3: return f(arguments[1], arguments[2]);
          case 4: return f(arguments[1], arguments[2], arguments[3]);
          case 5: return f(arguments[1], arguments[2], arguments[3], arguments[4]);
          default: return f.apply(null, Array.prototype.slice.call(arguments, 1));
        }
      } catch (e) {
        ex._emscripten_stack_restore(sp);
        if (e !== e + 0) throw e; /* a real JS exception, not a longjmp */
        ex.setThrew(1, 0);
        return returnsValue ? 0 : undefined;
      }
    };
  }
  function patch(imports) {
    try {
      var env = imports && imports.env;
      if (!env) return imports;
      Object.keys(env).forEach(function (k) {
        var m = /^invoke_([vi]+)$/.exec(k);
        if (m && typeof env[k] === 'function') env[k] = makeFast(env[k], m[1][0] !== 'v');
      });
    } catch (e) { /* leave the stock trampolines in place */ }
    return imports;
  }
  function remember(result) {
    var inst = result && result.instance ? result.instance : result;
    var ex = inst && inst.exports;
    if (ex && ex.__indirect_function_table &&
        typeof ex.emscripten_stack_get_current === 'function' &&
        typeof ex._emscripten_stack_restore === 'function' &&
        typeof ex.setThrew === 'function') {
      table = ex.__indirect_function_table;
      mirror = [];
      exportsRef = ex;
      bootLine('fast setjmp trampolines installed');
    } else {
      bootLine('fast setjmp trampolines NOT installed (exports missing) — stock speed');
    }
    return result;
  }
  /* everything else (Module, Memory, Table, validate, …) is inherited from
   * the real namespace through the prototype — nothing is copied, because
   * some of its properties (JSTag) are read-only and assignment would throw */
  var WA = Object.create(Orig);
  WA.instantiate = function (src, imports) { return Orig.instantiate(src, patch(imports)).then(remember); };
  WA.instantiateStreaming = function (src, imports) { return Orig.instantiateStreaming(src, patch(imports)).then(remember); };
  self.WebAssembly = WA;
})();

/* ---- download progress (Sprint 27) ----
 * The Emscripten glue fetches wecl.wasm itself; wrapping fetch for .wasm
 * URLs hands it a Response whose body is counted on the way through, so
 * the page can show "wecl.wasm 4.2 / 9.0 MB". Harness sandboxes without
 * web streams get the original response. */
(function () {
  if (typeof self.fetch !== 'function') return;
  var origFetch = self.fetch;
  self.fetch = function (input, init) {
    var url = String(input && input.url ? input.url : input);
    var p = origFetch.apply(self, arguments);
    if (!/\.wasm(\?|$)/.test(url)) return p;
    return p.then(function (r) { return progressResponse(r, url.split('/').pop()); });
  };
})();

function progressResponse(r, file) {
  if (!r || !r.ok || !r.body || typeof ReadableStream !== 'function' || typeof Response !== 'function') return r;
  var total = Number(r.headers && r.headers.get && r.headers.get('content-length')) || null;
  var loaded = 0, last = 0;
  var reader = r.body.getReader();
  var stream = new ReadableStream({
    pull: function (controller) {
      return reader.read().then(function (res) {
        if (res.done) {
          controller.close();
          self.postMessage({ type: 'progress', file: file, loaded: loaded, total: total || loaded });
          return;
        }
        loaded += res.value.byteLength;
        var now = Date.now();
        if (now - last > 80) { last = now; self.postMessage({ type: 'progress', file: file, loaded: loaded, total: total }); }
        controller.enqueue(res.value);
      });
    },
    cancel: function () { return reader.cancel(); },
  });
  return new Response(stream, { status: r.status, statusText: r.statusText, headers: r.headers });
}

/* ---- boot sequence ---- */

try {
  bootLine('loading /wecl/boot.js');
  importScripts('/wecl/boot.js');

  /* stdout/stderr capture — MUST be installed after boot.js, before wecl.js */
  Module.print = function (t) {
    if (verifyLines) verifyLines.push(String(t));
    self.postMessage({ type: 'stdout', id: currentJobId, text: String(t) });
  };
  Module.printErr = function (t) {
    if (verifyLines) verifyLines.push(String(t));
    self.postMessage({ type: 'stderr', id: currentJobId, text: String(t) });
  };
  /* wecl.js resolves wecl.wasm relative to *this* worker script otherwise */
  Module.locateFile = function (path) { return '/wecl/' + path; };
  Module.onAbort = function (msg) {
    self.postMessage({ type: 'crash', message: String(msg) });
  };

  /* The ECL image scans the DOM for CL <script> tags during boot; a bare
   * worker has no document and the boot would die on a ReferenceError. */
  if (typeof self.document === 'undefined') {
    self.document = {
      body: { getElementsByTagName: function () { return []; }, appendChild: function () {} },
      getElementsByTagName: function () { return []; },
      querySelectorAll: function () { return []; },
      createElement: function () {
        return { style: {}, setAttribute: function () {}, appendChild: function () {} };
      },
      currentScript: null,
    };
  }

  /* onRuntimeInitialized fires inside wecl.js after instantiation; boot.js
   * runs wecl_init_hooks there. wecl_boot is itself Asyncify-async, so the
   * first eval attempts may race it — retry until the image answers. */
  wecl_init_hooks.push(function () {
    try {
    var attempts = 0;
    function fail(msg) {
      self.postMessage({ type: 'bootfail', message: String(msg) });
    }
    /* probe: retry while the image is not answering yet (wecl_boot is
     * Asyncify-async, so the first evals can race it) */
    function probe() {
      attempts++;
      var p;
      try {
        p = wecl_eval('(values)');
      } catch (e) {
        p = Promise.reject(e);
      }
      Promise.resolve(p).then(bootstrap, function () {
        if (attempts < 60) {
          setTimeout(probe, 500);
        } else {
          fail('ECL image did not respond within 30s');
        }
      });
    }
    /* bootstrap: run ONCE. A failure here is deterministic (bad helper
     * source, debugger entry, wasm fault) — retrying would just spin, so
     * report bootfail immediately and let the client fall back. Boot must
     * NEVER block on a compile step: there is none in this path. */
    function bootstrap() {
      bootLine('ECL image booted — ANSI Common Lisp (wasm32)');
      /* capture stdout AND stderr through bootstrap + verification so any
       * ;;BOOT-ERROR lines reach the bootfail message */
      verifyLines = [];
      var bootEval;
      try {
        bootEval = wecl_eval(CC_BOOTSTRAP);
      } catch (e) {
        bootEval = Promise.reject(e);
      }
      Promise.resolve(bootEval).then(function () {
        /* verify the helper actually works before declaring ready. The form
         * below is deliberately READ-SAFE (no package-qualified symbols):
         * reading (cc:eval-string …) would throw if bootstrap failed to
         * define/export it, and a top-level reader error hangs the worker
         * in the debugger. */
        var verifyForm =
          '(let ((s (and (find-package :cc) (find-symbol "EVAL-STRING" (find-package :cc)))))' +
          '  (if (and s (fboundp s))' +
          '      (handler-case (funcall s "(+ 1 2)")' +
          '        (serious-condition (e)' +
          '          (handler-case' +
          '              (format *error-output* "~&;;BOOT-ERROR: verify: ~A~%" e)' +
          '            (serious-condition ()' +
          '              (format *error-output* "~&;;BOOT-ERROR: verify: ~A signalled~%" (type-of e))))))' +
          '      (format *error-output* "~&;;BOOT-ERROR: cc:eval-string was not defined~%")))';
        return wecl_eval(verifyForm).then(function () {
          var captured = verifyLines.slice();
          var ok = captured.some(function (l) { return l.indexOf(';;=> 3') !== -1; });
          verifyLines = null;
          if (!ok) {
            throw new Error('helper verification failed' +
              (captured.length ? ' — bootstrap said: ' + captured.slice(-6).join(' | ') : ''));
          }
          bootLine('warm-up eval (+ 1 2) ;;=> 3');
          bootLine('ready — happy hacking');
          self.postMessage({ type: 'ready' });
        });
      }).catch(function (e) {
        verifyLines = null;
        fail('bootstrap failed: ' + String(e && e.message || e));
      });
    }
    probe();
    } catch (e) {
      /* a synchronous fault here would otherwise vanish into emscripten's
       * onRuntimeInitialized and look like an infinite boot */
      self.postMessage({ type: 'bootfail', message: String(e && e.message || e) });
    }
  });

  bootLine('loading /wecl/wecl.js (emscripten glue)');
  importScripts('/wecl/wecl.js');
  bootLine('fetching wecl.wasm (9.0 MB)');
} catch (e) {
  self.postMessage({ type: 'bootfail', message: String(e && e.message || e) });
}
