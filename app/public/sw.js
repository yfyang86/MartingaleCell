/* ConsCell service worker (Sprint 31): the IDE works offline after its first
 * load. The cache is named after the app version the page registered us
 * with (./sw.js?v=<version>): a new build installs a new worker, which drops
 * the older cache when it activates, so artifacts are re-fetched once per
 * version and never go stale across versions.
 *
 * - navigations: network first, the cached index.html when offline (every
 *   SPA route serves it); the network response keeps its COOP/COEP headers
 *   in the cache, so crossOriginIsolated still holds offline and SBCL boots.
 * - every other same-origin GET (hashed assets, the two workers, the .gz
 *   engine artifacts, the sample zip): cache first, stored on the first
 *   successful fetch.
 * - cross-origin requests (the fonts stylesheet) are left to the browser. */

var VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
var CACHE = 'conscell-' + VERSION
var SCOPE = self.registration.scope
var INDEX = SCOPE + 'index.html'

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll([SCOPE, INDEX]).catch(function () { /* offline install: nothing to precache yet */ }) })
      .then(function () { return self.skipWaiting() })
  )
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf('conscell-') === 0 && k !== CACHE }).map(function (k) { return caches.delete(k) }))
      })
      .then(function () { return self.clients.claim() })
  )
})

function networkFirstNavigation(request) {
  return fetch(request)
    .then(function (response) {
      if (response && response.ok) {
        var copy = response.clone()
        caches.open(CACHE).then(function (cache) { cache.put(INDEX, copy) })
      }
      return response
    })
    .catch(function () {
      return caches.match(INDEX, MATCH).then(function (cached) {
        return cached || new Response('ConsCell is offline and has not been loaded before.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      })
    })
}

/* Same-origin static files: ignore Vary when matching. Hosts (vite preview
 * among them) answer with `Vary: Origin`, and the browser sends an Origin
 * header on the page's crossorigin module-script and stylesheet requests
 * while a warmed entry was stored from a plain fetch — with Vary honoured
 * they would never match (Sprint 34). */
var MATCH = { ignoreVary: true }

function cacheFirst(request) {
  return caches.match(request, MATCH).then(function (cached) {
    if (cached) return cached
    return fetch(request).then(function (response) {
      if (response && response.ok && response.type === 'basic') {
        /* store before answering, so a request that follows at once is served from the cache (Sprint 34) */
        var copy = response.clone()
        return caches.open(CACHE).then(function (cache) { return cache.put(request, copy) }).then(function () { return response }, function () { return response })
      }
      return response
    }).catch(function () {
      /* offline and not cached: an explicit gateway-timeout answer instead of a rejected respondWith */
      return new Response('ConsCell is offline and this file is not cached.', { status: 504, headers: { 'Content-Type': 'text/plain' } })
    })
  })
}

/* Sprint 34: the page asks us to warm the cache with the booted engine's
 * artifacts — on a first visit the boot's own fetches ran before we
 * controlled the page, so they never reached the cache. Only URLs not yet
 * cached are fetched; the reply names what was added. */
function warm(urls) {
  return caches.open(CACHE).then(function (cache) {
    var added = []
    var failed = []
    return urls.reduce(function (chain, url) {
      return chain.then(function () {
        return cache.match(url, MATCH).then(function (hit) {
          if (hit) return
          return fetch(url).then(function (response) {
            if (response && response.ok && response.type === 'basic') { added.push(url); return cache.put(url, response) }
            failed.push(url)
          }).catch(function () { failed.push(url) })
        })
      })
    }, Promise.resolve()).then(function () { return { added: added, failed: failed } })
  })
}

self.addEventListener('message', function (event) {
  var data = event.data
  if (!data || data.type !== 'warm' || !Array.isArray(data.urls)) return
  var urls = data.urls.filter(function (u) { return typeof u === 'string' && new URL(u, self.location.href).origin === self.location.origin })
  var reply = function (result) {
    if (event.source && typeof event.source.postMessage === 'function') event.source.postMessage({ type: 'warmed', urls: urls, added: result.added, failed: result.failed })
  }
  var job = warm(urls).then(reply, function () { reply({ added: [], failed: urls }) })
  if (typeof event.waitUntil === 'function') event.waitUntil(job)
})

self.addEventListener('fetch', function (event) {
  var request = event.request
  if (request.method !== 'GET') return
  var url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/sw.js')) return
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }
  event.respondWith(cacheFirst(request))
})
