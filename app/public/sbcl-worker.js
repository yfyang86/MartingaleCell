/* ConsCell — SBCL (wasm32-wasip1) Web Worker.
 *
 * Hand-written, NOT bundled. Runs the SBCL WebAssembly port
 * (github.com/yfyang86/sbcl, branch wasm-dev — see SBCL-Handoff.md) as a
 * browser host: a WASI preview1 shim over an in-memory file system, the
 * port's four `sbcl_host` imports, and the runtime module
 * `/sbcl/sbcl.wasm` driven through `_start` with a persistent REPL on
 * the WASI stdin we control.
 *
 * Artifacts (gitignored; copied in by scripts/fetch-sbcl.mjs):
 *   /sbcl/sbcl.wasm        the C runtime   (~1.4 MB)
 *   /sbcl/sbcl.core        the heap image  (~77 MB)
 *   /sbcl/sbcl-core.wasm   the Lisp module (~34 MB), must sit next to the core
 *
 * Threading model (why everything below is the way it is):
 *   after boot the worker thread is INSIDE wasm forever — `_start()` runs
 *   the SBCL REPL, which sits in our WASI `fd_read` when idle. JavaScript
 *   only regains control inside the imports (fd_read, fd_write,
 *   clock_time_get, poll_oneoff, …), so the main thread cannot message
 *   us: it writes requests into a SharedArrayBuffer and Atomics.notify's,
 *   and the imports pick them up. Output flows back as ordinary
 *   postMessage (WorkerOutMessage, the same protocol as wecl-worker.js).
 *
 * SAB layout (one buffer, Int32 header + byte regions):
 *   [0]  form ring write cursor  [1] form ring read cursor
 *   [2]  stdin ring write cursor [3] stdin ring read cursor
 *   [4]  mailbox flag (1 = one JSON request waits at byte [8192..])
 *   [5]  interrupt request (main sets 1; clock_time_get turns it into the
 *        interrupt-pending word's bit 1, i.e. Ctrl-C)
 *   byte 8192..8192+8MB  mailbox JSON bytes, NUL-terminated
 *   FORM_OFF..            form ring (Lisp forms, NUL-terminated)
 *   STDIN_OFF..           stdin ring (lines for /dev/cc-stdin, ^D = EOF)
 *
 * Requests (mailbox JSON — the same shape as wecl-worker's inbound
 * messages, minus modules ops which touch only the in-memory FS here):
 *   {type:'eval', id, code, compile?, debug?, path?}
 *   {type:'load-project', id, files:[{path,content}], debug?}
 *   {type:'input', id, text}            a line for /dev/cc-stdin (null → EOF)
 *   {type:'restart', id, index, value?} an answer for a debug pause
 *   {type:'modules-snapshot'|'modules-restore', id, files?}
 *   {type:'quit'}                       (sb-ext:exit); the image shuts down
 *
 * A job ends when its wrapper form prints ;;CC-DONE on stdout. Boot posts
 * one extra message, {type:'sbcl-sab', sab}, before _start so the page
 * can submit requests; ready follows a verified helper bootstrap.
 *
 * Lisp side (SBCL_HELPER_SRC below): a port of the wecl worker's cc
 * helper — eval-string with the ;;=> / ;;ERROR: / ;;ERRTYPE: / ;;WARNING:
 * / ;;PACKAGE: marker protocol, per-form project loading with
 * ;;FILE:/;;PKG:/;;SYM:/;;DEF:/;;NOTE:/;;HINT:, module management under
 * /modules, and an interactive-debugger pause. Blocking waits (the
 * debugger choice, standard input) read the magic file /dev/cc-stdin:
 * opening it yields a WASI fd whose fd_read blocks the image on the
 * stdin ring — the moral equivalent of the wecl build's js-wait.
 */

/* eslint-disable */
'use strict';

var currentJobId = 0 /* output attribution: the job being fed (serialized) */
var phase = 'loading' /* loading -> helper -> verify -> run | failed */
var verifyLines = []

function bootLine(line) {
  self.postMessage({ type: 'boot', line: String(line) })
}
function failBoot(msg) {
  phase = 'failed'
  if (verifyLines.length > 0) msg += ' — last output: ' + verifyLines.slice(-10).join(' | ')
  self.postMessage({ type: 'bootfail', message: String(msg) })
}

/* ------------------------------------------------------------------ */
/* SharedArrayBuffer plumbing (produced by the page, consumed here)    */
/* ------------------------------------------------------------------ */

var FORM_RING_BYTES = 1 << 20 /* 1 MB of Lisp forms in flight */
var STDIN_RING_BYTES = 1 << 16 /* 64 KB of pending stdin lines */
var MAILBOX_MAX = 8 << 20 /* one JSON request (a project's files) */
var MAILBOX_OFF = 8192 /* byte offset of the mailbox region */
var FORM_OFF = MAILBOX_OFF + MAILBOX_MAX
var STDIN_OFF = FORM_OFF + FORM_RING_BYTES
var SAB_BYTES = STDIN_OFF + STDIN_RING_BYTES

/* The page must be crossOriginIsolated for SharedArrayBuffer (COOP:
 * same-origin + COEP: credentialless — vite dev/preview send them; a
 * static host must too). Without it the engine cannot run and says so
 * clearly instead of dying on a bare ReferenceError. */
var sab = null
try {
  sab = new SharedArrayBuffer(SAB_BYTES)
} catch (e) {
  self.postMessage({
    type: 'bootfail',
    message: 'SharedArrayBuffer unavailable (page not crossOriginIsolated) — ' +
      'serve with Cross-Origin-Opener-Policy: same-origin and ' +
      'Cross-Origin-Embedder-Policy: credentialless headers to boot SBCL',
  })
  throw e
}
var sabI32 = new Int32Array(sab)
var sabU8 = new Uint8Array(sab)
var encoder = new TextEncoder()

/* NUL-terminated records in a ring; cursors are monotonic mod size, the
 * producer keeps one byte free so read==write means empty. */
function ringWrite(base, size, writeI, readI, bytes) {
  var used = writeI - readI
  if (used < 0) used += size
  var need = bytes.length + 1
  if (used + need > size - 1) return false
  for (var i = 0; i < bytes.length; i++) sabU8[base + ((writeI + i) % size)] = bytes[i]
  sabU8[base + ((writeI + bytes.length) % size)] = 0
  return (writeI + need) % size
}
function ringTake(base, size, writeI, readI) {
  var used = writeI - readI
  if (used < 0) used += size
  if (used === 0) return null
  var out = []
  var p = readI
  for (;;) {
    var b = sabU8[base + p]
    if (b === 0) break
    out.push(b)
    p = (p + 1) % size
  }
  return { bytes: new Uint8Array(out), newRead: (p + 1) % size }
}

/* --- mailbox: the page produces one JSON request, we consume it ------ */
function mailboxTake() {
  if (Atomics.load(sabI32, 4) !== 1) return null
  var end = MAILBOX_OFF
  var cap = MAILBOX_OFF + MAILBOX_MAX
  while (end < cap && sabU8[end] !== 0) end++
  /* copy out of the SAB: TextDecoder (and friends) reject shared views
   * in browsers — this is the one place we decode page-written bytes */
  var json = new TextDecoder('utf-8').decode(new Uint8Array(sabU8.subarray(MAILBOX_OFF, end)))
  Atomics.store(sabI32, 4, 0)
  Atomics.notify(sabI32, 4)
  try {
    return JSON.parse(json)
  } catch (e) {
    bootLine('mailbox request was not JSON: ' + String(e && e.message || e))
    return null
  }
}
/* a request that cannot be served right now (an eval arriving while user
 * code waits on stdin): stash it; serveForm picks it up before blocking */
var pendingRequest = null
function mailboxStash(req) {
  pendingRequest = req
}

/* ------------------------------------------------------------------ */
/* In-memory file system                                                */
/* ------------------------------------------------------------------ */

var vfs = {
  files: new Map(), /* path -> Uint8Array | string */
  dirs: new Set(['/', '/project', '/modules', '/tmp', '/dev', '/sbcl']),
}

function normPath(p) {
  var abs = p.startsWith('/') ? p : '/' + p
  var parts = abs.split('/')
  var out = []
  for (var i = 0; i < parts.length; i++) {
    var s = parts[i]
    if (!s || s === '.') continue
    if (s === '..') { out.pop(); continue }
    out.push(s)
  }
  return '/' + out.join('/')
}
function parentDir(p) {
  var i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}
function vfsLookup(path) {
  var p = normPath(path)
  if (p === '/dev/cc-stdin') return { kind: 'cc-stdin' }
  if (vfs.files.has(p)) return { kind: 'file', data: vfs.files.get(p) }
  if (vfs.dirs.has(p)) return { kind: 'dir' }
  return null
}
function fileBytes(data) {
  return typeof data === 'string' ? encoder.encode(data) : data
}
function vfsWriteFile(path, content) {
  var p = normPath(path)
  if (p === '/' || p === '/dev/cc-stdin') return false
  var parent = parentDir(p)
  if (!vfs.dirs.has(parent)) {
    var segs = parent.split('/').filter(Boolean)
    var acc = ''
    for (var i = 0; i < segs.length; i++) {
      acc += '/' + segs[i]
      vfs.dirs.add(acc)
    }
  }
  vfs.files.set(p, content)
  return true
}
function vfsRmrf(path) {
  var p = normPath(path)
  if (p === '/' || p === '/dev/cc-stdin' || p === '/sbcl') return
  vfs.files.delete(p)
  var prefix = p + '/'
  Array.from(vfs.files.keys()).forEach(function (k) { if (k.startsWith(prefix)) vfs.files.delete(k) })
  Array.from(vfs.dirs).forEach(function (d) { if (d !== '/' && d.startsWith(prefix)) vfs.dirs.delete(d) })
  vfs.dirs.delete(p)
}

