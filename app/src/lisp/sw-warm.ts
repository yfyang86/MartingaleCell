/* Sprint 34: after an engine boots, ask the service worker to warm its cache
 * with that engine's artifacts. On a first visit the boot's own fetches ran
 * before the worker controlled the page, so they never reached the cache;
 * `navigator.serviceWorker.ready` resolves once a worker is active, whether
 * or not this page is controlled, and `active.postMessage` reaches it. The
 * worker fetches only what is missing and answers `warmed`; the document
 * carries `data-sw-warmed` afterwards so a test can wait for it. */

export const ENGINE_ARTIFACTS: Record<'ecl' | 'sbcl', string[]> = {
  ecl: ['/wecl-worker.js', '/wecl/boot.js', '/wecl/wecl.js', '/wecl/wecl.wasm'],
  sbcl: ['/sbcl-worker.js', '/sbcl/sbcl.wasm.gz', '/sbcl/sbcl.core.gz', '/sbcl/sbcl-core.wasm.gz'],
}

export interface WarmResult { added: string[]; failed: string[] }

/** The same-origin resources this page has loaded so far (its hashed
 * chunks, styles, images): on a first visit they were fetched before the
 * worker controlled the page, so they are warmed together with the engine. */
export function pageResourceUrls(): string[] {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return []
  const origin = location.origin
  const seen = new Set<string>()
  for (const e of performance.getEntriesByType('resource')) {
    const name = (e as PerformanceResourceTiming).name
    if (name.startsWith(origin) && !/\/sw\.js(\?|$)/.test(name)) seen.add(name)
  }
  seen.add(new URL('index.html', document.baseURI).href)
  return [...seen]
}

/** Resources that load after the first warm (lazy chunks, images) are warmed
 * as they appear, for `windowMs`, so the offline copy of the page is complete.
 * Fire-and-forget: the worker dedupes, replies are ignored. */
export function followLateResources(windowMs = 60_000): () => void {
  if (typeof PerformanceObserver === 'undefined' || !('serviceWorker' in navigator)) return () => {}
  const origin = location.origin
  let pending: string[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    timer = null
    const urls = pending
    pending = []
    if (urls.length === 0) return
    navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'warm', urls })).catch(() => { /* no worker */ })
  }
  const obs = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      const name = (e as PerformanceResourceTiming).name
      if (name.startsWith(origin) && !/\/sw\.js(\?|$)/.test(name)) pending.push(name)
    }
    if (pending.length > 0 && timer === null) timer = setTimeout(flush, 300)
  })
  try { obs.observe({ type: 'resource', buffered: false }) } catch { return () => {} }
  const stop = () => { obs.disconnect(); if (timer !== null) { clearTimeout(timer); flush() } }
  setTimeout(stop, windowMs)
  return stop
}

/** Resolves with what the worker added; null when there is no service worker (dev server, unsupported browser). */
export function warmEngineArtifacts(engine: 'ecl' | 'sbcl', timeoutMs = 120_000): Promise<WarmResult | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null)
  const urls = [...ENGINE_ARTIFACTS[engine].map((u) => new URL(u, document.baseURI).href), ...pageResourceUrls()]
  followLateResources()
  return new Promise((resolve) => {
    let done = false
    const finish = (r: WarmResult | null) => {
      if (done) return
      done = true
      navigator.serviceWorker.removeEventListener('message', onMessage)
      if (r) document.documentElement.dataset.swWarmed = r.failed.length === 0 ? engine : `${engine}:partial`
      resolve(r)
    }
    const onMessage = (ev: MessageEvent) => {
      const d = ev.data as { type?: string; added?: string[]; failed?: string[] } | null
      if (d && d.type === 'warmed') finish({ added: d.added ?? [], failed: d.failed ?? [] })
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    const timer = setTimeout(() => finish(null), timeoutMs)
    navigator.serviceWorker.ready.then((reg) => {
      const target = reg.active
      if (!target) { clearTimeout(timer); finish(null); return }
      target.postMessage({ type: 'warm', urls })
    }).catch(() => { clearTimeout(timer); finish(null) })
  })
}
