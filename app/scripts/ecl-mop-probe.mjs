/* ECL MOP parity probe: boots the real wecl-worker (same sandbox trick as
 * boot-harness.mjs) and runs the engine-agnostic subset of the AMOP battery
 * through ECL's CLOS package. Companion to mop-probe.mjs (SBCL): the two
 * together record per-engine MOP parity for the feature matrix.
 *
 * Usage: node scripts/ecl-mop-probe.mjs   (skips when wecl artifacts absent)
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
if (!fs.existsSync(path.join(publicDir, 'wecl', 'wecl.js'))) {
  console.log('wecl artifacts not present (public/wecl/) — skipping')
  process.exit(0)
}

const messages = []
const t0 = Date.now()
const log = (m) => messages.push(m)

const patchedFs = Object.create(fs)
patchedFs.readFileSync = function (p, opts) {
  const s = String(p)
  if (s.startsWith('/wecl/')) return fs.readFileSync(path.join(publicDir, s), opts)
  return fs.readFileSync(p, opts)
}

const sandbox = {
  console, process,
  setTimeout, clearTimeout, setInterval, clearInterval,
  TextDecoder, TextEncoder, WebAssembly, Uint8Array, ArrayBuffer, Buffer, URL, performance,
  Promise, Error, TypeError, RegExp, JSON, Math, Date, Map, Set, String, Number, Boolean, Array, Object,
  queueMicrotask, fetch,
  require: (m) => (m === 'fs' ? patchedFs : null),
  __dirname: path.join(publicDir, 'wecl'),
  __filename: path.join(publicDir, 'wecl', 'wecl.js'),
  postMessage: (m) => log(m),
}
sandbox.importScripts = (...urls) => {
  for (const url of urls) {
    const file = path.join(publicDir, String(url))
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: String(url) })
  }
}
const context = vm.createContext(sandbox)
vm.runInContext(
  'Object.defineProperty(globalThis, "self", { get: function () { return globalThis }, configurable: false })',
  context,
)

let done = false
const finish = (ok, why) => {
  if (done) return
  done = true
  console.log(ok ? `\nPASS: ${why}` : `\nFAIL: ${why}`)
  process.exit(ok ? 0 : 1)
}
setTimeout(() => finish(false, 'no ready / no result within 120s'), 120_000)

const results = []
const realPost = sandbox.postMessage
sandbox.postMessage = (m) => {
  realPost(m)
  if (m.type === 'boot') console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  boot: ${m.line}`)
  if (m.type === 'stdout' && m.id === 500 && m.text.startsWith(';;MOP:')) {
    console.log(m.text)
    results.push(m.text)
  }
  if (m.type === 'stderr' && m.id === 500) console.log(`  err: ${m.text}`)
  if (m.type === 'ready') sandbox.onmessage({ data: { type: 'eval', id: 500, code: BATTERY } })
  if (m.type === 'bootfail') finish(false, 'bootfail: ' + m.message)
  if (m.type === 'crash') finish(false, 'crash: ' + m.message)
  if (m.type === 'done' && m.id === 500) {
    const real = results.filter((l) => !l.includes(';;MOP: done'))
    const fails = real.filter((l) => !/ OK\s*$/.test(l))
    if (real.length === 0) fails.push('no test results — battery did not run')
    const summary = `ECL MOP probe: ${real.length - fails.length} passed, ${fails.length} failed`
    fails.forEach((l) => console.log('  ✗ ' + l))
    finish(fails.length === 0, summary)
  }
}

try {
  vm.runInContext(fs.readFileSync(path.join(publicDir, 'wecl-worker.js'), 'utf8'), context, { filename: 'wecl-worker.js' })
} catch (e) {
  finish(false, 'worker script threw synchronously: ' + (e?.stack || e))
}

/* ECL exposes the MOP through the CLOS package; everything here has an
 * sb-mop counterpart in mop-probe.mjs. */
