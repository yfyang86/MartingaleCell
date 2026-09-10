import DocsSidebar from '@/components/docs/DocsSidebar'
import { SectionDivider } from '@/components/docs/shared'
import GettingStarted from '@/components/docs/GettingStarted'
import FeatureMatrix from '@/components/docs/FeatureMatrix'
import SessionCells from '@/components/docs/SessionCells'
import Editor from '@/components/docs/Editor'
import DebuggerSection from '@/components/docs/DebuggerSection'
import Projects from '@/components/docs/Projects'
import Modules from '@/components/docs/Modules'
import Shortcuts from '@/components/docs/Shortcuts'
import Persistence from '@/components/docs/Persistence'
import Faq from '@/components/docs/Faq'

export default function Docs() {
  return (
    <div className="mx-auto flex max-w-7xl gap-10 px-4 sm:px-6">
      <DocsSidebar />

      <div className="min-w-0 max-w-3xl flex-1 py-14 pb-28">
        <GettingStarted />
        <SectionDivider />
        <FeatureMatrix />
        <SectionDivider />
        <SessionCells />
        <SectionDivider />
        <Editor />
        <SectionDivider />
        <DebuggerSection />
        <SectionDivider />
        <Projects />
        <SectionDivider />
        <Modules />
        <SectionDivider />
        <Shortcuts />
        <SectionDivider />
        <Persistence />
        <SectionDivider />
        <Faq />
      </div>
    </div>
  )
}
