import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { migrateStorage } from './lib/rename-migration'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './i18n'

/* Sprint 35: the IndexedDB stores hydrate on mount, so the rename migration
 * must finish before the first render. It never rejects. */
migrateStorage().then(() => {
  createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
      <I18nProvider>
        <App />
      </I18nProvider>
    </BrowserRouter>,
  )
})

/* Sprint 31: offline after the first load. Production builds only (the dev
 * server serves modules the worker must not cache); the version in the
 * query names the cache, so a new build installs a new worker. */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(__APP_VERSION__)}`).catch(() => { /* no offline support, nothing else changes */ })
  })
}
