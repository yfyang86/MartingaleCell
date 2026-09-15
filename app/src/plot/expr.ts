/* gnuplot expression subset (Sprint 31): `plot sin(x)`, `plot x**2 + 1`,
 * `plot exp(-x)/2` … compiled to a function of x and sampled into line
 * segments. Pure, no DOM, so the Node plot test covers it. Anything the
 * grammar does not know (an unknown function, a stray token) compiles to
 * null and the renderer keeps naming the series as "not drawn". */

import type { PlotPoint } from './gnuplot'

type Fn = (x: number) => number

const FN1: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, log: Math.log, log10: Math.log10, sqrt: Math.sqrt,
  abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  int: Math.trunc, sgn: Math.sign,
}
const FN2: Record<string, (a: number, b: number) => number> = {
  atan2: Math.atan2, min: Math.min, max: Math.max,
}
const CONST: Record<string, number> = { pi: Math.PI }

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) { i++; continue }
    if (/[0-9.]/.test(ch)) {
      const m = src.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/)
      if (!m) return null
      out.push({ t: 'num', v: Number(m[0]) })
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

/** Compile a gnuplot expression in `x` to a JS function, or null when the
 * expression is outside the supported subset. */
export function compileExpression(src: string): Fn | null {
  const tokenized = tokenize(src)
  if (!tokenized || tokenized.length === 0) return null
  const toks: Tok[] = tokenized
  let p = 0
  const peek = (): Tok | undefined => toks[p]
  const isOp = (v: string) => { const t = peek(); return t !== undefined && t.t === 'op' && t.v === v }

  /* expr := term (('+'|'-') term)* */
  function expr(): Fn | null {
    let left: Fn | null = term()
    if (!left) return null
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: string }).v
      const right: Fn | null = term()
      if (!right) return null
      const l: Fn = left
      left = op === '+' ? (x: number): number => l(x) + right(x) : (x: number): number => l(x) - right(x)
    }
    return left
  }
  /* term := unary (('*'|'/'|'%') unary)* */
  function term(): Fn | null {
    let left: Fn | null = unary()
    if (!left) return null
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (toks[p++] as { v: string }).v
      const right: Fn | null = unary()
      if (!right) return null
      const l: Fn = left
      left = op === '*' ? (x: number): number => l(x) * right(x) : op === '/' ? (x: number): number => l(x) / right(x) : (x: number): number => l(x) % right(x)
    }
    return left
  }
  /* unary := ('-'|'+') unary | power    (so -x**2 is -(x**2), as in gnuplot) */
  function unary(): Fn | null {
    if (isOp('-')) { p++; const u = unary(); return u ? (x) => -u(x) : null }
    if (isOp('+')) { p++; return unary() }
    return power()
  }
  /* power := atom ('**' unary)?    (right-associative) */
  function power(): Fn | null {
    const base = atom()
    if (!base) return null
    if (isOp('**')) {
      p++
      const ex = unary()
      if (!ex) return null
      return (x) => Math.pow(base(x), ex(x))
    }
    return base
  }
  function atom(): Fn | null {
    const t = peek()
    if (!t) return null
    if (t.t === 'num') { p++; const v = t.v; return () => v }
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
        const args: Fn[] = []
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
        if (args.length === 1 && FN1[name]) { const f = FN1[name]; const a = args[0]; return (x) => f(a(x)) }
        if (args.length === 2 && FN2[name]) { const f = FN2[name]; const [a, b] = args; return (x) => f(a(x), b(x)) }
        return null
      }
      if (name === 'x') return (x) => x
      if (name in CONST) { const v = CONST[name]; return () => v }
      return null
    }
    return null
  }

  const fn = expr()
  if (!fn || p !== toks.length) return null
  /* a quick probe: the closure must produce numbers */
  const probe = fn(0.5)
  if (typeof probe !== 'number') return null
  return fn
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