/* ------------------------------------------------------------------ */
/* The Lisp helper (SBCL flavor) — ported from wecl-worker's CC_HELPER  */
/* ------------------------------------------------------------------ */

var SBCL_HELPER_SRC = [
  '(defpackage :cc (:use :cl) (:export :eval-string :load-project :package-install :package-list :package-uninstall :package-load))',
  '(in-package :cc)',
  '(defvar *eval-package* (find-package :cl-user))',
  '(defvar *load-context* nil)',
  '(defun %report (e)',
  '  (let ((s (ignore-errors (princ-to-string e))))',
  '    (cond ((and s (> (length s) 1) (char= (char s 0) #\\#))',
  '           (format nil "~A signalled" (type-of e)))',
  '          (s s)',
  '          (t (format nil "~A signalled" (type-of e))))))',
  '(defun %oneline (s)',
  '  (substitute #\\Space #\\Newline (substitute #\\/ #\\| (princ-to-string s))))',
  '(defun %say-warning (msg)',
  '  (if *load-context*',
  '      (format *error-output* "~&;;WARNING: ~A|~D|~A~%"',
  '              (substitute #\\/ #\\| (princ-to-string (car *load-context*)))',
  '              (or (cdr *load-context*) 0)',
  '              (%oneline msg))',
  '      (format *error-output* "~&;;WARNING: ~A~%" msg)))',
  '(defun %warn (w)',
  '  (%say-warning (%report w))',
  '  (let ((r (find-restart (quote muffle-warning) w)))',
  '    (when r (invoke-restart r))))',
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
  '          (format *error-output* "~&;;DETAIL: ~A|~A~%" (car d) (cdr d))))',
  '    (serious-condition () nil)))',
  '(defvar *eval-compile* nil)',
  '(defun %run (form)',
  '  (if *eval-compile*',
  '      (funcall (compile nil (list (quote lambda) (quote ()) form)))',
  '      (eval form)))',
  /* blocking reads: /dev/cc-stdin blocks in the host until the page
   * answers (;;READ-WAIT below is the page's cue). A lone ^D (code 4)
   * as the whole answer means end of file. */
  '(defun %wait-line ()',
  '  (with-open-file (s "/dev/cc-stdin" :direction :input)',
  '    (let ((line (read-line s nil nil)))',
  '      (if (and line (= (length line) 1) (char= (char line 0) (code-char 4)))',
  '          nil',
  '          line))))',
  '(defvar *debug-enabled* nil)',
  '(defvar *debug-condition* nil)',
  '(defun %debug-choice ()',
  '  (handler-case (%wait-line)',
  '    (serious-condition () "-1")))',
  '(defun %debug-pause (e)',
  '  (%note-error e)',
  '  (setf *debug-condition* e)',
  '  (when *debug-enabled*',
  '    (let ((restarts (compute-restarts e)))',
  '      (loop',
  '        (finish-output *error-output*)',
  '        (format *error-output* "~&;;DEBUG: ~A~%" (%oneline (%report e)))',
  '        (loop for r in restarts for i from 0',
  '              do (format *error-output* "~&;;RESTART: ~D|~A|~A~%"',
  '                         i (restart-name r)',
  '                         (%oneline (handler-case (princ-to-string r)',
  '                                     (serious-condition () (string (restart-name r)))))))',
  '        (format *error-output* "~&;;DEBUG-WAIT~%")',
  '        (finish-output *error-output*)',
  '        (let* ((choice (string-trim " " (or (%debug-choice) "-1")))',
  '               (sp (position #\\Space choice))',
  '               (idx (parse-integer choice :end sp :junk-allowed t))',
  '               (r (and idx (>= idx 0) (< idx (length restarts)) (nth idx restarts))))',
  '          (unless r (return nil))',
  '          (if sp',
  '              (let ((val (handler-case (eval (read-from-string (subseq choice (1+ sp))))',
  '                           (serious-condition (ve)',
  '                             (format *error-output* "~&;;DEBUG-NOTE: value form failed: ~A~%" (%report ve))',
  '                             (finish-output *error-output*)',
  '                             (quote %cc-bad-value)))))',
  '                (unless (eq val (quote %cc-bad-value))',
  '                  (invoke-restart r val)))',
  '              (invoke-restart r)))))))',
  '(defun eval-one (form)',
  '  (handler-case',
  '      (let ((vals (restart-case',
  '                      (handler-bind ((warning (function %warn))',
  '                                     (serious-condition (function %debug-pause)))',
  '                        (multiple-value-list (%run form)))',
  '                    (retry ()',
  '                      :report "Retry evaluating this form"',
  '                      (return-from eval-one (eval-one form)))',
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
  '        (let ((*print-pretty* nil))',
  '          (if vals',
  '              (dolist (v vals) (format t "~&;;=> ~S~%" v))',
  '              (format t "~&;;=> ; no values~%")))',
  '        t)',
  '    (serious-condition (e)',
  '      (format *error-output* "~&;;ERROR: ~A~%" (%report e))',
  '      nil)))',
  '(defun %skip-block-comment (in)',
  '  (let ((depth 1))',
  '    (loop while (> depth 0)',
  '      do (let ((c (read-char in nil nil)))',
  '           (cond ((null c) (return))',
  '                 ((and (eql c #\\|) (eql (peek-char nil in nil nil) #\\#))',
  '                  (read-char in) (decf depth))',
  '                 ((and (eql c #\\#) (eql (peek-char nil in nil nil) #\\|))',
  '                  (read-char in) (incf depth)))))))',
  '(defun %skip-blank (in)',
  '  (loop',
  '    (peek-char t in nil nil)',
  '    (let ((c (peek-char nil in nil nil)))',
  '      (cond ((eql c #\\;) (read-line in nil nil))',
  '            ((eql c #\\#)',
  '             (let ((p (file-position in)))',
  '               (read-char in)',
  '               (if (eql (peek-char nil in nil nil) #\\|)',
  '                   (progn (read-char in) (%skip-block-comment in))',
  '                   (progn (file-position p in) (return)))))',
  '            (t (return))))))',
  '(defun %package-label (p)',
  '  (let ((names (remove nil (cons (package-name p) (package-nicknames p)))))',
  '    (if names',
  '        (first (sort (copy-list names) (function <) :key (function length)))',
  '        "CL-USER")))',
  '(defun eval-string (src &key compile debug path)',
  '  (let* ((*package* (or *eval-package* (find-package :cl-user) *package*))',
  '         (*eval-compile* compile)',
  '         (*debug-enabled* debug)',
  '         (*debug-condition* nil)',
  '         (sin (make-instance (quote %stdin)))',
  '         (*standard-input* sin))',
  '    (%install-io sin)',
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
  ';;; ---- project loader ----',
  '(defun %say-file (path status msg)',
  '  (format t "~&;;FILE: ~A|~A|~A~%" (%oneline path) status (%oneline (or msg "")))',
  '  (finish-output))',
  '(defun %say-note (msg)',
  '  (format t "~&;;NOTE: ~A~%" (%oneline msg))',
  '  (finish-output))',
  '(defun %say-hint (msg)',
  '  (format t "~&;;HINT: ~A~%" (%oneline msg))',
  '  (finish-output))',
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
  '(defun %snapshot-symbols ()',
  '  (let ((h (make-hash-table :test (quote eq))))',
  '    (dolist (p (list-all-packages) h)',
  '      (do-symbols (s p) (setf (gethash s h) t)))))',
  '(defvar *load-aborted* nil)',
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
  '(defun %ext= (path ext)',
  '  (let ((p (string-downcase path)) (e (string-downcase ext)))',
  '    (and (>= (length p) (length e))',
  '         (string= e (subseq p (- (length p) (length e)))))))',
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
  '(defun %dir-of (path)',
  '  (namestring (make-pathname :directory (pathname-directory (pathname path)))))',
  '(defun %manual-load-ordered (files)',
  '  (dolist (f files)',
  '    (if *load-aborted*',
  '        (%say-file f "error" "not loaded -- load aborted from the debugger")',
  '        (progn',
  '          (multiple-value-bind (nok nerr first-err) (%load-file-forms f)',
  '            (cond ((zerop nerr)',
  '                   (%say-file f "ok" (format nil "loaded (~A form~:P)" nok)))',
  '                  ((plusp nok)',
  '                   (%say-file f "warn" (format nil "~A/~A forms ok -- ~A" nok (+ nok nerr) first-err)))',
  '                  (t',
  '                   (%say-file f "error" (or first-err "load failed")))))',
  '          ;; a loader file can (load "ext-compat.lisp") itself and put',
  '          ;; the plain wasm-error SHELL back — keep the capture on top',
  '          (%install-shell-capture)))))',
  '(defun %package-first (files)',
  '  (sort (copy-list files)',
  '        (lambda (a b)',
  '          (let ((pa (or (search "package" (string-downcase (or (pathname-name a) "")))',
  '                        most-positive-fixnum))',
  '                (pb (or (search "package" (string-downcase (or (pathname-name b) "")))',
  '                        most-positive-fixnum)))',
  '            (if (= pa pb) (string< a b) (< pa pb))))))',
  '(defun %load-with-asd (asd lisps)',
  '  (let* ((forms (%read-forms-from asd))',
  '         (defpkgs (remove-if-not (lambda (f) (%head-named f "DEFPACKAGE")) forms))',
  '         (defsys (find-if (lambda (f) (%head-named f "DEFSYSTEM")) forms))',
  '         (dir (%dir-of asd))',
  '         (comps (if defsys (%flatten-components (getf (cddr defsys) :components) dir) nil))',
  '         (sysname (or (and defsys (symbolp (cadr defsys))',
  '                           (string-downcase (symbol-name (cadr defsys))))',
  '                      (pathname-name asd))))',
  '    (if forms',
  '        (%say-file asd "ok" (format nil "parsed -- system ~A (~A component~:P)" sysname (length comps)))',
  '        (%say-file asd "warn" "could not parse -- no component information"))',
  '    (dolist (dp defpkgs)',
  '      (handler-case (eval dp)',
  '        (serious-condition (e)',
  '          (%say-note (format nil "defpackage in ~A failed: ~A" asd (%report e))))))',
  '    (let* ((ordered (remove-if-not (lambda (c) (member c lisps :test (function string=))) comps))',
  '           (rest (sort (set-difference lisps ordered :test (function string=))',
  '                       (function string<))))',
  '      (%manual-load-ordered (append ordered rest)))))',
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
  '  (let ((newpkgs (set-difference (list-all-packages) pkgs-before :test (function eq))))',
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
  '        (let* ((newpkgs (set-difference (list-all-packages) pkgs-before :test (function eq)))',
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
  /* ---- asdf + require shims (the wecl loader's, ported) ----
   * Project .asd files read (asdf:defsystem …) and init files call
   * (require :asdf); neither can work here (the contrib tree is not in
   * the image), so a dummy ASDF package makes them READ cleanly and a
   * module provider makes (require :asdf) succeed against it. */
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
  '                  (%say-note (format nil "asdf is not part of this runtime -- (asdf:load-system ~(~A~)) treated as already loaded" system))',
  '                  t))',
  '          (setf (symbol-function (intern "OPERATE" pkg))',
  '                (lambda (&rest args)',
  '                  (declare (ignorable args))',
  '                  (%say-note "asdf is not part of this runtime -- asdf:operate ignored")',
  '                  t))',
  '          t)',
  '      (serious-condition () nil))))',
  '(defun %ensure-require-provider ()',
  '  (handler-case',
  '      (let ((provider (lambda (module &optional paths)',
  '                        (declare (ignore paths))',
  '                        (and (string-equal (string module) "asdf")',
  '                             (find-package :asdf)))))',
  '        (pushnew provider sb-ext:*module-provider-functions* :test (function eq))',
  '        t)',
  '    (serious-condition () nil)))',
  '(defun load-project (files &key debug)',
  '  (setf *load-aborted* nil)',
  '  (setf *project-files* (mapcar (function parse-namestring) files))',
  '  ;; infrastructure first: the shims must exist before the package',
  '  ;; snapshot, so ASDF is never reported as a project package',
  '  (%ensure-dummy-asdf)',
  '  (%ensure-require-provider)',
  '  (let* ((*debug-enabled* debug)',
  '         (*debug-condition* nil)',
  '         (asds (remove-if-not (lambda (f) (%ext= f ".asd")) files))',
  '         (lisps (remove-if-not (lambda (f) (or (%ext= f ".lisp") (%ext= f ".lsp") (%ext= f ".cl")))',
  '                               files))',
  '         (pkgs-before (list-all-packages))',
  '         (syms-before (%snapshot-symbols))',
  '         (sin (make-instance (quote %stdin)))',
  '         (*standard-input* sin))',
  '    (%install-io sin)',
  '    (when (or asds lisps)',
  '      (setf *default-pathname-defaults*',
  '            (make-pathname :directory (pathname-directory (pathname (or (car asds) (car lisps)))))))',
  '    ;; an ext-compat.lisp defines the ECL-only EXT:SHELL/EXT:CD this',
  '    ;; image lacks — load it FIRST so the system files read cleanly',
  '    (when (and (find "ext-compat" lisps :key (function pathname-name) :test (function string-equal))',
  '               (probe-file "/project/ext-compat.lisp"))',
  '      (setf lisps (remove "ext-compat" lisps :key (function pathname-name) :test (function string-equal)))',
  '      (multiple-value-bind (nok nerr first-err) (%load-file-forms "/project/ext-compat.lisp")',
  '        (declare (ignore nok))',
  '        (%say-file "/project/ext-compat.lisp" (if (zerop nerr) "ok" "warn")',
  '                   (or first-err "compatibility shim (EXT:SHELL, EXT:CD)")))',
  '      (%install-shell-capture))',
  '    (handler-bind ((warning (function %warn)))',
  '      (if asds',
  '          (dolist (asd asds) (%load-with-asd asd lisps))',
  '          (%manual-load-ordered (%package-first lisps))))',
  '    ;; again at the end: a loader file (cl-plot load-on-sbcl.lisp) can',
  '    ;; (load "ext-compat.lisp") itself and revert the capture',
  '    (%install-shell-capture)',
  '    (%emit-project-api pkgs-before syms-before)',
  '    (%emit-hint pkgs-before syms-before)',
  '    (finish-output)))',
  ';;; ---- gnuplot capture (cl-plot), ported from the wecl worker ----',
  /* cl-plot writes a gnuplot script + data files under /tmp, then calls
   * (ext:shell "bash <script>"). No subprocess can exist here, so the
   * EXT:SHELL dispatch intercepts that pattern: read the script and every
   * data file its plot commands reference, pack them prin1-printed,
   * base64-encode the pack and print ONE stdout marker the page renders
   * as an in-browser SVG: ;;PLOT64 <base64>. The shell call returns 0 so
   * cl-plot's cleanup (delete-file of the temp files) proceeds. Non-gnuplot
   * commands keep the clean, catchable subprocess error. */
  '(defvar *subprocess-msg* "subprocesses are not supported in the WASM runtime")',
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
  /* Sprint 29: every series path on a plot/replot line -- the first quoted
   * string after the keyword and each one that follows a comma (a quoted
   * title "..." inside a series is skipped), mirroring the browser parser */
  '(defun %plot-line-paths (line)',
  '  ;; scan after the plot/replot keyword; a series starts at the line start',
  '  ;; or after a comma, and is a data file only when its first non-blank',
  '  ;; character is a quote (Sprint 30: `sin(x) title "s"` ships no file)',
  '  (let* ((paths nil) (n (length line)) (expect t)',
  '         (i (let ((sp (position #\\Space line))) (if sp (1+ sp) n))))',
  '    (loop while (< i n) do',
  '      (let ((ch (char line i)))',
  '        (cond ((char= ch #\\")',
  '               (let ((q2 (position #\\" line :start (1+ i))))',
  '                 (unless q2 (return))',
  '                 (when (and expect (> q2 (1+ i)))',
  '                   (pushnew (subseq line (1+ i) q2) paths :test (function string=)))',
  '                 (setf expect nil i (1+ q2))))',
  '              ((char= ch #\\,) (setf expect t) (incf i))',
  '              ((member ch (quote (#\\Space #\\Tab))) (incf i))',
  '              (t (setf expect nil) (incf i)))))',
  '    (nreverse paths)))',
  '(defun %plot-data-paths (script)',
  '  (let ((paths nil) (start 0) (n (length script)))',
  '    (loop',
  '      (let ((eol (or (position #\\Newline script :start start) n)))',
  '        (let ((line (string-trim (quote (#\\Space #\\Tab #\\Return)) (subseq script start eol))))',
  '          (when (or (%starts-with line "plot ") (%starts-with line "replot "))',
  '            (dolist (p (%plot-line-paths line))',
  '              (pushnew p paths :test (function string=)))))',
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
  '(defun %install-shell-capture ()',
  '  ;; replace whatever EXT:SHELL is current (ext-compat.lisp or an older',
  '  ;; shim) with the gnuplot-capturing dispatch',
  '  (handler-case',
  '      (let* ((pkg (find-package :ext))',
  '             (sym (and pkg (find-symbol "SHELL" pkg))))',
  '        (when (and sym (fboundp sym))',
  '          (setf (symbol-function sym) (function %shell-dispatch))',
  '          t))',
  '    (serious-condition () nil)))',
  ';;; ---- module management (/modules) ----',
  '(defvar *cc-modules* nil)',
  /* the project's files, as load-project received them: (directory …)
   * cannot enumerate here (this port has no sb-unix:unix-opendir), so
   * package-install copies from the list we already have */
  '(defvar *project-files* nil)',
  '(defun %mod-name (x) (string-downcase (string x)))',
  '(defun %mod-project-files ()',
  '  (remove-duplicates *project-files* :test (function equal)))',
  '(defun %mod-asd-system-names ()',
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
  '    (let* ((meta (if hit (%mod-asd-meta (cdr hit)) (quote ("0" ""))))',
  '           (version (first meta))',
  '           (desc (second meta))',
  '           (files (or (%mod-copy-files nm)',
  '                      (mapcar (function parse-namestring) (third (cdr existing))))))',
  '      (format t "~&;; installing ~A ~A into /modules/~A/ -- ~D file~:P~%"',
  '              nm version nm (length files))',
  '      (when files (load-project (mapcar (function namestring) files)))',
  '      (setf *cc-modules*',
  '            (acons nm (list version desc (mapcar (function namestring) files)',
  '                            (get-universal-time))',
  '                  (remove nm *cc-modules* :key (function car) :test (function string=))))',
  '      (%mod-save-registry)',
  '      (format t "~&;;MODULES-CHANGED~%")',
  '      (format t "~&;; package ~A ~A installed~@[ -- ~A~]~%" nm version desc)',
  '      nm)))',
  '(defun package-list ()',
  '  (if (null *cc-modules*)',
  '      (format t "~&No packages installed. Load a project, then (package-install ~S).~%" "name")',
  '      (progn',
  '        (format t "~&Packages installed under /modules/:~%")',
  '        (dolist (m (sort (copy-list *cc-modules*) (function string<) :key (function car)))',
  '          (destructuring-bind (name version desc files ts) m',
  '            (declare (ignore ts files))',
  '            (format t "  ~A ~@[~A~] -- ~A~%"',
  '                    name (unless (string= version "0") version)',
  '                    (if (plusp (length desc)) desc "no description"))))))',
  '  (mapcar (function car) *cc-modules*))',
  '(defun package-load (name)',
  '  (let* ((nm (%mod-name name))',
  '         (entry (assoc nm *cc-modules* :test (function string=))))',
  '    (unless entry',
  '      (error "package ~S is not installed~@[ -- installed: ~{~A~^, ~}~]"',
  '             nm (mapcar (function car) *cc-modules*)))',
  '    (let ((files (mapcar (function parse-namestring) (third (cdr entry)))))',
  '      (unless (and files (ignore-errors (probe-file (first files))))',
  '        (error "module files for ~S are missing from /modules -- reinstall from the project" nm))',
  '      (format t "~&;; loading ~A from /modules/~A/ -- ~D file~:P~%" nm nm (length files))',
  '      (load-project (mapcar (function namestring) files))',
  '      (format t "~&;; package ~A loaded~%" nm)',
  '      nm)))',
  '(defun package-uninstall (name)',
  '  (let* ((nm (%mod-name name))',
  '         (entry (assoc nm *cc-modules* :test (function string=))))',
  '    (unless entry',
  '      (error "package ~S is not installed~@[ -- installed: ~{~A~^, ~}~]"',
  '             nm (mapcar (function car) *cc-modules*)))',
  '    (dolist (f (third (cdr entry))) (ignore-errors (delete-file f)))',
  '    (setf *cc-modules* (remove nm *cc-modules* :key (function car) :test (function string=)))',
  '    (%mod-save-registry)',
  '    (format t "~&;;MODULES-CHANGED~%")',
  '    (format t "~&;; package ~A uninstalled -- files removed from /modules/~A/~%" nm nm)',
  '    (format t ";; note: definitions already loaded remain in the image until the runtime restarts~%")',
  '    t))',
  /* ---- standard input: a Gray stream over /dev/cc-stdin ----
   * User code reading *standard-input* must never see the form channel
   * (fd 0 feeds the REPL); %stdin suspends on the host instead: when its
   * buffer runs dry it prints ;;READ-WAIT and blocks reading
   * /dev/cc-stdin until the page answers {type:'input'}. A lone ^D
   * answer (%wait-line nil) is end of file. */
  '(defclass %stdin (sb-gray:fundamental-character-input-stream)',
  '  ((buf :initform "" :accessor %sbuf)',
  '   (pos :initform 0 :accessor %spos)',
  '   (eof :initform nil :accessor %seof)))',
  '(defun %stdin-fill (s)',
  '  (unless (%seof s)',
  '    (finish-output *standard-output*)',
  '    (format *error-output* "~&;;READ-WAIT~%")',
  '    (finish-output *error-output*)',
  '    (let ((line (%wait-line)))',
  '      (if line',
  '          (setf (%sbuf s) (concatenate (quote string) line (string #\\Newline))',
  '                (%spos s) 0)',
  '          (setf (%seof s) t (%sbuf s) "" (%spos s) 0)))))',
  '(defmethod sb-gray:stream-read-char ((s %stdin))',
  '  (when (>= (%spos s) (length (%sbuf s))) (%stdin-fill s))',
  '  (if (>= (%spos s) (length (%sbuf s)))',
  '      :eof',
  '      (prog1 (char (%sbuf s) (%spos s)) (incf (%spos s)))))',
  '(defmethod sb-gray:stream-unread-char ((s %stdin) c)',
  '  (declare (ignore c))',
  '  (when (> (%spos s) 0) (decf (%spos s)))',
  '  nil)',
  '(defmethod sb-gray:stream-peek-char ((s %stdin))',
  '  (when (>= (%spos s) (length (%sbuf s))) (%stdin-fill s))',
  '  (if (>= (%spos s) (length (%sbuf s))) :eof (char (%sbuf s) (%spos s))))',
  '(defmethod sb-gray:stream-listen ((s %stdin))',
  '  (< (%spos s) (length (%sbuf s))))',
  '(defmethod sb-gray:stream-clear-input ((s %stdin))',
  '  (setf (%sbuf s) "" (%spos s) 0)',
  '  nil)',
  '(defun %install-io (sin)',
  '  (setf *query-io* (make-two-way-stream sin *error-output*)',
  '        *terminal-io* (make-two-way-stream sin *error-output*)))',
  '(import (list (find-symbol (string :package-install) (find-package :cc))',
  '              (find-symbol (string :package-list) (find-package :cc))',
  '              (find-symbol (string :package-uninstall) (find-package :cc))',
  '              (find-symbol (string :package-load) (find-package :cc)))',
  '        (find-package :cl-user))',
  /* no REPL prompt: the page drives the image, and a "* " would glue
   * itself onto the first output line of every job */
  '(setf sb-int:*repl-prompt-fun* (lambda (stream) (declare (ignore stream))))',
].join('\n')

