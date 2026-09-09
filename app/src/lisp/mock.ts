/* Mock Lisp evaluator — the last rung of the fallback ladder.
 * A tiny s-expression interpreter so the IDE ALWAYS evaluates something,
 * even if the WASM runtime and the JSCL CDN are both unreachable.
 * Supports the gallery examples: arithmetic, defun, format t, let, if,
 * when/unless, cond, quote, cons/list/car/cdr, dotimes/dolist, loop basics.
 */

import type { EvalResult } from './types'

type SExpr = number | string | boolean | null | symbol_ | SExpr[]
interface symbol_ { __sym: string }
const S = (name: string): symbol_ => ({ __sym: name.toUpperCase() })
const isSym = (x: unknown): x is symbol_ => typeof x === 'object' && x !== null && '__sym' in x
const symName = (x: symbol_) => x.__sym
const NIL = null
const T = true

class LispError extends Error {}

/* ---------- reader ---------- */

function tokenize(src: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === ';') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '#') {
      if (src[i + 1] === '|') { // block comment
        let d = 1; i += 2
        while (i < src.length && d > 0) {
          if (src[i] === '#' && src[i + 1] === '|') { d++; i += 2 }
          else if (src[i] === '|' && src[i + 1] === '#') { d--; i += 2 }
          else i++
        }
        continue
      }
      if (src[i + 1] === "'") { out.push("#'"); i += 2; continue }
      if (src[i + 1] === '\\') { // character literal: #\a or #\Space or #\(
        let j = i + 2
        if (j < src.length && /[A-Za-z0-9]/.test(src[j])) while (j < src.length && /[A-Za-z0-9]/.test(src[j])) j++
        else j++
        out.push(src.slice(i, j)); i = j; continue
      }
    }
    if (c === '(' || c === ')') { out.push(c); i++; continue }
    if (c === "'") { out.push("'"); i++; continue }
    if (c === '`') { out.push('`'); i++; continue }
    if (c === ',') { out.push(src[i + 1] === '@' ? ',@' : ','); i += src[i + 1] === '@' ? 2 : 1; continue }
    if (c === '"') {
      let j = i + 1, s = ''
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\') { s += src[j + 1]; j += 2 } else { s += src[j]; j++ }
      }
      out.push('"' + s); i = j + 1; continue
    }
    let j = i
    while (j < src.length && !/[\s()'"`,;]/.test(src[j])) j++
    out.push(src.slice(i, j)); i = j
  }
  return out
}

function atom(tok: string): SExpr {
  if (tok.startsWith('"')) return tok
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(tok)) return parseFloat(tok)
  if (tok.startsWith('#\\')) {
    const n = tok.slice(2).toLowerCase()
    return '"' + (n === 'space' ? ' ' : n === 'newline' ? '\n' : n === 'tab' ? '\t' : n[0] ?? '')
  }
  const up = tok.toUpperCase()
  if (up === 'NIL') return NIL
  if (up === 'T') return T
  return S(tok)
}

export function readAll(src: string): SExpr[] {
  const toks = tokenize(src)
  let p = 0
  const read = (): SExpr => {
    const tok = toks[p++]
    if (tok === undefined) throw new LispError('Unexpected end of input')
    if (tok === '(') {
      const list: SExpr[] = []
      while (p < toks.length && toks[p] !== ')') list.push(read())
      if (p >= toks.length) throw new LispError('Unmatched open parenthesis')
      p++
      return list
    }
    if (tok === ')') throw new LispError('Unmatched close parenthesis')
    if (tok === "'") return [S('quote'), read()]
    if (tok === "#'") return [S('function'), read()]
    if (tok === '`') return [S('quote'), read()]
    if (tok === ',' || tok === ',@') return read()
    return atom(tok)
  }
  const forms: SExpr[] = []
  while (p < toks.length) forms.push(read())
  return forms
}

/* ---------- printer ---------- */

/* strings are stored as JS strings with a leading '"' sentinel */
const strVal = (x: string): string => x.slice(1)

