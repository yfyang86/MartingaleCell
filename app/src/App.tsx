import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'

/* Route-level code splitting: every page loads on demand, so the entry
 * chunk is the router, the chrome (navbar, footer) and the UI kit. The
 * landing page's gsap/SplitText effects and the IDE (CodeMirror, runtime
 * client, plot renderer) never share a chunk. */
const Home = lazy(() => import('@/pages/Home'))
const Ide = lazy(() => import('@/pages/Ide'))
const Examples = lazy(() => import('@/pages/Examples'))
const Docs = lazy(() => import('@/pages/Docs'))

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center font-mono text-[12.5px] text-muted" aria-busy="true">
      λ loading…
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="ide" element={<Ide />} />
          <Route path="examples" element={<Examples />} />
          <Route path="docs" element={<Docs />} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