function escapeLispString(src) {
  return String(src).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/* Every fed form is guarded so a bug in cc itself surfaces as ;;ERROR:
 * instead of dropping the SBCL REPL into its error printer mid-protocol. */
function guardTopLevel(form) {
  return '(handler-case ' + form +
    ' (serious-condition (e)' +
    '   (handler-case (format *error-output* "~&;;ERROR: internal: ~A~%" e)' +
    '     (serious-condition () (format *error-output* "~&;;ERROR: internal: ~A signalled~%" (type-of e))))' +
    '   (format *error-output* "~&;;CC-DONE~%")))'
}

function evalFormLiteral(code, opts) {
  opts = opts || {}
  return '(cc:eval-string "' + escapeLispString(code) + '"' +
    (opts.compile ? ' :compile t' : '') +
    (opts.debug ? ' :debug t' : '') +
    (opts.path ? ' :path "' + escapeLispString(String(opts.path)) + '"' : '') + ')'
}

/* the trailing ;;CC-DONE is the job-complete signal; (values) keeps the
 * REPL itself from printing a NIL for the wrapper form */
function withDoneMarker(form) {
  return '(progn ' + form + ' (format t "~&;;CC-DONE~%") (values))'
}

/* ------------------------------------------------------------------ */
/* Request handling (called from the WASI imports)                      */
/* ------------------------------------------------------------------ */

function feedForm(formText) {
  try { console.log('[cc] feed ' + formText.length + 'B id-curve') } catch (e) {}
  /* the trailing blank line matters: SBCL's reader buffers the form but
   * waits for input to continue past it (verified empirically — without
   * the second newline a form sits evaluated-but-unrun until the next
   * request arrives) */
  var bytes = encoder.encode(formText + '\n\n')
  var w = Atomics.load(sabI32, 0)
  var r = Atomics.load(sabI32, 1)
  var nw = ringWrite(FORM_OFF, FORM_RING_BYTES, w, r, bytes)
  if (nw === false) throw new Error('sbcl form ring overflow (job too large)')
  Atomics.store(sabI32, 0, nw)
  Atomics.notify(sabI32, 0)
}

function pushStdinLine(text) {
  /* a lone ^D (code 4) is the EOF answer, matching the helper's %wait-line */
  var line = text == null ? '\x04' : String(text).replace(/\r?\n$/, '') + '\n'
  var bytes = encoder.encode(line)
  for (var spin = 0; ; spin++) {
    var w = Atomics.load(sabI32, 2)
    var r = Atomics.load(sabI32, 3)
    var nw = ringWrite(STDIN_OFF, STDIN_RING_BYTES, w, r, bytes)
    if (nw !== false) {
      Atomics.store(sabI32, 2, nw)
      Atomics.notify(sabI32, 2)
      return
    }
    if (spin > 100) throw new Error('sbcl stdin ring stuck')
    /* the image is reading it right now (we are inside its call) — retry */
  }
}

function handleRequest(req) {
  if (!req || !req.type) return
  if (req.type === 'eval') {
    currentJobId = req.id | 0
    feedForm(withDoneMarker(guardTopLevel(evalFormLiteral(req.code, req))))
  } else if (req.type === 'load-project') {
    currentJobId = req.id | 0
    vfsRmrf('/project')
    vfs.dirs.add('/project')
    ;(req.files || []).forEach(function (f) {
      vfsWriteFile('/project/' + String(f.path).replace(/^\/+/, ''), String(f.content))
    })
    var paths = (req.files || []).map(function (f) {
      return '"/project/' + escapeLispString(String(f.path).replace(/^\/+/, '')) + '"'
    })
    feedForm(withDoneMarker(guardTopLevel(
      '(cc:load-project (list ' + paths.join(' ') + ')' + (req.debug ? ' :debug t' : '') + ')')))
  } else if (req.type === 'input') {
    pushStdinLine(req.text)
  } else if (req.type === 'restart') {
    pushStdinLine(String(req.index) + (req.value != null && String(req.value).trim() ? ' ' + String(req.value).trim() : ''))
  } else if (req.type === 'modules-snapshot') {
    /* the /modules tree lives in THIS worker's memory — snapshot it here */
    currentJobId = req.id | 0
    var files = []
    vfs.files.forEach(function (data, p) {
      if (!p.startsWith('/modules/')) return
      files.push({
        path: p.slice('/modules/'.length),
        content: new TextDecoder('utf-8').decode(fileBytes(data)),
      })
    })
    self.postMessage({ type: 'modules-data', id: req.id, files: files })
    self.postMessage({ type: 'done', id: req.id })
  } else if (req.type === 'modules-restore') {
    vfsRmrf('/modules')
    vfs.dirs.add('/modules')
    ;(req.files || []).forEach(function (f) {
      vfsWriteFile('/modules/' + String(f.path).replace(/^\/+/, ''), String(f.content))
    })
    currentJobId = req.id | 0
    feedForm(withDoneMarker(guardTopLevel('(handler-case (cc::%restore-modules) (serious-condition () nil))')))
  } else if (req.type === 'quit') {
    feedForm('(sb-ext:exit)')
  }
}

/* Serve the REPL's stdin: the next Lisp form. Blocks the image until one
 * is available. */
function serveForm() {
  for (;;) {
    var item = ringTake(FORM_OFF, FORM_RING_BYTES, Atomics.load(sabI32, 0), Atomics.load(sabI32, 1))
    if (item) {
      try { console.log('[cc] serve ' + item.bytes.length + 'B') } catch (e) {}
      Atomics.store(sabI32, 1, item.newRead)
      Atomics.notify(sabI32, 1)
      return item.bytes
    }
    var req = pendingRequest
    if (req) { pendingRequest = null; handleRequest(req); continue }
    req = mailboxTake()
    if (req) {
      handleRequest(req)
      continue
    }
    Atomics.wait(sabI32, 4, 0, 1000) /* woken by the page's notify */
  }
}

/* Serve /dev/cc-stdin: one answer line. Blocks the image. */
function serveStdin() {
  for (;;) {
    var item = ringTake(STDIN_OFF, STDIN_RING_BYTES, Atomics.load(sabI32, 2), Atomics.load(sabI32, 3))
    if (item) {
      Atomics.store(sabI32, 3, item.newRead)
      Atomics.notify(sabI32, 3)
      return item.bytes
    }
    var req = mailboxTake()
    if (req) {
      if (req.type === 'input' || req.type === 'restart') handleRequest(req)
      else mailboxStash(req) /* serveForm will run it after this read */
      continue
    }
    Atomics.wait(sabI32, 4, 0, 1000)
  }
}

/* ------------------------------------------------------------------ */
/* WASI preview1 shim                                                   */
/* ------------------------------------------------------------------ */

var ERR = { NONE: 0, ACCES: 2, BADF: 8, EXIST: 20, INVAL: 28, IO: 29, NOENT: 44, NOSYS: 52, NOTDIR: 54, NOTEMPTY: 55, SPIPE: 70 }

var fdTable = new Map() /* fd -> {path, pos, isStdin, isDir} */
var nextFd = 4 /* 0/1/2 std, 3 = the "/" preopen */

var wasm = null
var ARGS = []
var ENVS = []

/* output: line-buffered per fd, with streaming decoders (a multi-byte
 * UTF-8 char may split across fd_write calls) */
var outDecoder = { 1: null, 2: null }
var outLine = { 1: '', 2: '' }

function emitLine(fd, text) {
  /* the interactive REPL's "* " prompt can share a line with our first
   * output — markers match on the line's suffix */
  var marker = /(^|\s);;CC-DONE$/.test(text.trim())
  if (phase !== 'failed') {
    /* id 0 (boot noise) is ignored main-side — the harness logs it */
    self.postMessage({ type: fd === 2 ? 'stderr' : 'stdout', id: currentJobId, text: text })
  }
  if (phase !== 'run') {
    verifyLines.push(text)
    if (marker) bootstrapDone()
    return
  }
  if (marker) {
    self.postMessage({ type: 'done', id: currentJobId })
    currentJobId = 0
  }
}

/* the two seeded boot forms end with ;;CC-DONE: the first is the helper,
 * the second the verification eval — ready (or bootfail) follows */
var bootFormsDone = 0
function bootstrapDone() {
  bootFormsDone++
  if (bootFormsDone === 2) {
    var ok = verifyLines.some(function (l) { return l.indexOf(';;=> 3') !== -1 })
    if (ok) {
      bootLine('warm-up eval (+ 1 2) ;;=> 3')
      bootLine('ready — happy hacking (SBCL, wasm32-wasip1)')
      phase = 'run'
      self.postMessage({ type: 'ready' })
    } else {
      failBoot('helper verification failed' +
        (verifyLines.length ? ' — bootstrap said: ' + verifyLines.slice(-8).join(' | ') : ''))
    }
  }
}

function writeOutChunk(fd, u8) {
  if (!outDecoder[fd]) outDecoder[fd] = new TextDecoder('utf-8')
  var text = outLine[fd] + outDecoder[fd].decode(u8, { stream: true })
  var lines = text.split('\n')
  outLine[fd] = lines.pop()
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i]
    if (t !== '') emitLine(fd, t)
  }
}

