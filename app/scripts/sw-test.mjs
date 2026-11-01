/* Service worker test, in Node (Sprint 34): evaluates public/sw.js in a vm
 * context with a fake Cache API, fetch, Response and event listeners, and
 * checks install (precache), activate (older martingalecell-* caches dropped,
 * clients claimed), navigations (network first, the cached index.html when
 * offline, a 503 when nothing was ever cached), cache-first for same-origin
 * GETs, cross-origin / non-GET / sw.js pass-through, and the `warm` message
 * (missing URLs fetched and stored, present ones skipped, a reply sent).
 *
 * Usage: node scripts/sw-test.mjs   (exit 0 iff every check passes)
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (name, ok, detail = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`); return ok }

const ORIGIN = 'https://cc.example'
const SCOPE = ORIGIN + '/'
const src = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8')

/* ---- a fake Cache API: name → Map(url → Response) ---- */
function makeWorld({ version = '1.0.0-beta.1', online = true, routes = {} } = {}) {
  const stores = new Map()
  const keyOf = (req) => (typeof req === 'string' ? new URL(req, SCOPE).href : req.url)
  const matchOpts = []
  const mkCache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const m = stores.get(name)
    return {
      match: async (req, opts) => { matchOpts.push(opts); return m.get(keyOf(req)) ?? undefined },
      put: async (req, res) => { m.set(keyOf(req), res) },
      addAll: async (urls) => { for (const u of urls) { const r = await world.fetch(new Request(u)); if (!r.ok) throw new Error('addAll ' + u); m.set(keyOf(u), r) } },
    }
  }
  const caches = {
    open: async (name) => mkCache(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (req, opts) => { matchOpts.push(opts); for (const m of stores.values()) { const hit = m.get(keyOf(req)); if (hit) return hit } return undefined },
  }
  const fetchLog = []
  const fetch = async (req) => {
    const url = typeof req === 'string' ? new URL(req, SCOPE).href : req.url
    fetchLog.push(url)
    if (!online) throw new TypeError('offline')
    const pathname = new URL(url).pathname
    /* the static host serves index.html for every SPA route (no extension) */
    const r = routes[pathname] ?? (/\.[a-z0-9]+$/i.test(pathname) ? undefined : routes['/index.html'])
    const res = r ? new Response(r.body, { status: 200, headers: { 'content-type': r.type ?? 'text/plain', ...(r.headers ?? {}) } }) : new Response('nope', { status: 404 })
    /* a same-origin response is `basic` in the browser; Node's Response says `default` */
    Object.defineProperty(res, 'type', { value: 'basic' })
    return res
  }
  const listeners = {}
  const self = {
    location: new URL(`${SCOPE}sw.js?v=${version}`),
    registration: { scope: SCOPE },
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn) },
    skipWaiting: async () => { self.skipped = true },
    clients: { claim: async () => { self.claimed = true } },
  }
  const ctx = { self, caches, fetch, URL, Response, Request, Promise, Array, console }
  ctx.globalThis = ctx
  vm.createContext(ctx)
  vm.runInContext(src, ctx, { filename: 'sw.js' })
  const world = { self, caches, fetch, fetchLog, stores, listeners, routes, matchOpts, setOnline: (v) => { online = v } }
  world.dispatch = async (type, event) => {
    const waits = []
    const responses = []
    const ev = { ...event, waitUntil: (p) => waits.push(p), respondWith: (p) => responses.push(p) }
    for (const fn of listeners[type] ?? []) fn(ev)
    await Promise.all(waits)
    return responses.length ? await responses[0] : undefined
  }
  /* Request.mode is read-only on the real class; the worker only reads url, method and mode and hands the
   * request to fetch / caches.match, which the fakes accept as plain objects too */
  world.fetchEvent = (url, extra = {}) => world.dispatch('fetch', { request: { url: new URL(url, SCOPE).href, method: extra.method ?? 'GET', mode: extra.mode ?? 'cors' } })
  return world
}
const nav = (url) => ({ request: { url: new URL(url, SCOPE).href, method: 'GET', mode: 'navigate' } })

const routes = {
  '/': { body: '<html>shell</html>', type: 'text/html', headers: { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'credentialless' } },
  '/index.html': { body: '<html>shell</html>', type: 'text/html', headers: { 'cross-origin-opener-policy': 'same-origin' } },
  '/assets/app-abc.js': { body: 'js', type: 'text/javascript' },
  '/sbcl/sbcl.wasm.gz': { body: 'gz1', type: 'application/gzip' },
  '/sbcl/sbcl.core.gz': { body: 'gz2', type: 'application/gzip' },
  '/wecl/wecl.wasm': { body: 'wasm', type: 'application/wasm' },
}

/* 1. install precaches the scope root and index.html, then skipWaiting */
let w = makeWorld({ routes })
w.stores.set('martingalecell-1.0.0-beta.0', new Map([[SCOPE + 'old', new Response('old')]]))
await w.dispatch('install', {})
check('install precaches the scope root and index.html and calls skipWaiting', w.stores.get('martingalecell-1.0.0-beta.1')?.has(SCOPE) && w.stores.get('martingalecell-1.0.0-beta.1')?.has(SCOPE + 'index.html') && w.self.skipped === true, [...(w.stores.get('martingalecell-1.0.0-beta.1')?.keys() ?? [])].join(','))

