# MOP Coverage — evidence and work plan

Evidence: `app/scripts/mop-probe.mjs` runs a 34-check AMOP battery through
the real image (same worker/mailbox protocol as `test:sbcl`). Results are
**identical on native SBCL 2.4.8 and on the wasm32-wasip1 build**: 33 pass,
1 fails on both (an upstream SBCL gap, not a port regression). The battery
is wired into the test chain as `pnpm run test:mop`; the one known upstream
failure is tolerated explicitly (`KNOWN-SBCL-GAP` in the test name), so any
new failure fails CI, and the moment the upstream gap is fixed we can flip
the expectation.

The feature-matrix row `slot-value-using-class etc.;
ensure-generic-function edge cases pending` is therefore stale — the port is
at **native-SBCL parity** for the MOP; what remains are upstream SBCL
limitations that every SBCL shares.

## 1. What works (both native and wasm) — 33 checks

### Class metaobject protocol
- `class-of`, `class-name`, `class-of` of class metaobjects
- `finalize-inheritance` / `class-finalized-p`
- `class-direct-superclasses`, `class-direct-slots`,
  `class-direct-default-initargs`
- `class-slots` (effective), `class-precedence-list`,
  `class-default-initargs`
- `class-prototype`
- `forward-referenced-class` (superclass not yet defined → correct
  metaobject type)
- `validate-superclass` default method
- `ensure-class` with `:direct-superclasses` (no `:direct-slots`)

### Slot definition metaobjects
- `slot-definition-name`, `slot-definition-readers`,
  `slot-definition-writers`
- `direct-slot-definition-class` / `effective-slot-definition-class`
  specialization (custom effective slot metaobject class verified)
- `standard-direct-slot-definition`,
  `standard-effective-slot-definition` as customization base
- `accessor-method-slot-definition` (reader method → its slot)

### Slot access customization — the `…-using-class` family
- `slot-value-using-class` `:around` specialization + `call-next-method`
  (verified with a ×100 proxy slot)
- `slot-boundp-using-class`, `slot-makunbound-using-class` (with slot
  metaobject argument)
- `slot-unbound` generic customization (returns 99 for unbound slot)

### Generic function protocol
- `ensure-generic-function`: basic, with `:method-class`, with a
  `:generic-function-class` that is a `funcallable-standard-class`
  subclass of `standard-generic-function`, and reconfiguration of an
  existing GF
- `generic-function-methods`, `-lambda-list`, `-method-combination`
- `method-specializers`, `method-qualifiers`, `method-function`,
  `method-generic-function`
- `add-method` / EQL specializers (`eql-specializer-object`, typing as
  `sb-mop:eql-specializer`)
- `compute-applicable-methods` (EGL specializer sorts first)
- `compute-effective-method` (with the GF's own method combination)
- dependent maintenance: `add-dependent` / `remove-dependent`

### Method combination
- `define-method-combination` long form with method-group specifiers
  (`((methods *))`) and programmatic effective-method construction
- standard combination via `compute-effective-method`

### Funcallable instances and accessor methods
- `funcallable-standard-class` metaclass +
  `set-funcallable-instance-function` (instance is `funcallable`)
- `standard-reader-method` / `standard-writer-method` via `:reader` /
  `:writer` slot options

### Restricted but present
- `make-method-lambda` (default path returns a working lambda; custom
  wrappers are restricted by SBCL design)
- `compute-default-initargs` default method

## 2. Gaps — SBCL team (wasm-dev)

Ordered by value to us. Everything here fails identically on native SBCL,
i.e. these are **upstream SBCL limitations the port inherits**, not wasm
regressions. The wasm team can either patch in the port branch or push
upstream; both work for us.

1. **`ensure-class` with programmatic `:direct-slots` (the one failing
   check)**. A defclass-canonicalized slot spec `(y :initarg :y
   :initform 7)` passed programmatically signals `PROGRAM-ERROR` — natively
   "keyword argument not a symbol: 7", on wasm "odd number of &KEY
   arguments" (see 5 below). `defclass` works because it goes through the
   compiler path, so `ensure-class` is effectively only usable without
   `:direct-slots`. Fix: accept canonicalized slot specs in
   `sb-pcl::ensure-class` (or export the canonicalizer).
2. **AMOP completeness exports**. `slot-exists-p-using-class` does not
   exist (Closer-mop extension) and CL generics central to the MOP story
   (`slot-unbound`, `no-applicable-method`, …) are not re-exported from
   `sb-mop`. Consider exporting/shimming a Closer-mop-compatible layer —
   many libraries (Closer-mop itself, contextl, etc.) test for exactly
   these.
3. **Condition metaobjects**. `condition` classes have no public MOP
   (`class-of` a condition class is internal `sb-pcl` machinery). A
   read-only subset (`condition-direct-superclasses`, slot definitions)
   would let tooling introspect conditions like classes.
4. **`make-method-lambda` customization**. SBCL restricts what the
   returned lambda may be (documented deviation from AMOP); fully
   supporting custom wrappers would unblock AOP-style libraries.
5. **Error-message divergence native vs wasm** for item 1 — same input,
   different `PROGRAM-ERROR` text. Harmless but suggests the canonicalized
   spec takes a slightly different path in the port build (eval/bytecodes
   vs `--script` compile). Worth a look while in there, to make sure
   nothing else diverges on that path.
6. Nice-to-have parity checks: `specializer-direct-methods`,
   `specializer-direct-generic-functions`,
   `compute-applicable-methods-using-classes` (restricted in SBCL) —
   confirm they behave on wasm; we will extend the battery once they do.

Definition of done for the SBCL side: check 11 in the battery
(`ensure-class-with-:direct-slots`) flips to OK on wasm; we then remove its
`KNOWN-SBCL-GAP` tolerance and CI enforces it forever after.

## 3. Plan — our team (MartingaleCell)

1. **Feature-matrix correction** (docs honesty): change the MOP row from
   "partial — slot-value-using-class etc.; ensure-generic-function edge
   cases pending" to reflect parity-with-native-SBCL plus the documented
   upstream gaps (ensure-class `:direct-slots`, Closer-mop shims,
   condition MOP). Update the zh dictionary entry with it.
2. **`test:mop` in CI** (done in this change): 34 checks, tolerant of
   exactly the known upstream gap; fails on any wasm MOP regression
   automatically.
3. **ECL parity run**: the same battery against the ECL fallback engine
   (ECL's CLOS ships closer-to-AMOP behavior in places). Record per-engine
   differences in the matrix notes; skip SBCL-specific checks
   (`sb-mop:` package) when the engine is ECL.
4. **Completion**: extend the live symbol dump (`dumpCoreSymbolsForm`) to
   also collect `SB-MOP` externals on SBCL (and ECL's MOP package) so
   `slot-value-u…`, `ensure-g…` complete with correct packages.
5. **MOP example**: add a notebook example ("MOP: proxy slots, custom slot
   metaobjects, method combinations") built from the battery's showpieces,
   so users can see the protocol working in a cell.
6. **Docs**: once the SBCL team lands item 1, move the MOP row to full and
   drop the caveat; if they land a Closer-mop-compatible layer, document
   it as the compatibility story for Quicklisp pure-Lisp systems.