function mem() { return wasm.exports.memory.buffer }
function memU8() { return new Uint8Array(mem()) }
function memDV() { return new DataView(mem()) }
function readPath(ptr, len) {
  return new TextDecoder('utf-8').decode(new Uint8Array(mem(), ptr, len))
}

/* the timer (set_timer) and Ctrl-C, checked whenever the runtime reads a
 * clock — it does constantly (get-internal-real-time) */
var timerDeadline = 0
var registerArea = 0

function setInterruptBits(bits) {
  if (!registerArea) return
  var off = registerArea + 456 /* LISP_REGISTER_AREA_INTERRUPT_PENDING */
  var dv = memDV()
  if (off + 4 > dv.byteLength) return
  dv.setUint32(off, dv.getUint32(off, true) | bits, true)
}
function checkInterrupts() {
  if (timerDeadline > 0 && Date.now() >= timerDeadline) {
    timerDeadline = 0
    setInterruptBits(16)
  }
  if (Atomics.load(sabI32, 5) === 1) {
    Atomics.store(sabI32, 5, 0)
    setInterruptBits(1)
  }
}

/* leftovers from a form/line larger than the caller's iovec: served
 * before asking for more (never drop bytes); tagged by channel so a form
 * backlog and a /dev/cc-stdin backlog never mix */
