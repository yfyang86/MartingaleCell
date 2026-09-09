import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import Ide from '@/pages/Ide'
import Examples from '@/pages/Examples'
import Docs from '@/pages/Docs'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="ide" element={<Ide />} />
        <Route path="examples" element={<Examples />} />
        <Route path="docs" element={<Docs />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  )
}