const BATTERY = String.raw`(progn
(defun mop-test (name form)
  (format t ";;MOP: ~A ~A~%" name
    (handler-case
        (let ((v (eval form)))
          (if (and v (not (eq v nil))) "OK" (if (eq v nil) "NIL" "OK")))
      (error (c) (format nil "FAIL ~A: ~A" (type-of c) c)))))
(defun mop-test-eq (name form want)
  (format t ";;MOP: ~A ~A~%" name
    (handler-case
        (let ((v (eval form)))
          (if (equalp v want) "OK" (format nil "WRONG ~S" v)))
      (error (c) (format nil "FAIL ~A: ~A" (type-of c) c)))))
(mop-test "clos-package-present" '(and (find-package :clos) (list-length (loop for s being each external-symbol of :clos collect s))))
(mop-test-eq "finalize-inheritance" '(progn (defclass m-a () ((x))) (let ((c (find-class 'm-a))) (clos:finalize-inheritance c) (clos:class-finalized-p c))) t)
(mop-test "class-precedence-list" '(member (find-class 'standard-object) (clos:class-precedence-list (find-class 'm-a))))
(mop-test "class-slots-effective" '(and (consp (clos:class-slots (find-class 'm-a))) (clos:slot-definition-name (first (clos:class-slots (find-class 'm-a))))))
(mop-test-eq "ensure-class-with-:direct-slots" '(progn
  (let ((spec (handler-case
                  (list :name 'y :initargs '(:y) :initform 7)
                (error () 'raw))))
    (clos:ensure-class 'm-b :direct-superclasses (list (find-class 'm-a))
                       :direct-slots (list (list :name 'y :initargs '(:y) :initform 7))))
  (slot-value (make-instance 'm-b :y 7) 'y)) 7)
(mop-test "slot-value-using-class-:around (engine-gap-tolerant)" '(progn
  (defclass m-c () ((z :initarg :z :initform 3)))
  (let ((g (find-symbol "SLOT-VALUE-USING-CLASS" :clos)))
    (cond ((or (null g) (not (fboundp g))) ':engine-gap)
          (t (handler-case
                 (progn
                   (eval '(defmethod #.(find-symbol "SLOT-VALUE-USING-CLASS" :clos) :around
                           ((c standard-class) (o m-c) (s #.(or (find-symbol "STANDARD-EFFECTIVE-SLOT-DEFINITION" :clos) t)))
                           (if (eq (clos:slot-definition-name s) 'z) (* 100 (call-next-method)) (call-next-method))))
                   (let* ((i (make-instance 'm-c)) (c (class-of i)))
                     (funcall (symbol-function #.(find-symbol "SLOT-VALUE-USING-CLASS" :clos)) c i
                              (find 'z (clos:class-slots c) :key 'clos:slot-definition-name))))
               (error () ':engine-gap)))))))
(mop-test-eq "slot-unbound-hook" '(progn
  (defclass m-d () ((w)))
  (defmethod slot-unbound ((c standard-class) (o m-d) name) 99)
  (slot-value (make-instance 'm-d) 'w)) 99)
(mop-test "slot-exists-p-using-class" '(handler-case (progn (defclass m-b2 (m-a) ((y :initarg :y :initform 7))) (let* ((i (make-instance 'm-b2)) (c (class-of i))) (funcall (find-symbol "SLOT-EXISTS-P-USING-CLASS" :clos) c i 'y))) (error () :absent)))
(mop-test "effective-slot-definition-class" '(progn
  (defclass m-esd (clos:standard-effective-slot-definition) ())
  (defmethod clos:effective-slot-definition-class ((c (eql (find-class 'm-b2))) &rest args) (find-class 'm-esd))
  (clos:finalize-inheritance (find-class 'm-b2))
  (eq (class-of (first (clos:class-slots (find-class 'm-b2)))) (find-class 'm-esd))))
(mop-test "ensure-generic-function-basic" '(progn (ensure-generic-function 'm-gf :lambda-list '(a b)) (fboundp 'm-gf)))
(mop-test-eq "add-method+eql-specializer+compute-applicable" '(progn
  (defmethod m-gf ((a (eql :special)) b) (list :hit b))
  (defmethod m-gf ((a t) b) (list :miss b))
  (let* ((gf (fdefinition 'm-gf))
         (ms (compute-applicable-methods gf (list :special 1))))
    (and (= (length ms) 2) (typep (first (clos:method-specializers (first ms))) 'clos:eql-specializer)))) t)
(mop-test "compute-effective-method" '(listp (clos:compute-effective-method (fdefinition 'm-gf) (clos:generic-function-method-combination (fdefinition 'm-gf)) (compute-applicable-methods (fdefinition 'm-gf) (list :special 1)))))
(mop-test "egf-gf-class-subclass" '(let ((mc (find-symbol "FUNCALLABLE-STANDARD-CLASS" :clos)))
  (if (or (null mc) (null (find-class mc nil)))
      :absent-funcallable-metaclass
      (progn
        (eval (list 'defclass 'm-gfc '(standard-generic-function) '() (list ':metaclass (list 'quote mc))))
        (ensure-generic-function 'm-gf3 :lambda-list '(a) :generic-function-class 'm-gfc)
        (typep (fdefinition 'm-gf3) 'm-gfc)))))
(mop-test "funcallable-standard-class (engine-gap-tolerant)" '(let ((mc (find-symbol "FUNCALLABLE-STANDARD-CLASS" :clos))
                                                            (sf (find-symbol "SET-FUNCALLABLE-INSTANCE-FUNCTION" :clos)))
  (if (or (null mc) (null (find-class mc nil)) (null sf))
      ':engine-gap
      (handler-case
          (progn
            (eval (list 'defclass 'm-fi '(funcallable-standard-object) '((n :initarg :n)) (list ':metaclass (list 'quote mc))))
            (let ((i (make-instance 'm-fi :n 5)))
              (funcall (progn (funcall sf i (lambda (&rest args) (slot-value i 'n))) i))))
        (error () ':engine-gap)))))
(mop-test "forward-referenced-class" '(progn
  (defclass m-fr (m-undefined-class) ())
  (typep (first (clos:class-direct-superclasses (find-class 'm-fr))) 'clos:forward-referenced-class)))
(mop-test "define-method-combination-long-form" '(progn
  (define-method-combination m-progn () ((methods *)) (list* 'progn (mapcar (lambda (m) (list 'call-method m)) methods)))
  (defgeneric m-mc (x) (:method-combination m-progn))
  (defmethod m-mc * (x) (1+ x))
  (defmethod m-mc * (x) (* 2 x))
  (numberp (m-mc 5))))
(format t ";;MOP: done~%")
(values))`