/* 2. activate drops the older martingalecell-* cache, keeps the current one, claims clients */
w.stores.set('conscell-0.9.0', new Map([[SCOPE + 'legacy', new Response('legacy')]]))
await w.dispatch('activate', {})
check('activate deletes martingalecell-1.0.0-beta.0, keeps martingalecell-1.0.0-beta.1, claims the clients', !w.stores.has('martingalecell-1.0.0-beta.0') && w.stores.has('martingalecell-1.0.0-beta.1') && w.self.claimed === true, [...w.stores.keys()].join(','))
check('activate also deletes pre-rename conscell-* caches', !w.stores.has('conscell-0.9.0'), [...w.stores.keys()].join(','))

/* 3. a navigation online: network response returned and stored as index.html (headers kept) */
let res = await w.dispatch('fetch', nav('/ide'))
check('a navigation online returns the network response', res && res.status === 200 && (await res.clone().text()) === '<html>shell</html>')
const storedIndex = await w.stores.get('martingalecell-1.0.0-beta.1').get(SCOPE + 'index.html')
check('the navigation response was stored as index.html, COOP header included', storedIndex && storedIndex.headers.get('cross-origin-opener-policy') === 'same-origin')

/* 4. a navigation offline: the cached index.html (any SPA route) */
w.setOnline(false)
res = await w.dispatch('fetch', nav('/docs'))
check('a navigation offline serves the cached index.html for any SPA route', res && res.status === 200 && (await res.clone().text()) === '<html>shell</html>')
w.setOnline(true)

/* 5. same-origin GET: cache-first, stored on the way through */
res = await w.fetchEvent('/assets/app-abc.js')
check('a same-origin asset is fetched once and stored', res && (await res.clone().text()) === 'js' && w.stores.get('martingalecell-1.0.0-beta.1').has(SCOPE + 'assets/app-abc.js'))
const before = w.fetchLog.length
res = await w.fetchEvent('/assets/app-abc.js')
check('the second request for it is served from the cache (no fetch)', res && w.fetchLog.length === before)
check('cache lookups ignore Vary (hosts answer static files with Vary: Origin; module scripts carry an Origin header)', w.matchOpts.length > 0 && w.matchOpts.every((o) => o && o.ignoreVary === true), JSON.stringify(w.matchOpts.slice(-3)))
w.setOnline(false)
res = await w.fetchEvent('/assets/app-abc.js')
check('…and offline too', res && (await res.clone().text()) === 'js')
w.setOnline(true)

/* 5b. offline and not cached: an explicit 504, not a rejected respondWith */
w.setOnline(false)
res = await w.fetchEvent('/assets/other-xyz.js')
check('an offline miss answers 504 instead of rejecting', res && res.status === 504)
w.setOnline(true)

/* 6. pass-through: cross-origin, non-GET, sw.js itself */
const pass1 = await w.fetchEvent('https://fonts.googleapis.com/css2?family=Inter')
const pass2 = await w.fetchEvent('/api', { method: 'POST' })
const pass3 = await w.fetchEvent('/sw.js?v=1.0.0-beta.1')
check('cross-origin, non-GET and sw.js requests are left to the browser (no respondWith)', pass1 === undefined && pass2 === undefined && pass3 === undefined)

/* 7. warm: missing URLs fetched and stored, present ones skipped, reply sent */
let reply = null
const source = { postMessage: (m) => { reply = m } }
await w.dispatch('message', { data: { type: 'warm', urls: [SCOPE + 'sbcl/sbcl.wasm.gz', SCOPE + 'sbcl/sbcl.core.gz', SCOPE + 'assets/app-abc.js', SCOPE + 'missing.bin', 'https://evil.example/x'] }, source })
const store = w.stores.get('martingalecell-1.0.0-beta.1')
check('warm stores the artifacts that were missing', store.has(SCOPE + 'sbcl/sbcl.wasm.gz') && store.has(SCOPE + 'sbcl/sbcl.core.gz'))
check('warm skips a URL already in the cache and drops cross-origin URLs', reply && !reply.added.includes(SCOPE + 'assets/app-abc.js') && !reply.urls.some((u) => u.startsWith('https://evil')), JSON.stringify(reply))
check('warm replies with added and failed lists', reply && reply.type === 'warmed' && reply.added.length === 2 && reply.failed.join(',') === SCOPE + 'missing.bin', JSON.stringify(reply))
check('warm ignores messages that are not warm requests', await w.dispatch('message', { data: { type: 'other' }, source }) === undefined && reply.type === 'warmed')

/* 8. offline warm: everything fails, the reply still arrives */
w.setOnline(false)
reply = null
await w.dispatch('message', { data: { type: 'warm', urls: [SCOPE + 'wecl/wecl.wasm'] }, source })
check('an offline warm reports the URL as failed and nothing stored', reply && reply.failed.length === 1 && reply.added.length === 0 && !store.has(SCOPE + 'wecl/wecl.wasm'))
w.setOnline(true)

/* 9. nothing ever cached: a navigation offline gets the 503 text, not an exception */
const w2 = makeWorld({ routes, online: false })
res = await w2.dispatch('fetch', nav('/ide'))
check('with nothing cached, an offline navigation answers 503 instead of throwing', res && res.status === 503)

/* 10. the cache name follows the registration version */
const w3 = makeWorld({ routes, version: '9.9.9' })
await w3.dispatch('install', {})
check('the cache is named after the ?v= registration query', w3.stores.has('martingalecell-9.9.9'))

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('✗')).length
console.log(failed ? `\nFAIL: ${failed} of ${results.length} checks failed` : `\nPASS: ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