var stdinBacklog = null /* {src:'form'|'stdin', bytes} */

function makeWasi() {
  var w = {}

  w.args_sizes_get = function (argcPtr, argvBufSizePtr) {
    var dv = memDV()
    dv.setUint32(argcPtr, ARGS.length, true)
    var n = 0
    ARGS.forEach(function (a) { n += a.length + 1 })
    dv.setUint32(argvBufSizePtr, n, true)
    return ERR.NONE
  }
  w.args_get = function (argvPtr, argvBufPtr) {
    var u8 = memU8()
    var dv = memDV()
    var p = argvBufPtr
    ARGS.forEach(function (a, i) {
      dv.setUint32(argvPtr + 4 * i, p, true)
      for (var j = 0; j < a.length; j++) u8[p + j] = a.charCodeAt(j)
      u8[p + a.length] = 0
      p += a.length + 1
    })
    return ERR.NONE
  }
  w.environ_sizes_get = function (envcPtr, envBufSizePtr) {
    var dv = memDV()
    dv.setUint32(envcPtr, ENVS.length, true)
    var n = 0
    ENVS.forEach(function (e) { n += e.length + 1 })
    dv.setUint32(envBufSizePtr, n, true)
    return ERR.NONE
  }
  w.environ_get = function (environPtr, envBufPtr) {
    var u8 = memU8()
    var dv = memDV()
    var p = envBufPtr
    ENVS.forEach(function (e, i) {
      dv.setUint32(environPtr + 4 * i, p, true)
      for (var j = 0; j < e.length; j++) u8[p + j] = e.charCodeAt(j)
      u8[p + e.length] = 0
      p += e.length + 1
    })
    return ERR.NONE
  }

  w.clock_time_get = function (clockId, precision, timePtr) {
    checkInterrupts()
    var now = clockId === 0 ? Date.now() : performance.now()
    memDV().setBigUint64(timePtr, BigInt(Math.round(now * 1e6)), true)
    return ERR.NONE
  }

  w.fd_write = function (fd, iovs, iovsLen, nwrittenPtr) {
    var dv = memDV()
    if (fd !== 1 && fd !== 2) {
      /* a file the Lisp side opened for output: buffer, commit at close */
      var e = fdTable.get(fd)
      if (!e || !e.writable) return ERR.BADF
      var wtotal = 0
      if (!e.writeBuf) e.writeBuf = []
      for (var wi = 0; wi < iovsLen; wi++) {
        var wp = dv.getUint32(iovs + 8 * wi, true)
        var wl = dv.getUint32(iovs + 8 * wi + 4, true)
        if (wl > 0) { e.writeBuf.push(new Uint8Array(mem(), wp, wl).slice()); wtotal += wl }
      }
      e.pos += wtotal
      dv.setUint32(nwrittenPtr, wtotal, true)
      return ERR.NONE
    }
    var total = 0
    var parts = []
    for (var i = 0; i < iovsLen; i++) {
      var bufPtr = dv.getUint32(iovs + 8 * i, true)
      var bufLen = dv.getUint32(iovs + 8 * i + 4, true)
      if (bufLen > 0) { parts.push(new Uint8Array(mem(), bufPtr, bufLen)); total += bufLen }
    }
    if (total > 0) {
      var all = new Uint8Array(total)
      var o = 0
      parts.forEach(function (c) { all.set(c, o); o += c.length })
      writeOutChunk(fd, all)
    }
    dv.setUint32(nwrittenPtr, total, true)
    return ERR.NONE
  }

  /* copy `bytes` into the first iovec (a short read is legal); keep the
   * remainder in the backlog tagged by its source channel. */
  var iovsTmp = 0 /* set by fd_read */
  function fillIovs(bytes, src) {
    var dv = memDV()
    var cap = dv.getUint32(iovsTmp + 4, true)
    var dest = dv.getUint32(iovsTmp, true)
    var n = Math.min(bytes.length, cap)
    memU8().set(bytes.subarray(0, n), dest)
    stdinBacklog = n < bytes.length ? { src: src, bytes: bytes.subarray(n) } : null
    return n
  }

  w.fd_read = function (fd, iovs, iovsLen, nreadPtr) {
    var dv = memDV()
    iovsTmp = iovs
    if (fd === 0) {
      /* the REPL's stdin: our form channel */
      var bytes = stdinBacklog && stdinBacklog.src === 'form' ? stdinBacklog.bytes : serveForm()
      dv.setUint32(nreadPtr, fillIovs(bytes, 'form'), true)
      return ERR.NONE
    }
    var entry = fdTable.get(fd)
    if (!entry) return ERR.BADF
    if (entry.isStdin) {
      var sb = stdinBacklog && stdinBacklog.src === 'stdin' ? stdinBacklog.bytes : serveStdin()
      dv.setUint32(nreadPtr, fillIovs(sb, 'stdin'), true)
      return ERR.NONE
    }
    var file = vfsLookup(entry.path)
    if (!file || file.kind !== 'file') return ERR.BADF
    var data = fileBytes(file.data)
    var total = 0
    for (var i = 0; i < iovsLen; i++) {
      var bufPtr = dv.getUint32(iovs + 8 * i, true)
      var bufLen = dv.getUint32(iovs + 8 * i + 4, true)
      var avail = data.length - entry.pos
      var take = Math.min(bufLen, avail)
      if (take > 0) new Uint8Array(mem(), bufPtr, take).set(data.subarray(entry.pos, entry.pos + take))
      entry.pos += take
      total += take
      if (take < bufLen) break
    }
    dv.setUint32(nreadPtr, total, true)
    return ERR.NONE
  }

  w.fd_close = function (fd) {
    if (fd > 3) {
      var e = fdTable.get(fd)
      if (e && e.writable && e.writeBuf) {
        var size = e.writeBuf.reduce(function (n, c) { return n + c.length }, 0)
        var all = new Uint8Array(size)
        var o = 0
        e.writeBuf.forEach(function (c) { all.set(c, o); o += c.length })
        /* commit: replace (trunc-style open) or merge at the write offset */
        var prevBytes = (vfsLookup(e.path) || { data: '' }).data
        var prev = fileBytes(prevBytes)
        if (e.pos === all.length) {
          vfsWriteFile(e.path, all)
        } else {
          var merged = new Uint8Array(Math.max(prev.length, e.pos))
          merged.set(prev.subarray(0, Math.min(prev.length, merged.length)))
          merged.set(all, e.pos - all.length)
          vfsWriteFile(e.path, merged)
        }
      }
      fdTable.delete(fd)
    }
    return ERR.NONE
  }

  /* fdstat (24 bytes): u8 filetype, u16 flags, rights x2. The std fds are
   * CHARACTER DEVICES on purpose: SBCL's unix-simple-poll then treats them
   * as always-ready (src/code/unix.lisp, the #+wasm branch) and blocks in
   * fd_read instead — a select(2) on them would spin in wasi-libc. Char
   * devices also make libc line-buffer stdout: markers flush per line. */
  w.fd_fdstat_get = function (fd, bufPtr) {
    var dv = memDV()
    var ftype = 2 /* character device: fds 0/1/2 */
    if (fd === 3) ftype = 3
    else if (fd > 3) {
      if (!fdTable.has(fd)) return ERR.BADF
      var e = fdTable.get(fd)
      ftype = e.isStdin ? 2 : (e.isDir ? 3 : 4)
    }
    dv.setUint8(bufPtr, ftype)
    dv.setUint16(bufPtr + 2, 0, true)
    dv.setBigUint64(bufPtr + 8, 0xffffffffffffffffn, true)
    dv.setBigUint64(bufPtr + 16, 0xffffffffffffffffn, true)
    return ERR.NONE
  }
  w.fd_fdstat_set_flags = function () { return ERR.NONE }

  /* filestat (64 bytes): dev, ino, u8 ftype@16, nlink@24, size@32, times */
  function writeStat(ptr, ftype, size) {
    var dv = memDV()
    dv.setBigUint64(ptr, 0n, true)
    dv.setBigUint64(ptr + 8, 0n, true)
    dv.setUint8(ptr + 16, ftype)
    dv.setBigUint64(ptr + 24, 1n, true)
    dv.setBigUint64(ptr + 32, BigInt(size), true)
    var t = BigInt(Date.now()) * 1000000n
    dv.setBigUint64(ptr + 40, t, true)
    dv.setBigUint64(ptr + 48, t, true)
    dv.setBigUint64(ptr + 56, t, true)
  }

  w.fd_filestat_get = function (fd, bufPtr) {
    if (fd === 3) { writeStat(bufPtr, 3, 0); return ERR.NONE }
    if (fd <= 2) { writeStat(bufPtr, 2, 0); return ERR.NONE }
    var e = fdTable.get(fd)
    if (!e) return ERR.BADF
    if (e.isStdin) { writeStat(bufPtr, 2, 0); return ERR.NONE }
    if (e.isDir) { writeStat(bufPtr, 3, 0); return ERR.NONE }
    var f = vfsLookup(e.path)
    if (!f || f.kind !== 'file') return ERR.BADF
    writeStat(bufPtr, 4, fileBytes(f.data).length)
    return ERR.NONE
  }
  w.fd_filestat_set_times = function () { return ERR.NONE }

  w.fd_seek = function (fd, offsetBig, whence, newOffsetPtr) {
    var e = fdTable.get(fd)
    if (!e) return fd <= 2 ? ERR.SPIPE : ERR.BADF
    if (e.isStdin) return ERR.SPIPE
    var f = vfsLookup(e.path)
    if (!f) return ERR.BADF
    if (f.kind !== 'file') return ERR.BADF
    var len = fileBytes(f.data).length
    var off = Number(BigInt.asIntN(64, offsetBig))
    var base = whence === 0 ? 0 : whence === 1 ? e.pos : len
    var np = base + off
    if (np < 0) return ERR.INVAL
    e.pos = np
    memDV().setBigUint64(newOffsetPtr, BigInt(np), true)
    return ERR.NONE
  }

  /* prestat (16 bytes): u8 tag(0=dir), u64 name len at +8 */
  w.fd_prestat_get = function (fd, bufPtr) {
    if (fd !== 3) return ERR.BADF
    var dv = memDV()
    dv.setUint8(bufPtr, 0)
    dv.setBigUint64(bufPtr + 8, 1n, true) /* "/" */
    return ERR.NONE
  }
  w.fd_prestat_dir_name = function (fd, pathPtr, pathLen) {
    if (fd !== 3) return ERR.BADF
    var u8 = memU8()
    u8[pathPtr] = 0x2f
    return ERR.NONE
  }

  /* readdir: entries of the first level under dirPath; cookie = the
   * index of the next entry to return (d_next of entry i is i+1) */
  w.fd_readdir = function (fd, bufPtr, bufLen, cookieBig, bufusedPtr) {
    var cookie = Number(cookieBig) /* u64 param: arrives as a BigInt */
    var e = fd === 3 ? { path: '/' } : fdTable.get(fd)
    if (!e) return ERR.BADF
    var dirPath = e.path
    var dv = memDV()
    var entries = []
    var seen = new Set()
    function add(name, isDir) {
      if (seen.has(name)) return
      seen.add(name)
      entries.push({ name: name, type: isDir ? 3 : 4 })
    }
    var prefix = dirPath === '/' ? '/' : dirPath + '/'
    vfs.files.forEach(function (_d, p) {
      if (!p.startsWith(prefix) || p === dirPath) return
      var rest = p.slice(prefix.length)
      if (!rest) return
      add(rest.split('/')[0], rest.indexOf('/') !== -1)
    })
    vfs.dirs.forEach(function (d) {
      if (!d.startsWith(prefix) || d === dirPath) return
      var rest = d.slice(prefix.length)
      if (!rest) return
      add(rest.split('/')[0], true)
    })
    entries.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0 })
    var out = new Uint8Array(bufLen)
    var odv = new DataView(out.buffer)
    var o = 0
    for (var i = cookie; i < entries.length; i++) {
      var nameBytes = encoder.encode(entries[i].name)
      if (o + 24 + nameBytes.length > bufLen) break
      odv.setBigUint64(o, BigInt(i + 1), true) /* d_next */
      odv.setBigUint64(o + 8, 0n, true) /* d_ino */
      odv.setUint32(o + 16, nameBytes.length, true)
      out[o + 20] = entries[i].type
      out.set(nameBytes, o + 24)
      o += 24 + nameBytes.length
    }
    new Uint8Array(mem(), bufPtr, o).set(out.subarray(0, o))
    dv.setUint32(bufusedPtr, o, true)
    return ERR.NONE
  }

  function dirBase(fd) {
    if (fd === 3) return ''
    var e = fdTable.get(fd)
    return e ? e.path : null
  }

  w.path_open = function (fd, dirflags, pathPtr, pathLen, oflags, rightsBase, rightsInh, fdflags, openedFdPtr) {
    var base = dirBase(fd)
    if (base === null) return ERR.BADF
    var path = normPath(base + readPath(pathPtr, pathLen))
    var dv = memDV()
    if (path === '/dev/cc-stdin') {
      var sfd = nextFd++
      fdTable.set(sfd, { path: path, pos: 0, isStdin: true })
      dv.setUint32(openedFdPtr, sfd, true)
      return ERR.NONE
    }
    var creat = (oflags & 1) !== 0 /* __WASI_OFLAGS_CREAT */
    var trunc = (oflags & 8) !== 0 /* __WASI_OFLAGS_TRUNC */
    var entry = vfsLookup(path)
    if (!entry) {
      if (!creat) return ERR.NOENT
      vfsWriteFile(path, '')
      entry = { kind: 'file', data: '' }
    } else if (entry.kind === 'cc-stdin') return ERR.NOENT
    if (entry.kind === 'dir') {
      var dfd = nextFd++
      fdTable.set(dfd, { path: path, pos: 0, isDir: true })
      dv.setUint32(openedFdPtr, dfd, true)
      return ERR.NONE
    }
    if (trunc) { vfsWriteFile(path, ''); entry = { kind: 'file', data: '' } }
    var nfd = nextFd++
    var startPos = 0
    if ((fdflags & 2) !== 0) startPos = fileBytes(vfsLookup(path).data).length /* fd_append */
    fdTable.set(nfd, { path: path, pos: startPos, writable: true })
    dv.setUint32(openedFdPtr, nfd, true)
    return ERR.NONE
  }

  w.path_filestat_get = function (fd, flags, pathPtr, pathLen, bufPtr) {
    var base = dirBase(fd)
    if (base === null) return ERR.BADF
    var p = normPath(base + readPath(pathPtr, pathLen))
    var e = vfsLookup(p)
    if (!e) return ERR.NOENT
    writeStat(bufPtr,
      e.kind === 'dir' ? 3 : e.kind === 'cc-stdin' ? 2 : 4,
      e.kind === 'file' ? fileBytes(e.data).length : 0)
    return ERR.NONE
  }
  w.path_filestat_set_times = function () { return ERR.NONE }

  w.path_create_directory = function (fd, pathPtr, pathLen) {
    var base = dirBase(fd)
    if (base === null) return ERR.BADF
    vfs.dirs.add(normPath(base + readPath(pathPtr, pathLen)))
    return ERR.NONE
  }
  w.path_remove_directory = function (fd, pathPtr, pathLen) {
    var base = dirBase(fd)
    if (base === null) return ERR.BADF
    vfs.dirs.delete(normPath(base + readPath(pathPtr, pathLen)))
    return ERR.NONE
  }
  w.path_unlink_file = function (fd, pathPtr, pathLen) {
    var base = dirBase(fd)
    if (base === null) return ERR.BADF
    vfs.files.delete(normPath(base + readPath(pathPtr, pathLen)))
    return ERR.NONE
  }
  w.path_rename = function (oldFd, oldPtr, oldLen, newFd, newPtr, newLen) {
    var ob = dirBase(oldFd)
    var nb = dirBase(newFd)
    if (ob === null || nb === null) return ERR.BADF
    var from = normPath(ob + readPath(oldPtr, oldLen))
    var to = normPath(nb + readPath(newPtr, newLen))
    if (vfs.files.has(from)) { vfs.files.set(to, vfs.files.get(from)); vfs.files.delete(from); return ERR.NONE }
    if (vfs.dirs.has(from)) { vfs.dirs.delete(from); vfs.dirs.add(to); return ERR.NONE }
    return ERR.NOENT
  }
  /* no symlinks in the VFS — EINVAL for existing paths (that's what
   * realpath's emulation expects for a non-link: ENOENT would make every
   * truename/probe-file/directory fail), ENOENT for missing ones */
  w.path_readlink = function (fd, pathPtr, pathLen, bufPtr, bufLen, usedPtr) {
    var base = dirBase(fd)
    if (base === null) return ERR.BADF
    var e = vfsLookup(normPath(base + readPath(pathPtr, pathLen)))
    if (!e) return ERR.NOENT
    return ERR.INVAL
  }
  w.path_symlink = function () { return ERR.NOSYS }
  w.path_link = function () { return ERR.NOSYS }

  /* subscription (48 bytes): userdata u64, u8 tag@8; union@16:
   * clock.timeout u64@16, fd u32@16. event (16 bytes): userdata u64,
   * errno u16@8, type u8@10 (0 fd_read, 1 fd_write, 2 clock). */
  w.poll_oneoff = function (inPtr, outPtr, nsubs, neventsPtr) {
    checkInterrupts()
    var dv = memDV()
    var u8 = memU8()
    var subs = []
    for (var i = 0; i < nsubs; i++) {
      var sub = inPtr + 48 * i
      subs.push({
        userdata: dv.getBigUint64(sub, true),
        tag: u8[sub + 8],
        when: Number(dv.getBigUint64(sub + 16, true)),
      })
    }
    function stdFdReady(sfd) {
      if (sfd !== 0) return true /* our file/cc-stdin reads never block */
      if (stdinBacklog !== null && stdinBacklog.src === 'form') return true
      return Atomics.load(sabI32, 0) !== Atomics.load(sabI32, 1)
    }
    for (;;) {
      var events = 0
      var out = outPtr
      var waitFd0 = false
      var timerWhen = 0
      for (var k = 0; k < subs.length; k++) {
        var s = subs[k]
        if (s.tag === 0) { /* clock */
          if (s.when <= performance.now() * 1e6) {
            dv.setBigUint64(out, s.userdata, true)
            dv.setUint16(out + 8, 0, true)
            u8[out + 10] = 2
            out += 16
            events++
          } else if (timerWhen === 0 || s.when < timerWhen) timerWhen = s.when
        } else if (s.tag === 1) { /* fd read */
          var sfd = s.when /* the union overlaps: fd reads use the u32 at +16 */
          if (stdFdReady(sfd | 0)) {
            dv.setBigUint64(out, s.userdata, true)
            dv.setUint16(out + 8, 0, true)
            u8[out + 10] = 0
            out += 16
            events++
          } else if ((sfd | 0) === 0) waitFd0 = true
        } else { /* fd write and friends: always ready */
          dv.setBigUint64(out, s.userdata, true)
          dv.setUint16(out + 8, 0, true)
          u8[out + 10] = 1
          out += 16
          events++
        }
      }
      if (events > 0 || (!waitFd0 && timerWhen === 0)) {
        dv.setUint32(neventsPtr, events, true)
        return ERR.NONE
      }
      /* nothing ready: an fd-0 wait (the REPL waiting for a form) and/or
       * a timer — park on the mailbox flag in bounded slices so requests
       * and interrupts still get through, then re-evaluate */
      var pr = mailboxTake()
      if (pr) {
        /* a request arrived while we park: an eval/load/quit feeds the
         * form ring (that is exactly fd0-readiness); input/restart go to
         * the stdin ring. Without this the poll parks holding the only
         * notify — its wakeup was already consumed — and the form
         * starves until some later request happens along */
        try { console.log('[cc] poll-drain ' + pr.type + ' id=' + pr.id) } catch (e) {}
        handleRequest(pr)
        continue
      }
      var waitMs = 200
      if (timerWhen > 0) {
        var remainMs = (timerWhen - performance.now() * 1e6) / 1e6
        if (remainMs <= 0) continue /* the clock fired on re-evaluation */
        waitMs = Math.min(waitMs, Math.max(remainMs, 1))
      }
      Atomics.wait(sabI32, 4, 0, waitMs)
      checkInterrupts()
    }
  }

  w.proc_exit = function (code) {
    throw { __ccProcExit: code | 0 }
  }
  w.sched_yield = function () { return ERR.NONE }

  /* debug: trace WASI calls while booting (__ccSbclTrace) */
  var traceBudget = 1e9 /* effectively unbounded; CC_SBCL_TRACE is a debug tool */
  if (typeof self.__ccSbclTrace === 'function') {
    Object.keys(w).forEach(function (k) {
      var orig = w[k]
      w[k] = function () {
        var r
        try {
          r = orig.apply(null, arguments)
        } finally {
          if (traceBudget-- > 0) {
            try { self.__ccSbclTrace(k) } catch (e2) { /* never let tracing break the call */ }
          }
        }
        return r
      }
    })
  }

  return w
}

