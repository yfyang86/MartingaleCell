import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)

/* Sprint 31: offline after the first load. Production builds only (the dev
 * server serves modules the worker must not cache); the version in the
 * query names the cache, so a new build installs a new worker. */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(__APP_VERSION__)}`).catch(() => { /* no offline support, nothing else changes */ })
  })
}
