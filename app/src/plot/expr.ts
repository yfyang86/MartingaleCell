/* gnuplot expression subset (Sprint 31, extended in Sprint 34): `plot sin(x)`,
 * `plot x**2 + 1`, `f(x) = …` user functions, `a = …` user variables, and
 * gnuplot's integer arithmetic on integer literals (`1/2` is 0, `1/2.0` is
 * 0.5). Compiled to a function of x and sampled into line segments. Pure,
 * no DOM, so the Node plot test covers it. Anything the grammar does not
 * know (an unknown name, a stray token, a wrong arity) compiles to null and
 * the renderer keeps naming the series as "not drawn". */

import type { PlotPoint } from './gnuplot'

/** user definitions collected from the script: `name(p, q) = body`, `name = body` */
export interface PlotDefs {
  functions?: Record<string, { params: string[]; body: string }>
  variables?: Record<string, string>
}

type Vars = Record<string, number>
/** a compiled node: evaluates against the variables in scope; `isInt` follows gnuplot's integer typing */
interface Node { fn: (vars: Vars) => number; isInt: boolean }
type Fn = (x: number) => number

const FN1: Record<string, { f: (v: number) => number; int: boolean }> = {
  sin: { f: Math.sin, int: false }, cos: { f: Math.cos, int: false }, tan: { f: Math.tan, int: false },
  asin: { f: Math.asin, int: false }, acos: { f: Math.acos, int: false }, atan: { f: Math.atan, int: false },
  sinh: { f: Math.sinh, int: false }, cosh: { f: Math.cosh, int: false }, tanh: { f: Math.tanh, int: false },
  exp: { f: Math.exp, int: false }, log: { f: Math.log, int: false }, log10: { f: Math.log10, int: false }, sqrt: { f: Math.sqrt, int: false },
  abs: { f: Math.abs, int: false }, floor: { f: Math.floor, int: true }, ceil: { f: Math.ceil, int: true }, round: { f: Math.round, int: true },
  int: { f: Math.trunc, int: true }, sgn: { f: Math.sign, int: true },
}
const FN2: Record<string, (a: number, b: number) => number> = {
  atan2: Math.atan2, min: Math.min, max: Math.max,
}
const CONST: Record<string, number> = { pi: Math.PI }
const MAX_DEPTH = 32

type Tok = { t: 'num'; v: number; int: boolean } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) { i++; continue }
    if (/[0-9.]/.test(ch)) {
      const m = src.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/)
      if (!m) return null
      out.push({ t: 'num', v: Number(m[0]), int: /^\d+$/.test(m[0]) })
      i += m[0].length
      continue
    }
    if (/[a-zA-Z_]/.test(ch)) {
      const m = src.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/)!
      out.push({ t: 'id', v: m[0] })
      i += m[0].length
      continue
    }
    if (src.startsWith('**', i)) { out.push({ t: 'op', v: '**' }); i += 2; continue }
    if ('+-*/%(),'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue }
    return null
  }
  return out
}

/* gnuplot integer arithmetic: integer op integer stays integer (division truncates) */
function arith(op: string, a: Node, b: Node): Node {
  const isInt = a.isInt && b.isInt
  const af = a.fn
  const bf = b.fn
  switch (op) {
    case '+': return { isInt, fn: (v) => af(v) + bf(v) }
    case '-': return { isInt, fn: (v) => af(v) - bf(v) }
    case '*': return { isInt, fn: (v) => af(v) * bf(v) }
    case '/': return isInt ? { isInt, fn: (v) => { const d = bf(v); return d === 0 ? NaN : Math.trunc(af(v) / d) } } : { isInt, fn: (v) => af(v) / bf(v) }
    case '%': return { isInt, fn: (v) => af(v) % bf(v) }
    default: /* ** */ return isInt ? { isInt, fn: (v) => Math.trunc(Math.pow(af(v), bf(v))) } : { isInt, fn: (v) => Math.pow(af(v), bf(v)) }
  }
}

/** Parse `src` into a node with the given parameter names in scope (plus `x`,
 * `pi` and the user definitions); null when outside the subset. */
