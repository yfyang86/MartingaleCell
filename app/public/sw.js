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
      return caches.match(INDEX).then(function (cached) {
        return cached || new Response('ConsCell is offline and has not been loaded before.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      })
    })
}

function cacheFirst(request) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached
    return fetch(request).then(function (response) {
      if (response && response.ok && response.type === 'basic') {
        var copy = response.clone()
        caches.open(CACHE).then(function (cache) { cache.put(request, copy) })
      }
      return response
    })
  })
}

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