/* ------------------------------------------------------------------ */
/* sbcl_host imports (the port's contract — SBCL-Handoff.md §4.2)       */
/* ------------------------------------------------------------------ */

var unwindTag = null
var lispInstances = [] /* keep every Lisp module alive: their functions live in the shared table */

function hostInstantiate(ptr, len, regArea, tableBase) {
  if (typeof self.__ccSbclTrace === 'function') {
    try { self.__ccSbclTrace('instantiate: ' + len + ' bytes at table ' + tableBase) } catch (e) { /* debug */ }
  }
  var u8 = new Uint8Array(mem(), ptr, len)
  var bytes = u8.slice() /* copy: the heap may grow/move while we compile */
  var mod = new WebAssembly.Module(bytes) /* sync — the runtime waits for us */
  var sections = WebAssembly.Module.customSections(mod, 'sbcl.core.table')
  if (sections.length === 0) throw new Error('Lisp module has no sbcl.core.table section')
  var sv = new DataView(sections[0])
  var base = sv.getUint32(0, true)
  var count = sv.getUint32(4, true)
  if (base !== tableBase) throw new Error('module table base ' + base + ' != expected ' + tableBase)
  registerArea = regArea
  var table = wasm.exports.__indirect_function_table
  var needed = base + count
  if (table.length < needed) table.grow(needed - table.length)
  if (!unwindTag) unwindTag = new WebAssembly.Tag({ parameters: [] })
  var imports = {
    env: {
      memory: wasm.exports.memory,
      __indirect_function_table: table,
      thread: new WebAssembly.Global({ value: 'i32', mutable: false }, regArea),
      table_base: new WebAssembly.Global({ value: 'i32', mutable: false }, base),
      lisp_unwind: unwindTag,
      internal_error: wasm.exports.internal_error,
      alloc: wasm.exports.alloc,
      alloc_list: wasm.exports.alloc_list,
      pending_interrupt: wasm.exports.pending_interrupt,
    },
    table: {}, /* filled from the module's imports: decimal table indexes */
  }
  WebAssembly.Module.imports(mod).forEach(function (im) {
    if (im.module === 'table') imports.table[im.name] = table.get(parseInt(im.name, 10))
  })
  var instance = new WebAssembly.Instance(mod, imports)
  lispInstances.push(instance)
  return 1
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

/* Sprint 24: a gzip'd copy next to an artifact (scripts/fetch-sbcl.mjs
 * --gzip) is fetched first — about a third of the bytes over the wire —
 * and inflated here. A copy the server already decoded (Content-Encoding)
 * arrives without the gzip magic and is used as is; an HTML answer (a SPA
 * fallback for a missing file) is refused; anything else falls back to
 * the plain artifact. */
function isGzip(bytes) {
  var u8 = new Uint8Array(bytes)
  return u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b
}

function gunzipBytes(bytes) {
  if (!isGzip(bytes)) return Promise.resolve(bytes)
  if (typeof DecompressionStream !== 'function') return Promise.reject(new Error('gzip artifact but DecompressionStream is unavailable'))
  var stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

/* Sprint 27: count the bytes of an artifact as they stream in, so the page can show progress */
function progressResponse(r, file) {
  if (!r || !r.ok || !r.body || typeof ReadableStream !== 'function' || typeof Response !== 'function') return r
  var total = Number(r.headers && r.headers.get && r.headers.get('content-length')) || null
  var loaded = 0, last = 0
  var reader = r.body.getReader()
  var stream = new ReadableStream({
    pull: function (controller) {
      return reader.read().then(function (res) {
        if (res.done) {
          controller.close()
          self.postMessage({ type: 'progress', file: file, loaded: loaded, total: total || loaded })
          return
        }
        loaded += res.value.byteLength
        var now = Date.now()
        if (now - last > 80) { last = now; self.postMessage({ type: 'progress', file: file, loaded: loaded, total: total }) }
        controller.enqueue(res.value)
      })
    },
    cancel: function () { return reader.cancel() },
  })
  return new Response(stream, { status: r.status, statusText: r.statusText, headers: r.headers })
}

function fetchGzipArtifact(path) {
  return fetch(path + '.gz').then(function (r0) {
    var r = progressResponse(r0, path.split('/').pop() + '.gz')
    if (!r.ok) return null
    var type = String(r.headers && r.headers.get ? r.headers.get('content-type') || '' : '')
    return r.arrayBuffer().then(function (bytes) {
      if (!isGzip(bytes) && /text\/html/i.test(type)) return null /* SPA fallback page, not an artifact */
      return gunzipBytes(bytes)
    })
  }).catch(function () { return null })
}

function loadArtifactBytes(path) {
  /* harness hook: Node can hand us the bytes without fetch */
  if (typeof self.__ccSbclLoadBytes === 'function') return Promise.resolve(self.__ccSbclLoadBytes(path))
  return fetchGzipArtifact(path).then(function (bytes) {
    if (bytes) return bytes
    return fetch(path).then(function (r0) {
      var r = progressResponse(r0, path.split('/').pop())
      if (!r.ok) throw new Error(path + ' → HTTP ' + r.status)
      return r.arrayBuffer()
    })
  })
}

function boot() {
  phase = 'loading'
  var artifactBase = typeof self.__CC_SBCL_BASE === 'string' ? self.__CC_SBCL_BASE : '/sbcl/'
  bootLine('SBCL/wasm host boot — fetching ' + artifactBase + '{sbcl.wasm,sbcl.core,sbcl-core.wasm} (.gz copies first, ~19 MB; ~124 MB inflated)')
  var runtimeBytes, coreBytes, coreModuleBytes
  var bootT0 = Date.now()
  /* Sprint 26: one line per artifact as it lands, so a slow fetch shows progress in the boot log */
  var fetched = function (name, b) {
    bootLine('  ' + name + ': ' + (b.byteLength / 1e6).toFixed(1) + ' MB inflated, ' + ((Date.now() - bootT0) / 1000).toFixed(1) + ' s so far')
    return b
  }
  loadArtifactBytes(artifactBase + 'sbcl.wasm')
    .then(function (b) {
      runtimeBytes = fetched('sbcl.wasm', b)
      return loadArtifactBytes(artifactBase + 'sbcl.core')
    })
    .then(function (b) {
      coreBytes = fetched('sbcl.core', b)
      return loadArtifactBytes(artifactBase + 'sbcl-core.wasm')
    })
    .then(function (b) {
      coreModuleBytes = fetched('sbcl-core.wasm', b)
      bootLine('artifacts loaded (' +
        ((runtimeBytes.byteLength + coreBytes.byteLength + coreModuleBytes.byteLength) / 1e6).toFixed(1) +
        ' MB in ' + ((Date.now() - bootT0) / 1000).toFixed(1) + ' s) — instantiating the runtime')

      vfsWriteFile('/sbcl/sbcl.core', new Uint8Array(coreBytes))
      vfsWriteFile('/sbcl/sbcl-core.wasm', new Uint8Array(coreModuleBytes))

      /* runtime options (--core, --dynamic-space-size) must precede the
       * toplevel ones (--noinform …) or the runtime refuses the mix */
      ARGS = ['sbcl.wasm', '--core', '/sbcl/sbcl.core', '--dynamic-space-size', '512',
        '--noinform', '--no-sysinit', '--no-userinit', '--disable-debugger']
      ENVS = ['PWD=/', 'HOME=/', 'SBCL_WASM_HOST=sbcl-worker', 'SBCL_WASM_RUNTIME=/sbcl/sbcl.wasm']

      var mod = new WebAssembly.Module(new Uint8Array(runtimeBytes))
      wasm = new WebAssembly.Instance(mod, {
        wasi_snapshot_preview1: makeWasi(),
        sbcl_host: {
          instantiate: hostInstantiate,
          set_timer: function (usec) {
            /* the import is i64: usec arrives as a BigInt */
            var us = Number(usec)
            timerDeadline = us > 0 ? Date.now() + us / 1000 : 0
          },
          run_process: function () { return -1 }, /* no subprocesses in a browser */
          process_id: function () { return 1 },
        },
        env: {
          madvise: function () { return 0 },
          list_lisp_threads: function () { return 0 },
          generate_elfcore_obj: function () { return 0 },
        },
      })

      /* seed the form channel: the helper, then a verification eval; both
       * end in ;;CC-DONE, which drives bootstrapDone above.
       * The helper must be READ FORM BY FORM (like the wecl bootstrap):
       * the whole fed form is read before it runs, so (in-package :cc)
       * inside it could never affect the reader otherwise. */
      phase = 'helper'
      feedForm(withDoneMarker(guardTopLevel(
        '(let ((*package* (find-package :cl-user)))' +
        ' (with-input-from-string (in "' + escapeLispString(SBCL_HELPER_SRC) + '")' +
        '  (loop for f = (handler-case (read in nil :eof)' +
        '                  (serious-condition (e)' +
        '                    (format *error-output* "~&;;BOOT-ERROR: reader: ~A~%" e)' +
        '                    :cc-boot-stop))' +
        '        until (or (eq f :eof) (eq f :cc-boot-stop))' +
        '        do (handler-case (eval f)' +
        '             (serious-condition (e)' +
        '               (format *error-output* "~&;;BOOT-ERROR: eval: ~A~%" e))))))')))
      feedForm(withDoneMarker('(handler-case (cc:eval-string "(+ 1 2)")' +
        '  (serious-condition (e)' +
        '    (format *error-output* "~&;;BOOT-ERROR: verify: ~A~%" e)))'))

      /* the page needs the shared buffer BEFORE we vanish into wasm */
      self.postMessage({ type: 'sbcl-sab', sab: sab })

      var exitCode = 0
      try {
        wasm.exports._start()
      } catch (e) {
        if (e && e.__ccProcExit !== undefined) exitCode = e.__ccProcExit
        else {
          /* a trap after ready is a crash (runtime.ts resolves live jobs),
           * during bootstrap it is a bootfail (fallback ladder) */
          if (phase === 'run') self.postMessage({ type: 'crash', message: String(e && e.message || e) })
          else failBoot('image exited during bootstrap: ' + String(e && (e.stack || e.message) || e))
          return
        }
      }
      if (exitCode !== 0 && phase !== 'run') {
        failBoot('image exited with code ' + exitCode + ' during bootstrap')
        return
      }
      self.postMessage({ type: 'crash', message: 'SBCL image exited (code ' + exitCode + ')' })
    })
    .catch(function (e) {
      failBoot(String(e && e.message || e))
    })
}

/* After boot this worker NEVER processes onmessage (the thread is inside
 * wasm); every input arrives through the shared buffer. */
self.onmessage = null

boot()
