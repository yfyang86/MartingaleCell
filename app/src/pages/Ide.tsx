/* /ide — the ConsCell workspace shell.
 * 48px toolbar · resizable editor | (session / log) splits · 28px status bar.
 * Boots the WECL runtime with a full-screen transcript, falls back to
 * JSCL → mock so the IDE always evaluates something. */

import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Group, Panel, Separator, useGroupRef } from 'react-resizable-panels'
import { Toaster } from 'sonner'
import { X } from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { useUi } from '@/store/ui'
import { useProject } from '@/store/project'
import { runtime } from '@/lisp/runtime'
import Toolbar from '@/components/ide/Toolbar'
import EditorPanel from '@/components/ide/EditorPanel'
import ExplorerPanel from '@/components/ide/ExplorerPanel'
import SessionPanel from '@/components/ide/SessionPanel'
import LogPanel from '@/components/ide/LogPanel'
import StatusBar from '@/components/ide/StatusBar'
import CommandPalette from '@/components/ide/CommandPalette'
import SettingsDrawer from '@/components/ide/SettingsDrawer'
import BootScreen from '@/components/ide/BootScreen'
import Modals from '@/components/ide/Modals'
import {
  evaluateFormAtPoint, evaluateAllForms, newBuffer, saveBuffers,
  decodeShareHash, loadExamples, loadExampleIntoBuffer,
} from '@/components/ide/actions'
import { cn } from '@/lib/utils'

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    on()
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

/* separator: 6px hit area, 1px hairline, steel on hover/drag */
function Gutter({ vertical, onReset }: { vertical?: boolean; onReset: () => void }) {
  return (
    <Separator
      onDoubleClick={onReset}
      className={cn(
        'group/gutter relative z-10 flex items-center justify-center bg-transparent outline-none',
        vertical ? 'h-[6px] cursor-row-resize' : 'w-[6px] cursor-col-resize',
      )}
    >
      <span
        className={cn(
          'bg-hairline transition-colors duration-150 group-hover/gutter:bg-steel',
          vertical ? 'h-px w-full' : 'h-full w-px',
        )}
      />
    </Separator>
  )
}

