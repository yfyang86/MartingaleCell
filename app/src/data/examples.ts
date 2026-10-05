/**
 * MartingaleCell shared snippet catalog.
 *
 * Consumed by the Examples gallery (`/examples`) and by the IDE page via
 * dynamic import (`/ide?example=<slug>`). All snippets are real, runnable
 * ANSI Common Lisp targeting the browser ECL (→ WASM) runtime.
 *
 * `expectedOutput` line conventions (rendered as notebook cells):
 *   ";; OUT …"  stdout line
 *   ";;=> …"    returned value
 *   ";; WARN …" warning
 */

export interface Example {
  slug: string;
  title: string;
  category: string;
  difficulty: 1 | 2 | 3;
  description: string;
  code: string;
  expectedOutput?: string;
}

export const EXAMPLES: Example[] = [
  {
    slug: 'fib-benchmark',
    title: 'Fibonacci, three ways',
    category: 'Basics',
    difficulty: 1,
    description:
      'Recursive, iterative, and memoized Fibonacci with a timing harness.',
    code: `;;;; Fibonacci, three ways — same answer, wildly different cost.

(defun fib-rec (n)
  "Naive doubly-recursive Fibonacci."
  (if (< n 2)
      n
      (+ (fib-rec (- n 1)) (fib-rec (- n 2)))))

(defun fib-iter (n)
  "O(n) iterative version via LOOP."
  (loop repeat n
        with a = 0 and b = 1
        do (psetq a b
                  b (+ a b))
        finally (return a)))

(let ((memo (make-hash-table)))
  (defun fib-memo (n)
    "Memoized: each value computed exactly once."
    (cond ((< n 2) n)
          ((gethash n memo))
          (t (setf (gethash n memo)
                   (+ (fib-memo (- n 1))
                      (fib-memo (- n 2))))))))

(defun bench (label fn n)
  (let ((t0 (get-internal-real-time)))
    (let ((result (funcall fn n)))
      (format t "~&~A(~D) = ~D  [~,3F s]~%"
              label n result
              (/ (- (get-internal-real-time) t0)
                 internal-time-units-per-second)))))

(bench "fib-rec " #'fib-rec 25)
(bench "fib-iter" #'fib-iter 25)
(bench "fib-memo" #'fib-memo 25)`,
    expectedOutput: `;; OUT fib-rec (25) = 75025  [0.693 s]
;; OUT fib-iter(25) = 75025  [0.000 s]
;; OUT fib-memo(25) = 75025  [0.000 s]
;;=> NIL`,
  },
  {
    slug: 'how-fast',
    title: 'How fast is it?',
    category: 'Basics',
    difficulty: 1,
    description:
      'A tiny timing macro and a table of common loops — the bytecodes interpreter, running in WebAssembly.',
    code: `;;;; How fast is the in-browser image? Measure, don't guess.
;;;; Everything here runs through ECL's bytecodes interpreter compiled
;;;; to WebAssembly; a native ECL with a C compiler would be ~50x faster.

(defmacro ms (form)
  "Evaluate FORM, return the wall-clock milliseconds it took."
  \`(let ((t0 (get-internal-real-time)))
     ,form
     (round (* 1000 (- (get-internal-real-time) t0))
            internal-time-units-per-second)))

(defun identity-1 (x) x)

(defun row (label millis)
  (format t "~&~18A ~6D ms~%" label millis))

(row "100k empty loop"  (ms (dotimes (i 100000))))
(row "100k incf"        (ms (let ((n 0)) (dotimes (i 100000) (incf n i)))))
(row "100k calls"       (ms (let ((n 0)) (dotimes (i 100000) (setq n (identity-1 i))))))
(row "100k loop collect" (ms (length (loop for i below 100000 collect i))))
(row "50k hash inserts" (ms (let ((h (make-hash-table)))
                              (dotimes (i 50000) (setf (gethash i h) i)))))
(row "sort 20k fixnums" (ms (sort (loop repeat 20000 collect (random 1000000)) #'<)))
(row "fib 25, recursive" (ms (labels ((fib (n) (if (< n 2) n (+ (fib (- n 1)) (fib (- n 2))))))
                               (fib 25))))
;; Timings vary with the machine and the browser; the ratios do not.`,
    expectedOutput: `;; OUT 100k empty loop       115 ms
;; OUT 100k incf             330 ms
;; OUT 100k calls            254 ms
;; OUT 100k loop collect     490 ms
;; OUT 50k hash inserts      140 ms
;; OUT sort 20k fixnums      171 ms
;; OUT fib 25, recursive     720 ms`,
  },
  {
    slug: 'lambda-playground',
    title: 'Closures & counters',
    category: 'Basics',
    difficulty: 1,
    description:
      'Make a counter factory; watch closures capture state across cells.',
    code: `;;;; Closures & counters — functions that carry their own state.

(defun make-counter (&key (start 0) (step 1))
  "Return a closure that counts up by STEP from START."
  (let ((n start))
    (lambda ()
      (incf n step))))

;;; Each closure captures its own private N.
(defvar *a* (make-counter))
(defvar *b* (make-counter :start 100 :step -5))

(funcall *a*)   ; first call  => 1
(funcall *a*)   ; second call => 2
(funcall *b*)   ; independent => 95

;;; Compose them: a counter that sums two counters.
(defun sum-counters (&rest counters)
  (lambda ()
    (reduce #'+ counters :key #'funcall)))

(defvar *ab* (sum-counters *a* *b*))
(funcall *ab*)`,
    expectedOutput: `;;=> 1
;;=> 2
;;=> 95
;;=> 98`,
  },
  {
    slug: 'once-only',
    title: 'once-only macro',
    category: 'Macros',
    difficulty: 3,
    description:
      "The macro writer's rite of passage: evaluate each argument form exactly once, with gensyms done right.",
    code: `;;;; once-only — the macro writer's rite of passage.
;;;; Guarantees each argument form is evaluated exactly once,
;;;; in order, and that the bindings are visible to the body.

(defmacro once-only (specs &body body)
  "Evaluate each form once, bind the results."
  (let ((gens (mapcar (lambda (s) (gensym (symbol-name s))) specs)))
    \`(let ,(mapcar (lambda (g s) \`(,g (gensym ,(symbol-name s)))) gens specs)
       \`(let (,,@(mapcar (lambda (g s) \`\`(,,g ,,s)) gens specs))
          ,(let ,(mapcar (lambda (s g) \`(,s ,g)) specs gens)
             ,@body)))))

;;; A square macro that would double-evaluate without once-only:
(defmacro square-naive (x)
  \`(* ,x ,x))

(defmacro square-once (x)
  (once-only (x) \`(* ,x ,x)))

;;; Watch the side effect happen twice vs. once:
(let ((n 3))
  (values (square-naive (incf n)) n))
;;=> 20, 5 — (incf n) ran TWICE

(let ((n 3))
  (values (square-once (incf n)) n))
;;=> 16, 4 — (incf n) ran exactly once`,
    expectedOutput: `;;=> SQUARE-ONCE
;;=> 20
;;=> 5
;;=> 16
;;=> 4`,
  },
  {
    slug: 'anaphoric-if',
    title: 'Anaphoric macros',
    category: 'Macros',
    difficulty: 2,
    description: 'Build aif and awhen; bind "it" like On Lisp.',
    code: `;;;; Anaphoric macros — capture the test value as IT.

(defmacro aif (test then &optional else)
  "Like IF, but the test result is bound to IT in THEN."
  \`(let ((it ,test))
     (if it ,then ,else)))

(defmacro awhen (test &body body)
  "Like WHEN, with the test result bound to IT."
  \`(aif ,test (progn ,@body)))

(defun lookup (key alist)
  (cdr (assoc key alist)))

(defvar *table* '((a . 1) (b . 2) (c . 3)))

;;; IT refers to the looked-up value — no repeated calls.
(aif (lookup 'b *table*)
     (format t "~&found b: ~D (times 10 = ~D)~%" it (* it 10))
     (format t "~&b is missing~%"))

(awhen (lookup 'z *table*)
  (format t "this never prints: ~A~%" it))

;;; Clean fallbacks without LET noise:
(list (aif (lookup 'a *table*) it 'missing)
      (aif (lookup 'z *table*) it 'missing))`,
    expectedOutput: `;; OUT found b: 2 (times 10 = 20)
;;=> (1 MISSING)`,
  },
  {
    slug: 'bank-account',
    title: 'CLOS in 40 lines',
    category: 'CLOS',
    difficulty: 2,
    description:
      'Classes, slots, generic functions, and :before/:after methods modeling a bank account.',
    code: `;;;; CLOS in 40 lines — classes, slots, generic functions, method combos.

(defclass bank-account ()
  ((owner   :initarg :owner   :reader   account-owner)
   (balance :initarg :balance :initform 0
            :accessor account-balance))
  (:documentation "A minimal bank account."))

(defgeneric deposit (account amount)
  (:documentation "Credit AMOUNT to ACCOUNT."))

(defgeneric withdraw (account amount)
  (:documentation "Debit AMOUNT from ACCOUNT, or signal an error."))

(defmethod deposit ((a bank-account) amount)
  (incf (account-balance a) amount))

(defmethod withdraw ((a bank-account) amount)
  (when (> amount (account-balance a))
    (error "Insufficient funds in ~A's account" (account-owner a)))
  (decf (account-balance a) amount))

;;; :before / :after methods run around the primary method —
;;; no explicit call chain required.
(defmethod withdraw :before ((a bank-account) amount)
  (format t "~&Withdrawing ~D from ~A's account…~%"
          amount (account-owner a)))

(defmethod withdraw :after ((a bank-account) amount)
  (declare (ignore amount))
  (format t "New balance: ~D~%" (account-balance a)))

(defvar *acct* (make-instance 'bank-account :owner "Ada" :balance 100))

(deposit *acct* 50)
(withdraw *acct* 30)
(account-balance *acct*)`,
    expectedOutput: `;; OUT Withdrawing 30 from Ada's account…
;; OUT New balance: 120
;;=> 120`,
  },
  {
    slug: 'chemistry',
    title: 'Molecules (chemicl)',
    category: 'Chemistry',
    difficulty: 3,
    description:
      'Bundled chemicl port: build molecules, look up elements, compute formulas and molar masses.',
    code: `;;;; Molecules with the bundled chemicl port (Explorer → Open sample
;;;; project: chemicl). After loading it, evaluate these forms.

;;; the periodic table — element lookup by symbol or atomic number
(list (chemicl:name (chemicl:get-element 26))
      (chemicl:mass (chemicl:get-element "Fe"))
      (chemicl:electronegativity (chemicl:get-element :o)))

;;; water, by hand: two H, one O, two bonds
(defparameter *water*
  (let ((mol (chemicl:make-molecule :name "water")))
    (chemicl:add-atom mol 8 "O")
    (chemicl:add-atom mol 1 "H1")
    (chemicl:add-atom mol 1 "H2")
    (chemicl:add-bond mol "O" "H1")
    (chemicl:add-bond mol "O" "H2")
    mol))

(list (chemicl:molecular-formula *water*)
      (chemicl:mass *water*)
      (chemicl:exact-mass *water*))

;;; caffeine ships with the sample project (init.lisp) — C8H10N4O2
(list (chemicl:molecular-formula *caffeine*)
      (chemicl:mass *caffeine*))

;;; ring perception on cyclohexane
(defparameter *cyclohexane*
  (let ((mol (chemicl:make-molecule :name "cyclohexane")))
    (loop for i from 1 to 6 do (chemicl:add-atom mol 6 (format nil "C~A" i)))
    (loop for i from 1 to 12 do (chemicl:add-atom mol 1 (format nil "H~A" i)))
    (loop for i from 1 to 6
          do (chemicl:add-bond mol
                               (format nil "C~A" (1+ (mod (1- i) 6)))
                               (format nil "C~A" (1+ (mod i 6))))
             (chemicl:add-bond mol (format nil "C~A" i)
                               (format nil "H~A" (1+ (* (1- i) 2))))
             (chemicl:add-bond mol (format nil "C~A" i)
                               (format nil "H~A" (+ (* (1- i) 2) 2))))
    mol))

(list (chemicl:molecular-formula *cyclohexane*)
      (mapcar #'length (chemicl:minimal-rings (chemicl:hanser-rings *cyclohexane*))))`,
    expectedOutput: `;;=> ("iron" 55.845 3.44)
;;=> *WATER*
;;=> ("H2O1" 18.01528 18.010565)
;;=> ("C8H10N4O2" 194.1906)
;;=> *CYCLOHEXANE*
;;=> ("C6H12" (7))`,
  },
  {
    slug: 'mop-toolkit',
    title: 'The Metaobject Protocol',
    category: 'CLOS',
    difficulty: 3,
    description:
      'Proxy slots via slot-value-using-class, custom slot-unbound, funcallable instances, and a programmatic ensure-class.',
    code: `;;;; The Metaobject Protocol — customize CLOS itself.

;;; 1. Proxy slots: an :around method on SLOT-VALUE-USING-CLASS sees every
;;; read of every slot of a standard instance. Multiply one slot by 10.
(defclass temperature ()
  ((celsius :initarg :celsius :initform 0)))

(defmethod sb-mop:slot-value-using-class :around
    ((class standard-class) (obj temperature)
     (slot sb-mop:standard-effective-slot-definition))
  (let ((raw (call-next-method)))
    (if (eq (sb-mop:slot-definition-name slot) 'celsius)
        (* 10 raw)   ; e.g. "tenths of a degree" storage
        raw)))

(defvar *t* (make-instance 'temperature :celsius 21))
(slot-value *t* 'celsius)

;;; 2. slot-unbound — reading a never-set slot can recover, not error.
(defclass cache () ((hit :reader cache-hit) (miss :reader cache-miss)))

(defmethod slot-unbound ((class standard-class) (obj cache) name)
  (declare (ignore class name))
  'cold)

(list (cache-hit (make-instance 'cache))
      (cache-miss (make-instance 'cache)))

;;; 3. programmatic class creation — ENSURE-CLASS with canonicalized
;;; :direct-slots (the wasm build's fix; upstream SBCL rejects this).
(sb-mop:ensure-class 'point
  :direct-superclasses (list (find-class 'standard-object))
  :direct-slots (list (list 'x :initarg :x :initform 0)
                      (list 'y :initarg :y :initform 0)))
(slot-value (make-instance 'point :x 3 :y 4) 'x)

;;; 4. funcallable instances — an object you can CALL.
(defclass predicate-item ()
  ((threshold :initarg :threshold :reader threshold))
  (:metaclass sb-mop:funcallable-standard-class))

(defmethod initialize-instance :after ((p predicate-item) &key)
  (sb-mop:set-funcallable-instance-function
   p (lambda (n) (> n (threshold p)))))

(defparameter *big* (make-instance 'predicate-item :threshold 100))
(mapcar *big* '(20 150 1000))`,
    expectedOutput: `;;=> 210
;;=> (COLD COLD)
;;=> 3
;;=> (NIL T T)`,
  },
  {
    slug: 'shape-dispatch',
    title: 'Multiple dispatch',
    category: 'CLOS',
    difficulty: 3,
    description:
      'Area computation with eql-specializers and call-next-method.',
    code: `;;;; Multiple dispatch — generic functions, eql-specializers, mixins.

(defclass shape ()
  ((name :initarg :name :reader shape-name)))

(defclass circle (shape)
  ((radius :initarg :radius :reader radius)))

(defclass square (shape)
  ((side :initarg :side :reader side)))

(defgeneric area (shape)
  (:documentation "Area of SHAPE, dispatching on its class."))

(defmethod area ((s shape))
  (error "No AREA method for ~A" (shape-name s)))

(defmethod area ((c circle))
  (* pi (expt (radius c) 2)))

(defmethod area ((s square))
  (expt (side s) 2))

;;; An eql-specializer: one *object* (not class) gets its own method.
(defmethod area ((s (eql :unit)))
  1)

;;; A mixin that logs every AREA call via CALL-NEXT-METHOD.
(defclass logged-mixin () ())

(defmethod area :around ((s logged-mixin))
  (let ((result (call-next-method)))
    (format t "~&[logged] area => ~,2F~%" result)
    result))

(defclass logged-circle (logged-mixin circle) ())

(mapc (lambda (s)
        (format t "~A area: ~,2F~%" (shape-name s) (area s)))
      (list (make-instance 'circle :name "circle r=3" :radius 3)
            (make-instance 'square :name "square s=4" :side 4)
            (make-instance 'logged-circle :name "logged r=2" :radius 2)))

(area :unit)`,
    expectedOutput: `;; OUT circle r=3 area: 28.27
;; OUT square s=4 area: 16.00
;; OUT [logged] area => 12.57
;; OUT logged r=2 area: 12.57
;;=> 1`,
  },
  {
    slug: 'restart-demo',
    title: 'Conditions & restarts, live',
    category: 'Conditions',
    difficulty: 2,
    description:
      'Signal an error, then resume with use-value — the demo that sells Common Lisp.',
    code: `;;;; Conditions & restarts — error handling without unwinding.

(define-condition not-a-number (error)
  ((text :initarg :text :reader nan-text))
  (:report (lambda (c stream)
             (format stream "Not a number: ~A" (nan-text c)))))

(defun parse-or-restart (text)
  "Parse TEXT as an integer; offer a USE-VALUE restart on failure."
  (restart-case
      (let ((n (parse-integer text :junk-allowed t)))
        (unless n
          (error 'not-a-number :text text))
        n)
    ;; Restarts live *inside* the failing context — the stack
    ;; is still intact when a handler chooses one.
    (use-value (value)
      :report "Supply a value to use instead."
      :interactive (lambda ()
                     (format t "~&Value to use: ")
                     (list (read)))
      value)))

;;; A low-level handler picks the restart; the computation resumes.
(handler-bind ((not-a-number
                (lambda (c)
                  (format t "~&[handler] caught: ~A — restarting with 0~%" c)
                  (invoke-restart 'use-value 0))))
  (list (parse-or-restart "42")
        (parse-or-restart "oops")
        (parse-or-restart "7")))`,
    expectedOutput: `;; OUT [handler] caught: Not a number: oops — restarting with 0
;;=> (42 0 7)`,
  },
  {
    slug: 'handler-bind-chain',
    title: 'handler-bind vs handler-case',
    category: 'Conditions',
    difficulty: 3,
    description:
      "See why handler-bind doesn't unwind, with a running log of the difference.",
    code: `;;;; handler-bind vs handler-case — the unwind, visualized.

(defvar *trace* '())

(defun note (fmt &rest args)
  (push (apply #'format nil fmt args) *trace*))

(defvar *marker* :top-level
  "Dynamic state we inspect from inside handlers.")

(defun risky ()
  (let ((*marker* :deep-inside))
    (note "risky: about to signal (*marker* = ~A)" *marker*)
    (error "boom")))

;;; HANDLER-BIND runs the handler BEFORE the stack unwinds,
;;; so *marker* is still rebound — restarts are still available.
(defun demo-bind ()
  (setq *trace* '())
  (restart-case
      (handler-bind
          ((error (lambda (c)
                    (note "bind-handler: saw ~A (*marker* still ~A)"
                          c *marker*)
                    (invoke-restart 'skip-risky))))
        (risky))
    (skip-risky () (note "restart: recovered in place")))
  (nreverse *trace*))

;;; HANDLER-CASE unwinds first; the clause sees top-level state.
(defun demo-case ()
  (setq *trace* '())
  (handler-case (risky)
    (error (c)
      (note "case-handler: saw ~A (*marker* back to ~A)"
            c *marker*)))
  (nreverse *trace*))

(format t "~&--- handler-bind ---~%~{~A~%~}" (demo-bind))
(format t "~&--- handler-case ---~%~{~A~%~}" (demo-case))`,
    expectedOutput: `;; OUT --- handler-bind ---
;; OUT risky: about to signal (*marker* = DEEP-INSIDE)
;; OUT bind-handler: saw boom (*marker* still DEEP-INSIDE)
;; OUT restart: recovered in place
;; OUT --- handler-case ---
;; OUT risky: about to signal (*marker* = DEEP-INSIDE)
;; OUT case-handler: saw boom (*marker* back to TOP-LEVEL)
;;=> NIL`,
  },
  {
    slug: 'quicksort',
    title: 'Quicksort with multiple values',
    category: 'Algorithms',
    difficulty: 1,
    description:
      'Partition returns two values; the session cell shows both.',
    code: `;;;; Quicksort with multiple values — PARTITION splits in one pass.

(defun partition (pivot list)
  "Return two values: items <= PIVOT, then items > PIVOT."
  (loop for x in list
        if (<= x pivot)
          collect x into lows
        else
          collect x into highs
        finally (return (values lows highs))))

(defun quicksort (list)
  (if (or (null list) (null (cdr list)))
      list
      (multiple-value-bind (lows highs)
          (partition (car list) (cdr list))
        (append (quicksort lows)
                (list (car list))
                (quicksort highs)))))

;;; MULTIPLE-VALUE-BIND receives both values at once —
;;; no pair allocation, no destructuring ceremony.
(multiple-value-bind (lo hi) (partition 5 '(3 9 1 5 7 2))
  (format t "~&pivot 5 -> lows ~A, highs ~A~%" lo hi))

(quicksort '(3 9 1 5 7 2 8 4 6))`,
    expectedOutput: `;; OUT pivot 5 -> lows (3 1 5 2), highs (9 7)
;;=> (1 2 3 4 5 6 7 8 9)`,
  },
  {
    slug: 'primes-sieve',
    title: 'Sieve of Eratosthenes',
    category: 'Algorithms',
    difficulty: 2,
    description: 'Bit-vector sieve, then format the 10,000th prime.',
    code: `;;;; Sieve of Eratosthenes — one bit per candidate number.

(defun primes-up-to (limit)
  "Return all primes <= LIMIT using a bit-vector sieve."
  (let ((sieve (make-array (1+ limit)
                           :element-type 'bit
                           :initial-element 1)))
    (setf (sbit sieve 0) 0
          (sbit sieve 1) 0)
    (loop for i from 2 to (isqrt limit)
          when (= 1 (sbit sieve i))
            do (loop for j from (* i i) to limit by i
                     do (setf (sbit sieve j) 0)))
    (loop for i from 2 to limit
          when (= 1 (sbit sieve i))
            collect i)))

(defun nth-prime (n)
  "The Nth prime, bounding the sieve via Rosser's theorem."
  (let* ((ln (log n))
         (bound (ceiling (* n (+ ln (log ln))))))
    (nth (1- n) (primes-up-to bound))))

(format t "~&First 10 primes: ~A~%" (subseq (primes-up-to 30) 0 10))
(format t "The 10,000th prime is ~:D~%" (nth-prime 10000))
(nth-prime 10000)`,
    expectedOutput: `;; OUT First 10 primes: (2 3 5 7 11 13 17 19 23 29)
;; OUT The 10,000th prime is 104,729
;;=> 104729`,
  },
  {
    slug: 'format-cookbook',
    title: 'FORMAT, the whole cookbook',
    category: 'Format & Loop',
    difficulty: 2,
    description:
      '~R, ~:D, ~{~} iteration, conditional newlines — output streams into the OUT block.',
    code: `;;;; FORMAT — a whole text engine in one function.

;;; ~R spells numbers as English words:
(format t "~&~R plus ~R makes ~R.~%" 2 2 4)

;;; ~:D groups digits with commas:
(format t "~:D~%" 104729)

;;; ~F prints fixed-width floats:
(format t "pi ≈ ~10,3F~%" pi)

;;; ~A prints anything readably-for-humans, ~S readably-for-lisp:
(format t "~A vs ~S~%" "hello" "hello")

;;; ~{ ~} iterates a list; ~^ stops the separator at the end:
(format t "~{~A~^, ~}~%" '(:red :green :blue))
(format t "~{~A = ~D~^; ~}~%" '(:one 1 :two 2 :three 3))

;;; ~[ ~] conditional, ~* argument jumping:
(format t "~:[odd~;even~]: ~{~D~^ ~}~%" (evenp 4) '(1 2 3 4))

;;; With NIL as the stream, FORMAT returns a string:
(format t "nested => ~A~%"
        (format nil "captured ~S at ~D" "text" 42))`,
    expectedOutput: `;; OUT two plus two makes four.
;; OUT 104,729
;; OUT pi ≈      3.142
;; OUT hello vs "hello"
;; OUT RED, GREEN, BLUE
;; OUT ONE = 1; TWO = 2; THREE = 3
;; OUT even: 1 2 3 4
;; OUT nested => captured "text" at 42
;;=> NIL`,
  },
  {
    slug: 'loop-tour',
    title: 'A LOOP grand tour',
    category: 'Format & Loop',
    difficulty: 2,
    description: 'collect, sum, maximize, hash-table iteration, finally clauses.',
    code: `;;;; A LOOP grand tour — the embedded iteration language.

;;; collect / sum / maximize:
(loop for i from 1 to 10 collect (* i i))
(loop for i from 1 to 100 sum i)
(loop for x in '(3 9 4 1 7) maximize x)

;;; conditional accumulation:
(loop for x in '(a 1 b 2 c 3)
      when (numberp x) count x)

;;; hash-table iteration:
(let ((h (make-hash-table)))
  (setf (gethash 'lisp h) 1958
        (gethash 'wasm h) 2017)
  (loop for k being each hash-key of h using (hash-value v)
        collect (cons k v)))

;;; across vectors, with a finally clause returning two values:
(loop for x across #(2 7 1 8)
      minimizing x into lo
      maximizing x into hi
      finally (return (values lo hi)))

;;; destructuring over a plist, two at a time:
(loop for (k v) on '(:a 1 :b 2 :c 3) by #'cddr
      collect (list k v))`,
    expectedOutput: `;;=> (1 4 9 16 25 36 49 64 81 100)
;;=> 5050
;;=> 9
;;=> 3
;;=> ((WASM . 2017) (LISP . 1958))
;;=> 1
;;=> 8
;;=> ((:A 1) (:B 2) (:C 3))`,
  },
  {
    slug: 'tower-of-hanoi',
    title: 'Tower of Hanoi, visualized',
    category: 'Algorithms',
    difficulty: 2,
    description:
      'Solve the puzzle, log every move, then chart how the peg heights dance — with cl-plot when loaded.',
    code: `;;;; Tower of Hanoi — solve it, print it, then chart it.
;;;; 2^N - 1 moves, the smallest disk dancing 2^(N-1) times.

(defparameter *n* 4 "Disks on peg A — expect (expt 2 *n*) - 1 moves.")

(defparameter *pegs* nil)                 ; three lists, biggest disk first
(defparameter *moves* 0)
(defparameter *moves-by-disk* (make-hash-table))
(defparameter *history* nil)              ; snapshots: (move hA hB hC)

(defun snapshot ()
  (push (list *moves*
              (length (first *pegs*))
              (length (second *pegs*))
              (length (third *pegs*)))
        *history*))

(defun show-pegs (tag)
  (format t "~&~A: A=~A B=~A C=~A~%"
          tag (first *pegs*) (second *pegs*) (third *pegs*)))

(defun move-disk (from to)
  (let ((disk (pop (nth from *pegs*))))
    (push disk (nth to *pegs*))
    (incf *moves*)
    (incf (gethash disk *moves-by-disk* 0))
    (format t "move ~2,'0D: disk ~D  ~A -> ~A~%"
            *moves* disk (aref #(a b c) from) (aref #(a b c) to))
    (snapshot)))

(defun hanoi (n from to via)
  "Move N disks FROM -> TO, using VIA as spare. The classic recursion."
  (when (> n 0)
    (hanoi (1- n) from via to)
    (move-disk from to)
    (hanoi (1- n) via to from)))

(defun solve-hanoi ()
  (setq *pegs* (list (loop for i from 1 to *n* collect i) nil nil) ; disk 1 on top
        *moves* 0
        *moves-by-disk* (make-hash-table)
        *history* nil)
  (snapshot)
  (show-pegs "before")
  (hanoi *n* 0 2 1)                       ; A -> C via B
  (show-pegs "after ")
  (format t "~&~D moves — 2^~D-1, as advertised.~%" *moves* *n*)
  (format t "moves per disk: ~{~A~^, ~}~%"
          (loop for d from 1 to *n*
                collect (format nil "disk~D=~D" d (gethash d *moves-by-disk*)))))

(solve-hanoi)

;;; Visualization: chart the peg heights over the whole run.
;;; Requires cl-plot: Projects -> "Try it: cl-plot" -> Load Project into
;;; Runtime — or (package-install "cl-plot") once, and after any reload
;;; (package-load "cl-plot") — then re-run this cell.
;;; NB: cl-plot's sources carry no IN-PACKAGE, so after loading, its
;;; symbols (FIGURE, SCATTER, SHOW, ...) live in CL-USER — the session
;;; package. No CL-PLOT: prefixes anywhere (the reader would reject
;;; them before this guard could run).
(if (and (find-symbol "SCATTER") (find-class 'figure nil))
    (let ((fig (make-instance 'figure)))
      (title fig "Tower of Hanoi (n=4): peg heights over 15 moves")
      (xlabel fig "move")
      (ylabel fig "disks on peg")
      (dolist (col '(1 2 3))
        (scatter fig
                 (loop for row in (nreverse *history*)
                       collect (list (first row) (nth col row)))
                 :with "lines"))
      (show fig))
    (format t "~&[chart skipped] load the cl-plot sample project (Load Project into Runtime) to see the pegs dance~%"))`,
    expectedOutput: `;; OUT before: A=(1 2 3 4) B=NIL C=NIL
;; OUT move 01: disk 1  A -> B
;; OUT move 02: disk 2  A -> C
;; OUT move 03: disk 1  B -> C
;; OUT move 04: disk 3  A -> B
;; OUT move 05: disk 1  C -> A
;; OUT move 06: disk 2  C -> B
;; OUT move 07: disk 1  A -> B
;; OUT move 08: disk 4  A -> C
;; OUT move 09: disk 1  B -> C
;; OUT move 10: disk 2  B -> A
;; OUT move 11: disk 1  C -> A
;; OUT move 12: disk 3  B -> C
;; OUT move 13: disk 1  A -> B
;; OUT move 14: disk 2  A -> C
;; OUT move 15: disk 1  B -> C
;; OUT after : A=NIL B=NIL C=(1 2 3 4)
;; OUT 15 moves — 2^4-1, as advertised.
;; OUT moves per disk: disk1=8, disk2=4, disk3=2, disk4=1
;;=> NIL`,
  },
  {
    slug: 'matrix-terminal',
    title: 'Matrix effect on the ANSI screen',
    category: 'Algorithms',
    difficulty: 2,
    description:
      'Cursor addressing, colors and a frame loop — rendered live on the cell\'s ansi screen (SBCL).',
    code: `
;;;; The Matrix effect — escape-code-driven output. The cell detects the
;;;; cursor/color codes and renders them on a live terminal screen
;;;; (SBCL streams such output; ECL flushes per newline only, so its
;;;; screen stays blank). Iterations: 20 here, 0 = run until Ctrl .

(defun clear-screen ()
  "Clear the terminal screen using ANSI escape codes."
  (format t "~c[2J~c[H" #\\Escape #\\Escape))

(defun move-cursor (row col)
  "Move the cursor to the specified position using ANSI escape codes."
  (format t "~c[~d;~dH" #\\Escape row col))

(defun set-green-color ()
  "Set the text color to green using ANSI escape codes."
  (format t "~c[32m" #\\Escape))

(defun reset-color ()
  "Reset the text color to default using ANSI escape codes."
  (format t "~c[0m" #\\Escape))

(defun random-char ()
  "A random character, with a higher probability of being a space."
  (if (zerop (random 5))
      #\\Space
      (code-char (+ 33 (random 94))))) ; '!' to '~'

(defun copy-2d-array (src target w h)
  "Copy the contents of a 2D array to another 2D array."
  (loop for row from 0 below h do
          (loop for col from 0 below w do
                  (setf (aref target row col) (aref src row col)))))

(defun update-with-changed-chars (buffer prev-buffer width height)
  "Update the terminal with only the changed characters."
  (loop for row from 0 below height do
          (loop for col from 0 below width do
                  (unless (char= (aref buffer row col) (aref prev-buffer row col))
                    (move-cursor row col)
                    (format t "~c " (aref buffer row col))))))

(defun random-2d-array-with-columns (buffer columns width height)
  "Drop a new character at each column's current head, then advance."
  (loop for col from 0 below width do
          (when (zerop (random 10)) ; 1/10 chance to restart a column
                (setf (aref columns col) (random height)))
          (setf (aref buffer (aref columns col) col) (random-char))
          (incf (aref columns col))
          (when (>= (aref columns col) height)
                (setf (aref columns col) 0))))

(defun matrix-effect (width height delay-time iterations)
  "Simulate the Matrix effect: green characters falling down the screen.
ITERATIONS 0 means run until interrupted (Ctrl .)."
  (clear-screen)
  (set-green-color)
  (loop
   with columns = (make-array width :initial-element 0)
   with buffer = (make-array (list height width) :initial-element #\\Space)
   with prev-buffer = (make-array (list height width) :initial-element #\\Space)
   for i from 0
   while (or (zerop iterations) (< i iterations))
   do (progn
        (random-2d-array-with-columns buffer columns width height)
        (update-with-changed-chars buffer prev-buffer width height)
        (copy-2d-array buffer prev-buffer width height)
        (sleep delay-time)
        (finish-output))))

(defun run-matrix-effect (&optional (w 40) (h 16) (delay-time 0.08) (iterations 20))
  "Run the effect; (run-matrix-effect 60 20 0.05 0) runs until Ctrl ."
  (unwind-protect
       (matrix-effect w h delay-time iterations)
    (reset-color)))

(run-matrix-effect)
`,
    expectedOutput: `;; ansi screen: 16 rows x 40 columns of green characters, refreshed
;; ~12 frames/s for 20 frames (~1.6 s), then the color resets and the
;; cell returns 0 (the LOOP's fall-through value). No plain stdout.`,
  },
  {
    slug: 'fractal-plots',
    title: 'Fractal plots',
    category: 'Algorithms',
    difficulty: 3,
    description:
      '(fractal :julia params) and friends — an open shape registry plotted through cl-plot.',
    code: `
(defparameter *fractal-generators* (make-hash-table)
  "shape keyword -> generator: (lambda (params) (values series title)),
where series is a list of (dataframe with-style) pairs.")

(defun %fractal-param (params key default)
  (let ((v (getf params key :missing)))
    (if (eq v :missing) default v)))

(defun %fractal-shape (shape)
  (let ((key (intern (string-upcase (string shape)) :keyword)))
    (values key (gethash key *fractal-generators*))))

;; ---- Koch snowflake: iterative edge replacement --------------------------
(defun %koch-step (pts)
  (let ((s3 (sqrt 3.0)))
    (loop for (ax ay) in pts
          and (bx by) in (append (rest pts) (list (first pts)))
          for dx = (- bx ax)
          for dy = (- by ay)
          nconc (let ((p1x (+ ax (* dx 1/3))) (p1y (+ ay (* dy 1/3))))
                  (list (list ax ay)
                        (list p1x p1y)
                        (list (+ p1x (* (- dx (* dy s3)) 1/6))
                              (+ p1y (* (+ (* dx s3) dy) 1/6)))
                        (list (+ ax (* dx 2/3)) (+ ay (* dy 2/3))))))))

;; ---- Sierpinski triangle: chaos game --------------------------------------
(defun %chaos-game (attractors n)
  (let ((pt (list 0.25 0.2)) (out nil) (k (length attractors)))
    (dotimes (i n)
      (let ((u (nth (random k) attractors)))
        (setq pt (list (/ (+ (first pt) (first u)) 2.0)
                       (/ (+ (second pt) (second u)) 2.0)))
        (push pt out)))
    (nreverse out)))

;; ---- Julia set: escape-time prisoner points -------------------------------
(defun %julia-inside-p (cr ci iters x0 y0)
  ;; plain float arithmetic — ECL boxes COMPLEX heavily in the wasm image
  (let ((x x0) (y y0))
    (dotimes (i iters t)
      (let ((nx (+ (- (* x x) (* y y)) cr))
            (ny (+ (* 2.0 x y) ci)))
        (setf x nx y ny)
        (when (> (+ (* x x) (* y y)) 4.0) (return nil))))))

(setf (gethash :snowflake *fractal-generators*)
      (lambda (p)
        (let* ((depth (%fractal-param p :depth 3))
               (pts (list (list 0.0 0.0) (list 1.0 0.0) (list 0.5 (/ (sqrt 3.0) 2.0)))))
          (dotimes (i depth) (setq pts (%koch-step pts)))
          (setq pts (append pts (list (first pts))))
          (values (list (list pts "lines"))
                  (format nil "Koch snowflake (depth ~D)" depth)))))

(setf (gethash :triangle *fractal-generators*)
      (lambda (p)
        (let ((n (%fractal-param p :points 1200))
              (v (list (list 0.0 0.0) (list 1.0 0.0) (list 0.5 (/ (sqrt 3.0) 2.0)))))
          (values (list (list (%chaos-game v n) "points"))
                  (format nil "Sierpinski triangle (chaos game, ~D points)" n)))))

(setf (gethash :julia *fractal-generators*)
      (lambda (p)
        (let* ((cr (%fractal-param p :re -0.7))
               (ci (%fractal-param p :im 0.27015))
               (size (%fractal-param p :size 56))
               (iters (%fractal-param p :iters 32))
               (pts (loop for yi from 0 below size nconc
                          (loop for xi from 0 below size
                                for x = (- (* 3.0 xi (/ 1.0 (1- size))) 1.5)
                                for y = (- (* 3.0 yi (/ 1.0 (1- size))) 1.5)
                                when (%julia-inside-p cr ci iters x y)
                                  collect (list x y)))))
          (values (list (list pts "points"))
                  (format nil "Julia set c=~A~A~Ai" cr (if (minusp ci) "" "+") ci)))))

;; a self-defined shape: the Vicsek fractal via the same chaos game
(setf (gethash :vicsek *fractal-generators*)
      (lambda (p)
        (let ((n (%fractal-param p :points 1000))
              (v (list (list 0.0 0.0) (list 1.0 0.0) (list 0.0 1.0) (list 1.0 1.0) (list 0.5 0.5))))
          (values (list (list (%chaos-game v n) "points"))
                  "Vicsek fractal (custom shape)"))))

(defun fractal (shape &optional (params '()))
  "Render SHAPE (keyword, symbol, or string) with PARAMS (a plist).
Known: :snowflake (:depth), :triangle (:points), :julia (:re :im :size :iters).
Add your own: (setf (gethash :my-shape *fractal-generators*) generator)."
  (multiple-value-bind (key gen) (%fractal-shape shape)
    (unless gen
      (error "unknown fractal shape ~S — known: ~{~A~^, ~}"
             shape
             (loop for k being each hash-key of *fractal-generators*
                   collect (string-downcase (string k)))))
    (multiple-value-bind (series title) (funcall gen params)
      (let ((total (reduce #'+ (mapcar (lambda (s) (length (first s))) series))))
        (format t "~&~A — ~D point~:P~%" title total)
        (if (and (find-symbol "SCATTER") (find-class 'figure nil))
            (let ((fig (make-instance 'figure)))
              (title fig title)
              (dolist (s series)
                (scatter fig (first s) :with (second s)))
              (show fig))
            (format t "~&[no cl-plot] ~D points computed — load cl-plot to render~%" total))
        total))))

(fractal :snowflake '(:depth 3))
(fractal :triangle)                ; defaults: 1200 chaos-game points
(fractal :julia)                   ; defaults: c=-0.7+0.27015i, 56×56
(fractal :vicsek '(:points 1000))  ; custom shape
`,
    expectedOutput: `;; OUT Koch snowflake (depth 3) — 193 points
;;=> 193
;; OUT Sierpinski triangle (chaos game, 1200 points) — 1200 points
;;=> 1200
;; OUT Julia set c=-0.7+0.27015i — 590 points
;;=> 590
;; OUT Vicsek fractal (custom shape) — 1000 points
;;=> 1000`,
  },
  {
    slug: 'interactive-input',
    title: 'Ask the user: read-line and y-or-n-p',
    category: 'Basics',
    difficulty: 1,
    description:
      'Standard input is real: the cell shows a prompt and the program waits for your line.',
    code: `;;;; Standard input in a notebook cell.
;;;; When a form reads from *standard-input*, the cell shows an
;;;; "stdin ←" prompt. Type a line and press Enter; Ctrl+D sends EOF.

(defun greet ()
  (format t "What is your name? ")
  (finish-output)
  (let ((name (read-line)))
    (format t "~&Hello, ~A!~%" name)
    (when (y-or-n-p "Shall I shout it?")
      (format t "~&~:@(Hello, ~A!~)~%" name))
    name))

(greet)

;; (read) parses a whole form — an unfinished one asks for another line.
(let ((form (read)))
  (list :you-typed form :which-is (type-of form)))
`,
    expectedOutput: `;; OUT What is your name? Ada
;; OUT Hello, Ada!
;; OUT Shall I shout it?  (Y or N) y
;; OUT HELLO, ADA!
;;=> "Ada"`,
  },
  {
    slug: 'restarts-walkthrough',
    title: 'Restarts: pause, choose, continue',
    category: 'Conditions',
    difficulty: 2,
    description:
      'An unhandled error pauses the image; the cell lists the live restarts and you pick one.',
    code: `;;;; The debugger is the real thing: the image is suspended inside the
;;;; handler with the stack intact, and the cell shows every restart that
;;;; is live at that point — yours first, then RETRY and ABORT.

(defun parse-age (text)
  (let ((n (parse-integer text :junk-allowed t)))
    (restart-case
        (if (and n (<= 0 n 150))
            n
            (error "~S is not an age" text))
      (use-value (v)
        :report "Use a different age"
        v)
      (continue ()
        :report "Treat it as unknown (nil)"
        nil))))

;; Evaluate this and watch the cell pause. Try:
;;   [0] USE-VALUE  → type 42 into the value box
;;   [1] CONTINUE   → returns NIL
;;   RETRY / ABORT  → re-run the form, or give up
(list :age (parse-age "forty-two"))

;; A handler-case in your own code still wins: this never pauses.
(handler-case (parse-age "n/a")
  (error (e) (format nil "caught: ~A" e)))
`,
    expectedOutput: `;;=> (:AGE 42)
;;=> "caught: \\"n/a\\" is not an age"`,
  },
  {
    slug: 'fix-it-live',
    title: 'Fix it live: define the missing function',
    category: 'Conditions',
    difficulty: 2,
    description:
      'Call a function that does not exist yet, then define it from inside the debugger and let the form finish.',
    code: `;;;; Two mistakes every REPL session makes — and the two restarts
;;;; MartingaleCell adds for them. Neither exists in the image itself.

;; 1. Undefined function. The cell pauses with DEFINE-FUNCTION: type a
;;    lambda (or the name of an existing function) and the form re-runs.
;;    Try:  (lambda (x) (* x x))
(list :squared (square 12))

;; 2. Unbound variable. STORE-VALUE sets it and re-runs the form.
;;    Try:  3.14159
(list :area (* *pi-ish* 2 2))

;; Both stay defined afterwards, exactly as if you had evaluated
;; (defun square …) and (defparameter *pi-ish* …) yourself:
(list (square 3) *pi-ish*)
`,
    expectedOutput: `;;=> (:SQUARED 144)
;;=> (:AREA 12.56636)
;;=> (9 3.14159)`,
  },
];
