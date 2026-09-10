/* SBCL artifact loader, in Node (Sprint 24): evaluates public/sbcl-worker.js
 * (with its trailing boot() call removed) in a vm context with a fake
 * `fetch`, and checks loadArtifactBytes on synthetic data: the gzip'd copy
 * is preferred and inflated; an already-decoded copy is used as is; an
 * HTML SPA-fallback answer is refused; a missing .gz or a broken one falls
 * back to the plain artifact. No SBCL artifacts are needed.
 *
 * Usage: node scripts/sbcl-artifact-test.mjs   (exit 0 iff every check passes)
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); return ok }

const src = fs.readFileSync(path.join(root, 'public', 'sbcl-worker.js'), 'utf8')
const stripped = src.replace(/\nboot\(\)\s*$/, '\n')
if (stripped === src) { console.log('✗ could not find the trailing boot() call to strip'); process.exit(1) }

/* the fake server: url → { status, type, body } */
let routes = {}
const fakeFetch = async (url, opts) => {
  const r = routes[url]
  if (!r) return { ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }
  const body = r.body
  return {
    ok: true, status: 200,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? r.type : null) },
    arrayBuffer: async () => (opts?.method === 'HEAD' ? new ArrayBuffer(0) : body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)),
  }
}
const makeContext = (withDecompression = true) => {
  const ctx = {
    self: { postMessage: () => {} },
    fetch: fakeFetch,
    Blob, Response, TextEncoder, TextDecoder, SharedArrayBuffer, Int32Array, Uint8Array, Atomics, WebAssembly, Promise, Error, console, setTimeout, clearTimeout,
    ...(withDecompression ? { DecompressionStream } : {}),
  }
  ctx.globalThis = ctx
  vm.createContext(ctx)
  vm.runInContext(stripped, ctx, { filename: 'sbcl-worker.js' })
  return ctx
}
const bytesOf = (buf) => Buffer.from(new Uint8Array(buf))
const original = Buffer.from('\0asm' + 'x'.repeat(5000) + 'END')
const packed = zlib.gzipSync(original)

let ctx = makeContext()
check('the worker source evaluates without booting and exposes loadArtifactBytes', typeof ctx.loadArtifactBytes === 'function' && typeof ctx.isGzip === 'function')

routes = { '/sbcl/sbcl.core.gz': { type: 'application/gzip', body: packed } }
let got = bytesOf(await ctx.loadArtifactBytes('/sbcl/sbcl.core'))
check('a gzip\'d copy is fetched first and inflated to the original bytes', got.equals(original), `${got.length} bytes`)

routes = { '/sbcl/sbcl.core': { type: 'application/octet-stream', body: original } }
got = bytesOf(await ctx.loadArtifactBytes('/sbcl/sbcl.core'))
check('without a .gz, the plain artifact is fetched', got.equals(original))

routes = { '/sbcl/sbcl.core.gz': { type: 'application/octet-stream', body: original }, '/sbcl/sbcl.core': { type: 'application/octet-stream', body: Buffer.from('WRONG') } }
got = bytesOf(await ctx.loadArtifactBytes('/sbcl/sbcl.core'))
check('a .gz the server already decoded (no gzip magic, binary type) is used as is', got.equals(original))

routes = { '/sbcl/sbcl.core.gz': { type: 'text/html; charset=utf-8', body: Buffer.from('<!doctype html><title>ConsCell</title>') }, '/sbcl/sbcl.core': { type: 'application/octet-stream', body: original } }
got = bytesOf(await ctx.loadArtifactBytes('/sbcl/sbcl.core'))
check('an HTML answer for the .gz (SPA fallback) is refused; the plain artifact is used', got.equals(original))

routes = { '/sbcl/sbcl.core.gz': { type: 'application/gzip', body: Buffer.concat([packed.subarray(0, 40), Buffer.from('garbage')]) }, '/sbcl/sbcl.core': { type: 'application/octet-stream', body: original } }
got = bytesOf(await ctx.loadArtifactBytes('/sbcl/sbcl.core'))
check('a corrupt .gz falls back to the plain artifact', got.equals(original))

routes = {}
let err = null
await ctx.loadArtifactBytes('/sbcl/sbcl.core').catch((e) => { err = e })
check('neither present → the plain fetch error names the path', err && /\/sbcl\/sbcl\.core → HTTP 404/.test(err.message), err?.message)

ctx = makeContext(false)
routes = { '/sbcl/sbcl.core.gz': { type: 'application/gzip', body: packed }, '/sbcl/sbcl.core': { type: 'application/octet-stream', body: original } }
got = bytesOf(await ctx.loadArtifactBytes('/sbcl/sbcl.core'))
check('without DecompressionStream, a gzip\'d copy is skipped and the plain artifact is used', got.equals(original))

ctx = makeContext()
ctx.self.__ccSbclLoadBytes = (p) => Buffer.from('harness:' + p)
got = bytesOf(await ctx.loadArtifactBytes('/sbcl/sbcl.wasm'))
check('the harness hook still short-circuits fetch', got.toString() === 'harness:/sbcl/sbcl.wasm')

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} check(s) failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