export function printLisp(x: SExpr): string {
  if (x === NIL) return 'NIL'
  if (x === T) return 'T'
  if (typeof x === 'number') return String(x)
  if (typeof x === 'string') return `"${strVal(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
  if (isSym(x)) return symName(x)
  if (Array.isArray(x)) {
    // dotted pair notation for improper lists is not produced by this mock
    return '(' + x.map(printLisp).join(' ') + ')'
  }
  return '#<OBJECT>'
}

function princ(x: SExpr): string {
  if (typeof x === 'string') return strVal(x)
  if (x === NIL) return 'NIL'
  if (x === T) return 'T'
  return printLisp(x)
}

/* ---------- evaluator ---------- */

interface Fn { __fn: true; params: string[]; body: SExpr[]; env: Env; name: string }
type Env = Map<string, SExpr | Fn>

function truthy(x: SExpr): boolean { return x !== NIL }

export function mockEval(src: string): EvalResult {
  const t0 = performance.now()
  let stdout = ''
  const warnings: string[] = []
  const globalEnv: Env = new Map()

  const builtins: Record<string, (...a: SExpr[]) => SExpr> = {
    '+': (...a) => (a as number[]).reduce((x, y) => x + y, 0),
    '-': (...a) => (a.length === 1 ? -(a[0] as number) : (a as number[]).slice(1).reduce((x, y) => x - y, a[0] as number)),
    '*': (...a) => (a as number[]).reduce((x, y) => x * y, 1),
    '/': (...a) => {
      if ((a as number[]).slice(1).some((n) => n === 0)) throw new LispError('DIVISION-BY-ZERO: arithmetic error signalled: Operation was / on zero')
      return a.length === 1 ? 1 / (a[0] as number) : (a as number[]).slice(1).reduce((x, y) => x / y, a[0] as number)
    },
    '1+': (a) => (a as number) + 1,
    '1-': (a) => (a as number) - 1,
    MOD: (a, b) => (a as number) % (b as number),
    REM: (a, b) => (a as number) % (b as number),
    EXPT: (a, b) => Math.pow(a as number, b as number),
    SQRT: (a) => Math.sqrt(a as number),
    ABS: (a) => Math.abs(a as number),
    MAX: (...a) => Math.max(...(a as number[])),
    MIN: (...a) => Math.min(...(a as number[])),
    FLOOR: (a) => Math.floor(a as number),
    CEILING: (a) => Math.ceil(a as number),
    ROUND: (a) => Math.round(a as number),
    '=': (...a) => (a as number[]).every((n) => n === a[0]) ? T : NIL,
    '<': (...a) => chainCmp(a as number[], (x, y) => x < y),
    '>': (...a) => chainCmp(a as number[], (x, y) => x > y),
    '<=': (...a) => chainCmp(a as number[], (x, y) => x <= y),
    '>=': (...a) => chainCmp(a as number[], (x, y) => x >= y),
    '/=': (a, b) => a === b ? NIL : T,
    ZEROP: (a) => a === 0 ? T : NIL,
    PLUSP: (a) => (a as number) > 0 ? T : NIL,
    MINUSP: (a) => (a as number) < 0 ? T : NIL,
    EVENP: (a) => (a as number) % 2 === 0 ? T : NIL,
    ODDP: (a) => (a as number) % 2 !== 0 ? T : NIL,
    NULL: (a) => a === NIL || (Array.isArray(a) && a.length === 0) ? T : NIL,
    NOT: (a) => truthy(a) ? NIL : T,
    EQ: (a, b) => a === b ? T : NIL,
    EQL: (a, b) => a === b ? T : NIL,
    EQUAL: (a, b) => printLisp(a) === printLisp(b) ? T : NIL,
    ATOM: (a) => !Array.isArray(a) ? T : NIL,
    CONSP: (a) => Array.isArray(a) && a.length > 0 ? T : NIL,
    LISTP: (a) => Array.isArray(a) || a === NIL ? T : NIL,
    NUMBERP: (a) => typeof a === 'number' ? T : NIL,
    STRINGP: (a) => typeof a === 'string' ? T : NIL,
    SYMBOLP: (a) => isSym(a) ? T : NIL,
    CONS: (a, b) => Array.isArray(b) ? [a, ...b] : [a, b],
    CAR: (a) => Array.isArray(a) && a.length ? a[0] : NIL,
    FIRST: (a) => Array.isArray(a) && a.length ? a[0] : NIL,
    CDR: (a) => Array.isArray(a) && a.length > 1 ? a.slice(1) : NIL,
    REST: (a) => Array.isArray(a) && a.length > 1 ? a.slice(1) : NIL,
    CADR: (a) => Array.isArray(a) && a.length > 1 ? a[1] : NIL,
    SECOND: (a) => Array.isArray(a) && a.length > 1 ? a[1] : NIL,
    CADDR: (a) => Array.isArray(a) && a.length > 2 ? a[2] : NIL,
    THIRD: (a) => Array.isArray(a) && a.length > 2 ? a[2] : NIL,
    NTH: (n, l) => Array.isArray(l) ? l[n as number] ?? NIL : NIL,
    LAST: (l) => Array.isArray(l) && l.length ? [l[l.length - 1]] : NIL,
    LIST: (...a) => a,
    LENGTH: (a) => Array.isArray(a) ? a.length : typeof a === 'string' ? strVal(a).length : 0,
    APPEND: (...a) => a.flatMap((x) => Array.isArray(x) ? x : [x]),
    REVERSE: (a) => Array.isArray(a) ? [...a].reverse() : a,
    MEMBER: (x, l) => {
      if (!Array.isArray(l)) return NIL
      const i = l.findIndex((e) => printLisp(e) === printLisp(x))
      return i < 0 ? NIL : l.slice(i)
    },
    REMOVE: (x, l) => Array.isArray(l) ? l.filter((e) => printLisp(e) !== printLisp(x)) : NIL,
    MAPCAR: (f, ...ls) => {
      const lists = ls as SExpr[][]
      const n = Math.min(...lists.map((l) => l.length))
      const out: SExpr[] = []
      for (let i = 0; i < n; i++) out.push(callFn(f, lists.map((l) => l[i])))
      return out
    },
    APPLY: (f, ...rest) => {
      const args = rest.slice(0, -1).concat(Array.isArray(rest[rest.length - 1]) ? rest[rest.length - 1] as SExpr[] : [])
      return callFn(f, args)
    },
    FUNCALL: (f, ...args) => callFn(f, args),
    REDUCE: (f, l) => Array.isArray(l) ? l.reduce((a2, b) => callFn(f, [a2, b])) : NIL,
    PRINT: (a) => { stdout += printLisp(a) + '\n'; return a },
    PRINC: (a) => { stdout += princ(a); return a },
    TERPRI: () => { stdout += '\n'; return NIL },
    FORMAT: (...a) => fmt(a),
    'STRING-UPCASE': (a) => typeof a === 'string' ? '"' + strVal(a).toUpperCase() : printLisp(a),
    'STRING-DOWNCASE': (a) => typeof a === 'string' ? '"' + strVal(a).toLowerCase() : printLisp(a),
    'STRING-LENGTH': (a) => typeof a === 'string' ? strVal(a).length : 0,
    CONCATENATE: (...a) => {
      const parts = (a[0] !== undefined && isSym(a[0])) ? a.slice(1) : a
      return '"' + parts.map((p) => typeof p === 'string' ? strVal(p) : princ(p)).join('')
    },
    VALUES: (...a) => a[0] ?? NIL,
    IDENTITY: (a) => a,
    RANDOM: (a) => Math.floor(Math.random() * (a as number)),
  }
  function chainCmp(a: number[], f: (x: number, y: number) => boolean): SExpr {
    for (let i = 0; i + 1 < a.length; i++) if (!f(a[i], a[i + 1])) return NIL
    return T
  }

  function fmt(args: SExpr[]): SExpr {
    const dest = args[0]
    const control = typeof args[1] === 'string' ? strVal(args[1]) : ''
    const rest = args.slice(2)
    let out = '', ri = 0
    for (let i = 0; i < control.length; i++) {
      if (control[i] === '~' && i + 1 < control.length) {
        const d = control[i + 1]
        if (d === '%' || d === '&') { out += '\n'; i++; continue }
        if (d === '~') { out += '~'; i++; continue }
        if (d === 'A' || d === 'a') { out += princ(rest[ri++] ?? NIL); i++; continue }
        if (d === 'S' || d === 's' || d === 'D' || d === 'd') {
          const v = rest[ri++]
          out += typeof v === 'number' ? String(v) : printLisp(v ?? NIL)
          i++; continue
        }
        if (d === '{') { // ~{ ~} iteration over a list
          const end = control.indexOf('~}', i)
          const inner = control.slice(i + 2, end === -1 ? control.length : end)
          const list = rest[ri++]
          if (Array.isArray(list)) {
            let li = 0
            while (li < list.length) {
              let piece = inner
              piece = piece.replace(/~[AaSsDd]/g, () => {
                const v = list[li++]
                return typeof v === 'number' ? String(v) : princ(v ?? NIL)
              })
              out += piece
            }
          }
          i = (end === -1 ? control.length : end + 1)
          continue
        }
        out += control[i]
      } else out += control[i]
    }
    if (dest === T) { stdout += out; return NIL }
    return '"' + out
  }

  function lookup(env: Env, name: string): SExpr | Fn {
    if (env.has(name)) return env.get(name)!
    if (globalEnv.has(name)) return globalEnv.get(name)!
    if (builtins[name]) return S('__builtin__' + name)
    throw new LispError(`UNDEFINED-FUNCTION: The function ${name} is undefined`)
  }

  function callFn(f: SExpr, args: SExpr[]): SExpr {
    if (typeof f === 'object' && f !== null && '__fn' in (f as object)) {
      const fn = f as unknown as Fn
      const local: Env = new Map(fn.env)
      fn.params.forEach((p, i) => local.set(p, args[i] ?? NIL))
      return evalBody(fn.body, local)
    }
    const name = isSym(f) ? symName(f) : null
    if (name) {
      if (name.startsWith('__BUILTIN__') && builtins[name.slice(11)]) return builtins[name.slice(11)](...args)
      if (builtins[name]) return builtins[name](...args)
      const g = globalEnv.get(name)
      if (g && typeof g === 'object' && '__fn' in (g as object)) return callFn(g as SExpr, args)
    }
    throw new LispError('Not a function: ' + printLisp(f))
  }

  function evalBody(body: SExpr[], env: Env): SExpr {
    let v: SExpr = NIL
    for (const f of body) v = evalSexpr(f, env)
    return v
  }

  function evalSexpr(x: SExpr, env: Env): SExpr {
    if (x === NIL || x === T || typeof x === 'number' || typeof x === 'string') return x
    if (isSym(x)) {
      const name = symName(x)
      if (name.startsWith(':')) return x
      const v = env.get(name) ?? globalEnv.get(name)
      if (v === undefined) throw new LispError(`The variable ${name} is unbound`)
      return v as SExpr
    }
    if (!Array.isArray(x) || x.length === 0) return NIL
    const head = x[0]
    const h = isSym(head) ? symName(head) : null

    switch (h) {
      case 'QUOTE': return x[1] ?? NIL
      case 'IF': return truthy(evalSexpr(x[1], env)) ? evalSexpr(x[2], env) : evalSexpr(x[3] ?? NIL, env)
      case 'WHEN': if (truthy(evalSexpr(x[1], env))) return evalBody(x.slice(2), env); return NIL
      case 'UNLESS': if (!truthy(evalSexpr(x[1], env))) return evalBody(x.slice(2), env); return NIL
      case 'COND':
        for (const clause of x.slice(1)) {
          if (Array.isArray(clause) && truthy(evalSexpr(clause[0], env)))
            return clause.length > 1 ? evalBody(clause.slice(1), env) : evalSexpr(clause[0], env)
        }
        return NIL
      case 'AND': {
        let v: SExpr = T
        for (const f of x.slice(1)) { v = evalSexpr(f, env); if (!truthy(v)) return NIL }
        return v
      }
      case 'OR':
        for (const f of x.slice(1)) { const v = evalSexpr(f, env); if (truthy(v)) return v }
        return NIL
      case 'PROGN': case 'PROG1': return evalBody(x.slice(1), env)
      case 'LET': case 'LET*': {
        const local: Env = h === 'LET*' ? new Map(env) : new Map(env)
        const bindings = Array.isArray(x[1]) ? x[1] as SExpr[] : []
        const pairs: [string, SExpr][] = []
        for (const b of bindings) {
          if (Array.isArray(b)) {
            const name = isSym(b[0]) ? symName(b[0]) : ''
            if (h === 'LET*') local.set(name, evalSexpr(b[1], local))
            else pairs.push([name, evalSexpr(b[1], env)])
          } else if (isSym(b)) (h === 'LET*' ? local : env).set(symName(b), NIL)
        }
        if (h === 'LET') pairs.forEach(([n, v]) => local.set(n, v))
        return evalBody(x.slice(2), local)
      }
      case 'SETQ': case 'SETF': {
        let v: SExpr = NIL
        for (let i = 1; i + 1 < x.length; i += 2) {
          v = evalSexpr(x[i + 1], env)
          const name = isSym(x[i]) ? symName(x[i] as symbol_) : ''
          if (env.has(name)) env.set(name, v); else globalEnv.set(name, v)
        }
        return v
      }
      case 'DEFPARAMETER': case 'DEFVAR': {
        const name = isSym(x[1]) ? symName(x[1] as symbol_) : ''
        const v = x.length > 2 ? evalSexpr(x[2], env) : NIL
        globalEnv.set(name, v)
        return S(name)
      }
      case 'DEFUN': {
        const name = isSym(x[1]) ? symName(x[1] as symbol_) : ''
        if (globalEnv.has(name)) warnings.push(`redefining ${name} in DEFUN`)
        const params = (Array.isArray(x[2]) ? x[2] as SExpr[] : []).map((p) => isSym(p) ? symName(p) : '')
        const body = x.slice(3).filter((f) => !(typeof f === 'string' && f === x[3])) // drop docstring
        const fn: Fn = { __fn: true, params, body: body.length ? body : x.slice(3), env: new Map(env), name }
        globalEnv.set(name, fn as unknown as SExpr)
        return S(name)
      }
      case 'LAMBDA': {
        const params = (Array.isArray(x[1]) ? x[1] as SExpr[] : []).map((p) => isSym(p) ? symName(p) : '')
        const fn: Fn = { __fn: true, params, body: x.slice(2), env: new Map(env), name: 'LAMBDA' }
        return fn as unknown as SExpr
      }
      case 'FUNCTION': {
        const t = x[1]
        if (Array.isArray(t) && isSym(t[0]) && symName(t[0]) === 'LAMBDA') return evalSexpr(t, env)
        if (isSym(t)) return lookup(env, symName(t)) as SExpr
        return NIL
      }
      case 'FLET': case 'LABELS': {
        const local: Env = new Map(env)
        for (const def of (Array.isArray(x[1]) ? x[1] : []) as SExpr[]) {
          if (!Array.isArray(def)) continue
          const name = isSym(def[0]) ? symName(def[0]) : ''
          const params = (Array.isArray(def[1]) ? def[1] as SExpr[] : []).map((p) => isSym(p) ? symName(p) : '')
          const fn: Fn = { __fn: true, params, body: def.slice(2), env: h === 'LABELS' ? local : new Map(env), name }
          local.set(name, fn as unknown as SExpr)
        }
        return evalBody(x.slice(2), local)
      }
      case 'DOTIMES': {
        const spec = x[1] as SExpr[]
        const v = isSym(spec[0]) ? symName(spec[0]) : 'I'
        const n = evalSexpr(spec[1], env) as number
        for (let i = 0; i < n; i++) { const l: Env = new Map(env); l.set(v, i); evalBody(x.slice(2), l) }
        return spec.length > 2 ? evalSexpr(spec[2], env) : NIL
      }
      case 'DOLIST': {
        const spec = x[1] as SExpr[]
        const v = isSym(spec[0]) ? symName(spec[0]) : 'X'
        const list = evalSexpr(spec[1], env)
        if (Array.isArray(list)) for (const item of list) { const l: Env = new Map(env); l.set(v, item); evalBody(x.slice(2), l) }
        return spec.length > 2 ? evalSexpr(spec[2], env) : NIL
      }
      case 'LOOP': return evalLoop(x.slice(1), env)
      case 'MULTIPLE-VALUE-BIND': case 'DESTRUCTURING-BIND': {
        const vars = (Array.isArray(x[1]) ? x[1] as SExpr[] : []).map((p) => isSym(p) ? symName(p) : '')
        const vals = evalSexpr(x[2], env)
        const arr = Array.isArray(vals) ? vals : [vals]
        const local: Env = new Map(env)
        vars.forEach((vn, i) => local.set(vn, arr[i] ?? NIL))
        return evalBody(x.slice(3), local)
      }
      case 'HANDLER-CASE': case 'HANDLER-BIND': case 'UNWIND-PROTECT':
        return evalSexpr(x[1], env)
      case 'BLOCK': return evalBody(x.slice(2), env)
      case 'RETURN-FROM': return NIL
      case 'IN-PACKAGE': return S('CL-USER')
      case 'DEFPACKAGE': return S('PKG')
      case 'THE': return evalSexpr(x[2], env)
      case 'MACROEXPAND-1': return x[1] ?? NIL
      case 'ERROR': throw new LispError(princ(evalSexpr(x[1], env)))
      case 'WARN': { const m = princ(evalSexpr(x[1], env)); warnings.push(m); return NIL }
      default: break
    }

    // function call
    const args = x.slice(1).map((a) => evalSexpr(a, env))
    if (h && builtins[h]) return builtins[h](...args)
    if (h === 'REMOVE-IF' || h === 'REMOVE-IF-NOT') {
      const not = h === 'REMOVE-IF-NOT'
      const f = evalSexpr(x[1], env)
      const l = args[1]
      if (Array.isArray(l)) return l.filter((e) => truthy(callFn(f, [e])) === not)
      return NIL
    }
    if (h) {
      const g = globalEnv.get(h) ?? env.get(h)
      if (g && typeof g === 'object' && '__fn' in (g as object)) return callFn(g as SExpr, args)
      throw new LispError(`UNDEFINED-FUNCTION: The function ${h} is undefined`)
    }
    if (Array.isArray(head) && isSym(head[0]) && symName(head[0]) === 'LAMBDA') {
      return callFn(evalSexpr(head, env), args)
    }
    throw new LispError('Illegal function call')
  }

  function evalLoop(body: SExpr[], env: Env): SExpr {
    // supports: (loop for i from a [to|below] b do/collect f) and (loop for x in list do/collect f)
    const acc: SExpr[] = []
    let collecting = false
    let i = 0
    while (i < body.length) {
      const kw = (s: SExpr) => isSym(s) ? symName(s) : ''
      if (kw(body[i]) === 'FOR') {
        const v = kw(body[i + 1])
        const how = kw(body[i + 2])
        if (how === 'FROM') {
          const from = evalSexpr(body[i + 3], env) as number
          const toKw = kw(body[i + 4])
          const to = evalSexpr(body[i + 5], env) as number
          i += 6
          const doWhat = kw(body[i])
          collecting = doWhat === 'COLLECT'
          const expr = body[i + 1]
          for (let n = from; toKw === 'BELOW' ? n < to : n <= to; n++) {
            const l: Env = new Map(env); l.set(v, n)
            if (doWhat === 'DO') evalSexpr(expr, l)
            else if (collecting) acc.push(evalSexpr(expr, l))
          }
          i += 2
        } else if (how === 'IN') {
          const list = evalSexpr(body[i + 3], env)
          i += 4
          const doWhat = kw(body[i])
          collecting = doWhat === 'COLLECT'
          const expr = body[i + 1]
          if (Array.isArray(list)) for (const item of list) {
            const l: Env = new Map(env); l.set(v, item)
            if (doWhat === 'DO') evalSexpr(expr, l)
            else if (collecting) acc.push(evalSexpr(expr, l))
          }
          i += 2
        } else break
      } else break
    }
    return collecting ? acc : NIL
  }

  // run
  const values: string[] = []
  let error: string | undefined
  let errorType: string | undefined
  try {
    const forms = readAll(src)
    for (const form of forms) {
      const v = evalSexpr(form, new Map())
      values.push(printLisp(v))
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const m = msg.match(/^([A-Z][A-Z-]+):/)
    errorType = m ? m[1] : 'ERROR'
    error = msg
  }
  return {
    stdout,
    values: error ? values : values,
    warnings,
    error,
    errorType,
    durationMs: Math.max(0.1, performance.now() - t0),
  }
}