export default function Ide() {
  const location = useLocation()
  const hydrated = useWorkspace((s) => s.hydrated)
  const engineStatus = useWorkspace((s) => s.engineStatus)
  const bootLines = useWorkspace((s) => s.bootLines)
  const bootFailed = useWorkspace((s) => s.bootFailed)
  const splitH = useWorkspace((s) => s.splitH)
  const splitV = useWorkspace((s) => s.splitV)
  const isNarrow = useMediaQuery('(max-width: 1023px)')
  const isTiny = useMediaQuery('(max-width: 767px)')
  const mobileView = useWorkspace((s) => s.mobileView)
  const setMobileView = useWorkspace((s) => s.setMobileView)
  const bannerDismissed = useUi((s) => s.bannerDismissed)
  const explorerOpen = useUi((s) => s.explorerOpen)
  const groupH = useGroupRef()
  const groupV = useGroupRef()
  const deepLinkHandled = useRef(false)
  /* boot completes the first time any engine becomes ready (store-derived) */
  const bootDone = useWorkspace((s) => s.bootDone)

  /* hydrate, then boot the runtime */
  useEffect(() => {
    const ws = useWorkspace.getState()
    void useProject.getState().hydrateProject()
    void ws.hydrate().then(() => {
      /* engine status mirror + transition logging */
      runtime.subscribeStatus(() => {
        const s = useWorkspace.getState()
        const prev = s.engineStatus
        s.setEngine(runtime.status, runtime.versionLabel)
        /* a fresh image reads in CL-USER — keep the pill honest after restart/interrupt */
        if (s.packageName !== runtime.currentPackage) s.setPackageName(runtime.currentPackage)
        if (prev !== runtime.status) {
          const names: Record<string, string> = {
            'booting': 'starting runtime…',
            'ready-ecl': 'ECL (ANSI Common Lisp → WebAssembly) ready',
            'ready-jscl': 'JSCL fallback ready (pure JS — CL subset)',
            'ready-mock': 'mock interpreter engaged (demo)',
            'error': 'runtime fault',
          }
          s.addLog(runtime.status === 'error' ? 'ERROR' : 'INFO', 'RUNTIME', `engine → ${names[runtime.status] ?? runtime.status}`)
        }
      })
      runtime.subscribeBoot((line) => {
        const s = useWorkspace.getState()
        s.addBootLine(line)
        /* verbosity: quiet keeps the transcript out of the INFO stream */
        s.addLog(s.settings.verbosity === 'quiet' ? 'DEBUG' : 'INFO', 'RUNTIME', line)
      })
      /* settings → image: *print-length* on every ready transition (a fresh
       * image forgets it) and whenever the slider moves */
      let lastPrintLength: number | null = null
      const applyPrintLength = (n: number) => {
        if (runtime.engine !== 'ecl') return
        lastPrintLength = n
        void runtime.setPrintLength(n).then((r) => {
          if (r.error) useWorkspace.getState().addLog('WARN', 'RUNTIME', `print length: ${r.error}`)
        })
      }
      runtime.subscribeStatus(() => {
        if (runtime.status === 'ready-ecl') applyPrintLength(useWorkspace.getState().settings.printLength)
      })
      useWorkspace.subscribe((s, prev) => {
        const n = s.settings.printLength
        if (n !== prev.settings.printLength && n !== lastPrintLength) applyPrintLength(n)
      })
      void runtime.init().then(() => {
        const s = useWorkspace.getState()
        if (runtime.status === 'error') s.setBootFailed(true)
      }).catch(() => useWorkspace.getState().setBootFailed(true))
    })
    return () => { /* singleton runtime survives route changes */ }
  }, [])

  /* boot failure detection: runtime falls back to jscl/mock internally, so
   * bootFailed only when init() itself gave up entirely — which it never
   * does (mock always works). The BootScreen failure path instead triggers
   * on a hard worker exception surfaced via engineStatus==='error'. */

  /* deep links: /ide?example=<slug> and /ide#s=<lz-string> */
  useEffect(() => {
    if (!hydrated || deepLinkHandled.current) return
    deepLinkHandled.current = true
    const hashPayload = decodeShareHash(location.hash)
    if (hashPayload) {
      useWorkspace.getState().newBuffer(hashPayload.name, hashPayload.code)
      useWorkspace.getState().addLog('INFO', 'UI', 'Loaded shared buffer from URL')
      return
    }
    const slug = new URLSearchParams(location.search).get('example')
    if (slug) {
      void loadExamples().then((list) => {
        const ex = list.find((e) => e.slug === slug)
        if (ex) loadExampleIntoBuffer(ex)
        else useWorkspace.getState().addLog('WARN', 'UI', `Example "${slug}" not found`)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  /* app-wide keyboard shortcuts (design §8). NB: a comment must not begin
   * with "global" — ESLint reads that as a globals directive. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return /* CodeMirror (or an input) already handled it */
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (!(e.ctrlKey || e.metaKey)) return
      }
      const mod = e.ctrlKey || e.metaKey
      const ui = useUi.getState()
      const ws = useWorkspace.getState()
      if (mod && e.key === 'Enter' && e.shiftKey) { e.preventDefault(); evaluateAllForms() }
      else if (mod && e.key === 'Enter') { e.preventDefault(); evaluateFormAtPoint() }
      else if (mod && e.key === '.') { e.preventDefault(); if (ws.evaluating) ui.setConfirm('interrupt') }
      else if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); ui.setPaletteOpen(!ui.paletteOpen) }
      else if (mod && e.shiftKey && (e.key === 'P' || e.key === 'p')) { e.preventDefault(); ui.setPaletteOpen(true) }
      else if (mod && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); newBuffer() }
      else if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveBuffers() }
      else if (mod && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); ui.toggleExplorer() }
      else if (mod && e.shiftKey && (e.key === 'L' || e.key === 'l')) { e.preventDefault(); ui.setConfirm('clear-session') }
      else if (mod && e.key === '/') { e.preventDefault(); ui.setShortcutsOpen(!ui.shortcutsOpen) }
      else if (e.key === 'Escape') { if (ui.paletteOpen) ui.setPaletteOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const showBoot = !bootDone || bootFailed

  const panels = (
    <>
      <Panel id="editor" minSize="360px" defaultSize={`${splitH}%`} className="min-h-0">
        <EditorPanel />
      </Panel>
      <Gutter onReset={() => groupH.current?.setLayout({ editor: 55, right: 45 })} />
      <Panel id="right" minSize="360px" defaultSize={`${100 - splitH}%`} className="min-h-0">
        <Group
          orientation="vertical"
          groupRef={groupV}
          defaultLayout={{ session: splitV, log: 100 - splitV }}
          onLayoutChange={(l) => useWorkspace.getState().setSplits(useWorkspace.getState().splitH, l.session ?? 60)}
          className="h-full"
        >
          <Panel id="session" minSize="180px" className="min-h-0">
            <SessionPanel />
          </Panel>
          <Gutter vertical onReset={() => groupV.current?.setLayout({ session: 60, log: 40 })} />
          <Panel id="log" minSize="180px" className="min-h-0">
            <LogPanel />
          </Panel>
        </Group>
      </Panel>
    </>
  )

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-abyss text-primary">
      <Toaster
        position="bottom-left"
        offset={16}
        visibleToasts={3}
        duration={3500}
        toastOptions={{
          style: {
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-hairline)',
            color: 'var(--text-primary)',
            fontSize: '12.5px',
          },
        }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.2, 0.7, 0.3, 1], delay: 0.04 }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Toolbar />

        {isTiny && !bannerDismissed && (
          <div className="flex items-center justify-between gap-3 border-b border-hairline bg-raised px-3 py-2 text-[12px] text-secondary">
            <span>ConsCell is built for keyboards — best experienced on desktop.</span>
            <button className="text-muted hover:text-primary" onClick={() => useUi.getState().dismissBanner()} aria-label="Dismiss">
              <X size={13} />
            </button>
          </div>
        )}

        {isNarrow ? (
          /* single-column tabbed mode */
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-hairline bg-panel px-3">
              {(['files', 'editor', 'session', 'log'] as const).map((v) => (
                <button
                  key={v}
                  className={cn(
                    'relative px-3 py-1 text-[12px] font-medium capitalize transition-colors duration-100',
                    mobileView === v ? 'text-primary' : 'text-muted hover:text-secondary',
                  )}
                  onClick={() => setMobileView(v)}
                >
                  {v}
                  {mobileView === v && (
                    <motion.span layoutId="mobile-tab" className="absolute inset-x-2 bottom-0 h-[2px] bg-steel" transition={{ duration: 0.15 }} />
                  )}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {mobileView === 'files' && <ExplorerPanel />}
              {mobileView === 'editor' && <EditorPanel />}
              {mobileView === 'session' && <SessionPanel />}
              {mobileView === 'log' && <LogPanel />}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <AnimatePresence initial={false}>
              {explorerOpen && <ExplorerPanel key="explorer" />}
            </AnimatePresence>
            <div className="min-w-0 flex-1">
              <Group
                orientation="horizontal"
                groupRef={groupH}
                defaultLayout={{ editor: splitH, right: 100 - splitH }}
                onLayoutChange={(l) => useWorkspace.getState().setSplits(l.editor ?? 55, useWorkspace.getState().splitV)}
                className="h-full"
              >
                {panels}
              </Group>
            </div>
          </div>
        )}

        <StatusBar />
      </motion.div>

      <CommandPalette />
      <SettingsDrawer />
      <Modals />

      <AnimatePresence>
        {showBoot && (
          <BootScreen
            lines={bootLines}
            failed={bootFailed || (!bootDone && engineStatus === 'error')}
            onRetry={() => {
              useWorkspace.getState().setBootFailed(false)
              void runtime.restart()
            }}
            onDemo={() => {
              useWorkspace.getState().setBootFailed(false)
              runtime.useMock()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
