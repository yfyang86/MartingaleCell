/* JSCL fallback engine (pure JS, loaded from CDN) — rung 2 of the ladder.
 * Only used when the WECL worker fails to boot. API per info.md:
 *   jscl.evaluateString(str)  — evaluates ONE form (we wrap in progn)
 *   stdout capture by overriding %WRITE-STRING
 */

import type { EvalResult } from './types'

const JSCL_URL = 'https://cdn.jsdelivr.net/npm/jscl@0.9.0-alpha.0/dist/jscl.min.js'

declare global {
  interface Window { jscl?: any }
}

export async function loadJsclEngine(onBoot?: (line: string) => void): Promise<(code: string) => Promise<EvalResult>> {
  onBoot?.('ECL/WASM unavailable — loading JSCL fallback from CDN')
  if (!window.jscl) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = JSCL_URL
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('failed to fetch jscl.min.js'))
      document.head.appendChild(s)
      setTimeout(() => reject(new Error('JSCL load timeout')), 15000)
    })
  }
  const jscl = window.jscl
  if (!jscl || typeof jscl.evaluateString !== 'function') throw new Error('JSCL API not present after load')
  onBoot?.('JSCL loaded — ANSI CL subset, pure JavaScript')

  return async function evaluate(code: string): Promise<EvalResult> {
    const t0 = performance.now()
    let stdout = ''
    const orig = jscl.packages.JSCL.symbols['%WRITE-STRING'].fvalue
    jscl.packages.JSCL.symbols['%WRITE-STRING'].fvalue = function (_values: unknown, s: unknown) {
      stdout += jscl.internals.lisp_to_js(s)
      return s
    }
    try {
      const ret = jscl.evaluateString('(progn ' + code + ')')
      let values: string[] = []
      try {
        const jsv = jscl.internals.lisp_to_js(ret)
        if (jsv !== undefined) values = [typeof jsv === 'string' ? jsv : JSON.stringify(jsv) ?? String(jsv)]
      } catch { values = ['; values not printable in JSCL fallback'] }
      return { stdout, values, warnings: [], durationMs: performance.now() - t0 }
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? 'evaluation error')
      const m = msg.match(/DIVISION.BY.ZERO/i)
      return {
        stdout, values: [], warnings: [],
        error: msg,
        errorType: m ? 'DIVISION-BY-ZERO' : 'ERROR',
        durationMs: performance.now() - t0,
      }
    } finally {
      jscl.packages.JSCL.symbols['%WRITE-STRING'].fvalue = orig
    }
  }
}