function parseNode(src: string, scope: string[], defs: PlotDefs | undefined, depth: number): Node | null {
  if (depth > MAX_DEPTH) return null
  const tokenized = tokenize(src)
  if (!tokenized || tokenized.length === 0) return null
  const toks: Tok[] = tokenized
  let p = 0
  const peek = (): Tok | undefined => toks[p]
  const isOp = (v: string) => { const t = peek(); return t !== undefined && t.t === 'op' && t.v === v }

  function expr(): Node | null {
    let left: Node | null = term()
    if (!left) return null
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: string }).v
      const right: Node | null = term()
      if (!right) return null
      left = arith(op, left, right)
    }
    return left
  }
  function term(): Node | null {
    let left: Node | null = unary()
    if (!left) return null
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (toks[p++] as { v: string }).v
      const right: Node | null = unary()
      if (!right) return null
      left = arith(op, left, right)
    }
    return left
  }
  /* unary := ('-'|'+') unary | power    (so -x**2 is -(x**2), as in gnuplot) */
  function unary(): Node | null {
    if (isOp('-')) { p++; const u = unary(); if (!u) return null; const f = u.fn; return { isInt: u.isInt, fn: (v) => -f(v) } }
    if (isOp('+')) { p++; return unary() }
    return power()
  }
  /* power := atom ('**' unary)?    (right-associative) */
  function power(): Node | null {
    const base = atom()
    if (!base) return null
    if (isOp('**')) {
      p++
      const ex = unary()
      if (!ex) return null
      return arith('**', base, ex)
    }
    return base
  }
  function atom(): Node | null {
    const t = peek()
    if (!t) return null
    if (t.t === 'num') { p++; const v = t.v; return { isInt: t.int, fn: () => v } }
    if (t.t === 'op' && t.v === '(') {
      p++
      const inner = expr()
      if (!inner || !isOp(')')) return null
      p++
      return inner
    }
    if (t.t === 'id') {
      p++
      const name = t.v
      if (isOp('(')) {
        p++
        const args: Node[] = []
        if (!isOp(')')) {
          for (;;) {
            const a = expr()
            if (!a) return null
            args.push(a)
            if (isOp(',')) { p++; continue }
            break
          }
        }
        if (!isOp(')')) return null
        p++
        const user = defs?.functions?.[name]
        if (user) {
          if (args.length !== user.params.length) return null
          const body = parseNode(user.body, user.params, defs, depth + 1)
          if (!body) return null
          const params = user.params
          const argFns = args.map((a) => a.fn)
          const bf = body.fn
          return {
            isInt: body.isInt && args.every((a) => a.isInt),
            fn: (v) => {
              const inner: Vars = { ...v }
              for (let i = 0; i < params.length; i++) inner[params[i]] = argFns[i](v)
              return bf(inner)
            },
          }
        }
        if (args.length === 1 && FN1[name]) { const { f, int } = FN1[name]; const a = args[0].fn; return { isInt: int, fn: (v) => f(a(v)) } }
        if (args.length === 2 && FN2[name]) { const f = FN2[name]; const [a, b] = args.map((n) => n.fn); const isInt = args[0].isInt && args[1].isInt && name !== 'atan2'; return { isInt, fn: (v) => f(a(v), b(v)) } }
        return null
      }
      if (scope.includes(name)) return { isInt: false, fn: (v) => v[name] }
      if (name in CONST) { const v = CONST[name]; return { isInt: false, fn: () => v } }
      const userVar = defs?.variables?.[name]
      if (userVar !== undefined) return parseNode(userVar, scope, defs, depth + 1)
      return null
    }
    return null
  }

  const node = expr()
  if (!node || p !== toks.length) return null
  return node
}

/** Compile a gnuplot expression in `x` to a JS function, or null when the
 * expression is outside the supported subset. `defs` supplies the script's
 * user-defined functions and variables. */
export function compileExpression(src: string, defs?: PlotDefs): Fn | null {
  const node = parseNode(src, ['x'], defs, 0)
  if (!node) return null
  const f = node.fn
  let probe: number
  try { probe = f({ x: 0.5 }) } catch { return null }
  if (typeof probe !== 'number') return null
  return (x) => f({ x })
}

/** Evaluate a constant expression (no `x`), for tests and tooling; null when it does not compile. */
export function evaluateConstant(src: string, defs?: PlotDefs): number | null {
  const node = parseNode(src, [], defs, 0)
  if (!node) return null
  try { return node.fn({}) } catch { return null }
}

/** Sample `fn` over [xmin, xmax] into line segments; a non-finite value or
 * a jump larger than `jumpFactor` × the sampled span breaks the line. */
export function sampleFunction(fn: Fn, xmin: number, xmax: number, samples = 200, jumpFactor = 0.5): PlotPoint[][] {
  const pts: (PlotPoint | null)[] = []
  const n = Math.max(2, samples)
  for (let i = 0; i < n; i++) {
    const x = xmin + ((xmax - xmin) * i) / (n - 1)
    let y: number
    try { y = fn(x) } catch { y = NaN }
    pts.push(Number.isFinite(y) ? { x, y } : null)
  }
  const finite = pts.filter((p): p is PlotPoint => p !== null)
  if (finite.length === 0) return []
  let lo = Infinity
  let hi = -Infinity
  for (const q of finite) { if (q.y < lo) lo = q.y; if (q.y > hi) hi = q.y }
  const jump = Math.max(hi - lo, 1e-9) * jumpFactor
  const segments: PlotPoint[][] = []
  let cur: PlotPoint[] = []
  let prev: PlotPoint | null = null
  for (const q of pts) {
    if (q === null || (prev && Math.abs(q.y - prev.y) > jump && segments.length + 1 < n)) {
      if (cur.length > 0) segments.push(cur)
      cur = q === null ? [] : [q]
      prev = q
      continue
    }
    cur.push(q)
    prev = q
  }
  if (cur.length > 0) segments.push(cur)
  return segments
}
