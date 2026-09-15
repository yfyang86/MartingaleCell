# Sprint 7 — Implementation notes

## 1. The profile

Hypothesis 1 from the plan was confirmed by counting wasm→JS import calls
during a loop (import object wrapped at instantiation, Node harness):

| Job | Import calls | Which |
|---|---|---|
| `(dotimes (i 20000))` | 200 000 (≈10 / iteration) | `invoke_iii` 60 %, `invoke_vii` 20 %, `invoke_ii`, `invoke_vi` |
| `… (incf n i)` | 440 000 (≈22 / iteration) | same four |

Nothing else is called: no syscalls, no clock, no allocator hooks.
`invoke_*` are Emscripten's JavaScript setjmp/longjmp trampolines: every
call made from a C function that contains a `setjmp` (ECL's frame stack —
which includes the bytecodes interpreter itself) leaves wasm, and each one
cost ≈3.5 µs because the stock trampoline calls `stackSave` and
`dynCall_*` through the glue's assertion wrappers *and* Asyncify's export
instrumentation:

```js
function invoke_iii(index,a1,a2){var sp=stackSave();try{return dynCall_iii(index,a1,a2)}
  catch(e){stackRestore(sp);if(e!==e+0)throw e;_setThrew(1,0)}}
```

GC and Asyncify's own per-call instrumentation turned out to be second
order; consing loops are only ~2× slower than non-consing ones.

## 2. The fix: lean trampolines from the worker (`installFastInvoke`)

Before `wecl.js` loads, the worker shadows its global `WebAssembly` with
an object whose prototype is the real namespace and whose `instantiate` /
`instantiateStreaming` patch the import object: every `env.invoke_<sig>`
is replaced by a function that does exactly what the stock one does —
save the stack pointer, call the table entry, on a longjmp restore the
stack and `setThrew(1,0)`, rethrow real JS exceptions — but through the
**raw exports** (`emscripten_stack_get_current`,
`_emscripten_stack_restore`, `setThrew`) and a **cached mirror of the
indirect function table** instead of `wasmTable.get` on every call.
Arity is dispatched with a `switch` (no spread on the hot path). Until the
instance's exports are known the original trampoline is used; if the
three exports or the table are missing the stock ones stay in place and
the boot transcript says so.

Why it is safe: Asyncify relies only on the *export* wrappers to know when
the outermost export returns during an unwind; leaf calls and table calls
are not part of that bookkeeping in the stock build either (the table call
inside `dynCall_*` is a plain wasm reference). longjmp semantics are
identical: a thrown number means "longjmp", restore and set the flag.
The whole harness suite — debugger pauses through these frames, stdin,
handler-case unwinding, project loads, package manager — passes unchanged.

Gotcha: nothing may be *copied* from the real namespace onto the shim —
`WebAssembly.JSTag` is read-only and assignment throws; inheritance
through the prototype makes copying unnecessary anyway.

## 3. Results (Node harness, real image)

| Form | Before | After | Speed-up |
|---|---|---|---|
| `(dotimes (i 20000))` | 711 ms | 29 ms | 25× |
| `… (incf n i)` | 1 498 ms | 63 ms | 24× |
| `… (setq n (f7 i))` — a call per iteration | 1 470 ms | 53 ms | 28× |
| `(loop for i below 20000 collect i)` | 1 329 ms | 106 ms | 13× |
| `(dotimes (i 1000000) (incf n i))` | 76 s | 3.5 s | 22× |
| `(fib 25)` naive recursive | — | 0.69 s | |

`scripts/perf-test.mjs` asserts a floor (400 ms / 400 ms / 600 ms for the
first three; stock ≈ 1450 ms) so the gain cannot regress silently; it runs
in `pnpm test` and CI.

## 4. What is still slow, and the rebuild recipe

~3 µs per bytecode is now spent *inside* wasm; a native ECL runs the same
loop ~50× faster still. The remaining tax is (a) the trampolines that
still exist — a JS→wasm→JS round trip per call from any setjmp-bearing
function — and (b) Asyncify's instrumentation of every function. Both go
away only in a rebuilt WECL: `-sSUPPORT_LONGJMP=wasm` (native exception
handling, no `invoke_*` at all) and JSPI instead of Asyncify. That needs
the ECL sources and an Emscripten toolchain, neither of which this
environment has; it stays the documented next step, not this sprint's.

## 5. Definition index — no code needed

Sprint 6's proposal said the definition index "dies with the worker". It
does not: it lives in the project store and is cleared only when the
project changes; a worker restart keeps it. Session replay re-evaluates
the *image's* definitions; the editor's go-to-definition never lost its
index. Corrected here rather than implemented.
