/* Zustand workspace store: buffers, session cells, logs, settings.
 * Persisted to IndexedDB via idb-keyval (debounced). */

import { create } from 'zustand'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import type { ConditionDetail, DebugPause, EngineStatus, InputRequest, LogLevel, LogSource } from '@/lisp/types'
import type { PlotAttachment } from '@/plot/gnuplot'
import type { TerminalFrame } from '@/terminal/ansi'
import { pushHistory, sanitizeHistory } from '@/session/history'
import { getEnginePref, setEnginePref, type EnginePref } from '@/lisp/engine-pref'

/** Where a buffer's content lives: the scratch workspace or a project file. */
export type BufferOrigin = { type: 'scratch' } | { type: 'project'; path: string } | { type: 'cell'; cellId: string; n: number }

export interface IdeBuffer {
  id: string
  name: string
  content: string
  dirty: boolean
  /** undefined / 'scratch' = plain workspace buffer */
  origin?: BufferOrigin
}

/** paused = the image is suspended in the debugger, waiting for a restart choice */
/** 'paused' = in the debugger; 'input' = blocked on standard input */
export type CellStatus = 'queued' | 'running' | 'paused' | 'input' | 'done' | 'error' | 'aborted'

export interface ProjectFileStatus {
  path: string
  status: 'pending' | 'ok' | 'warn' | 'error' | 'skipped'
  message?: string
}

/** Payload of a "project load" cell (see project/load.ts). */
export interface ProjectLoadInfo {
  projectName: string
  files: ProjectFileStatus[]
  packages: { name: string; externalCount: number }[]
  hint?: string
}

export interface Cell {
  id: string
  n: number
  input: string
  pkg: string
  bufferName?: string
  status: CellStatus
  stdout: string
  values: string[]
  warnings: string[]
  error?: string
  errorType?: string
  /** named user frames at signal time, innermost first (ECL only) */
  frames?: string[]
  /** condition slots (datum/expected/name/…) at signal time (ECL only) */
  details?: ConditionDetail[]
  /** the job is blocked on standard input (status 'input') */
  inputRequest?: InputRequest
  /** live debugger state while status === 'paused' */
  debug?: DebugPause
  durationMs: number
  startedAt: number
  restartsUsed: number
  resumedVia?: string
  /** 'project' cells render the project-load tree instead of values */
  kind?: 'eval' | 'project'
  project?: ProjectLoadInfo
  /** gnuplot captures (worker ;;PLOT64 markers) rendered as SVG plots */
  plots?: PlotAttachment[]
  /** live ANSI screen, when the cell's output is escape-code driven */
  terminal?: TerminalFrame
  /** appended from a Markdown transcript, not evaluated in this session */
  imported?: boolean
  /** the buffer this cell was opened into ("Open as buffer"); re-run evaluates that buffer's current text */
  bufferId?: string
  /** id of the first cell in this cell's re-run chain (Sprint 21); absent on a first run */
  lineage?: string
}

export interface LogEntry {
  id: string
  ts: number
  level: LogLevel
  source: LogSource
  message: string
  details?: string
  cellRef?: number
  /** TRACE rows */
  trace?: { ms: number; forms: string }
  /** a project file position to jump to (located load warnings) */
  location?: { path: string; line: number; col: number }
}

/* Every field here is wired to something real (Sprint 2). `minimap` and
 * `heapSize` were removed: CodeMirror has no minimap and the wasm heap is
 * fixed by the WECL build — stale keys in persisted data are ignored. */
export interface IdeSettings {
  fontSize: number
  ligatures: boolean
  rainbowParens: boolean
  lineWrap: boolean
  autosave: boolean
  tabWidth: 2 | 4
  /** compile: bytecodes-compile each top-level form before running it */
  evalMode: 'eval' | 'compile'
  /** Ctrl+S also evaluates every form of the active buffer */
  autoEvalOnSave: boolean
  /** `*print-length*` in the image; 0 = unlimited */
  printLength: number
  /** transcript export: clip values longer than this many characters (0 = whole) */
  transcriptValueLimit: number
  /** how boot lines / engine noise land in the log */
  verbosity: 'quiet' | 'normal' | 'verbose'
  /** pause in the interactive debugger on an unhandled error (ECL only) */
  debugOnError: boolean
  /** Lisp implementation (Sprint 27): auto = ECL then JSCL then mock; ecl = ECL only; sbcl = SBCL, ECL if it cannot boot */
  engine: EnginePref
}

export const DEFAULT_SETTINGS: IdeSettings = {
  fontSize: 13.5,
  ligatures: true,
  rainbowParens: true,
  lineWrap: false,
  autosave: true,
  tabWidth: 2,
  evalMode: 'eval',
  autoEvalOnSave: false,
  printLength: 100,
  transcriptValueLimit: 0,
  verbosity: 'normal',
  engine: 'auto',
  debugOnError: true,
}

export const WELCOME_CODE = `;;;; Welcome to ConsCell — Common Lisp, compiled to WASM.
;;;; Press Ctrl+Enter to evaluate the form at point.

(defun fib (n)
  "Naive recursive Fibonacci — try (fib 25)."
  (if (< n 2)
      n
      (+ (fib (1- n)) (fib (- n 2)))))

(fib 15)
`

const IDB_KEY = 'conscell-workspace-v1'
const MAX_CELLS = 1000
const MAX_LOGS = 2000

let uid = 1
export const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${uid++}`

interface Persisted {
  buffers: IdeBuffer[]
  activeBufferId: string | null
  cells: Cell[]
  cellCounter: number
  settings: IdeSettings
  splitH: number
  splitV: number
  visited: boolean
  /** session-box ↑/↓ history, newest first (Sprint 20) */
  sessionHistory?: string[]
}

interface WorkspaceState {
  hydrated: boolean
  freshVisit: boolean
  buffers: IdeBuffer[]
  activeBufferId: string | null
  cells: Cell[]
  cellCounter: number
  historyTrimmed: boolean
  /** session-box input history, newest first, capped — persisted with the workspace */
  sessionHistory: string[]
  logs: LogEntry[]
  settings: IdeSettings
  engineStatus: EngineStatus
  engineLabel: string
  /** true once ANY engine has reported ready (boot screen dismissal) */
  bootDone: boolean
  evaluating: boolean
  packageName: string
  splitH: number
  splitV: number
  saveState: 'saved' | 'saving'
  bootLines: string[]
  bootFailed: boolean
  /** an artifact streaming in during boot (Sprint 27) */
  bootProgress: { file: string; loaded: number; total: number | null } | null
  mobileView: 'editor' | 'session' | 'log' | 'files'

  hydrate: () => Promise<void>
  // buffers
  newBuffer: (name?: string, content?: string, origin?: BufferOrigin) => string
  closeBuffer: (id: string) => void
  closeOtherBuffers: (id: string) => void
  duplicateBuffer: (id: string) => void
  renameBuffer: (id: string, name: string) => void
  setActiveBuffer: (id: string) => void
  updateBufferContent: (id: string, content: string) => void
  markSaved: () => void
  markBufferSaved: (id: string) => void
  // cells
  addCell: (c: Omit<Cell, 'id' | 'n'>) => Cell
  updateCell: (id: string, patch: Partial<Cell>) => void
  appendCellStdout: (id: string, chunk: string) => void
  removeCell: (id: string) => void
  clearCells: () => void
  pushSessionHistory: (text: string) => void
  // logs
  addLog: (level: LogLevel, source: LogSource, message: string, opts?: { details?: string; cellRef?: number; trace?: { ms: number; forms: string }; location?: { path: string; line: number; col: number } }) => void
  clearLogs: () => void
  // misc
  setSettings: (patch: Partial<IdeSettings>) => void
  setEngine: (status: EngineStatus, label: string) => void
  setEvaluating: (v: boolean) => void
  setPackageName: (p: string) => void
  setSplits: (h: number, v: number) => void
  addBootLine: (line: string) => void
  setBootFailed: (v: boolean) => void
  setBootProgress: (p: { file: string; loaded: number; total: number | null } | null) => void
  setMobileView: (v: 'editor' | 'session' | 'log' | 'files') => void
  flushSave: () => void
  resetWorkspace: () => void
}

function makeUntitled(buffers: IdeBuffer[]): string {
  let i = 1
  const names = new Set(buffers.map((b) => b.name))
  while (names.has(`untitled-${i}.lisp`)) i++
  return `untitled-${i}.lisp`
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useWorkspace = create<WorkspaceState>((set, get) => {
  const persist = () => {
    const s = get()
    const data: Persisted = {
      buffers: s.buffers.map((b) => ({ ...b, dirty: false })),
      activeBufferId: s.activeBufferId,
      cells: s.cells.slice(-MAX_CELLS),
      cellCounter: s.cellCounter,
      settings: s.settings,
      splitH: s.splitH,
      splitV: s.splitV,
      visited: true,
      sessionHistory: s.sessionHistory,
    }
    set({ saveState: 'saving' })
    idbSet(IDB_KEY, data)
      .then(() => set({ saveState: 'saved' }))
      .catch(() => set({ saveState: 'saved' }))
  }
  const scheduleSave = () => {
    if (!get().settings.autosave) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, 500)
  }

  return {
    hydrated: false,
    freshVisit: true,
    buffers: [],
    activeBufferId: null,
    cells: [],
    cellCounter: 0,
    historyTrimmed: false,
    sessionHistory: [],
    logs: [],
    settings: DEFAULT_SETTINGS,
    engineStatus: 'booting',
    engineLabel: '',
    bootDone: false,
    evaluating: false,
    packageName: 'CL-USER',
    splitH: 55,
    splitV: 60,
    saveState: 'saved',
    bootLines: [],
    bootFailed: false,
    bootProgress: null,
    mobileView: 'editor',

    hydrate: async () => {
      try {
        const data = await idbGet<Persisted>(IDB_KEY)
        if (data) {
          set({
            hydrated: true,
            freshVisit: !data.visited,
            buffers: data.buffers ?? [],
            activeBufferId: data.activeBufferId ?? data.buffers?.[0]?.id ?? null,
            cells: data.cells ?? [],
            cellCounter: data.cellCounter ?? (data.cells?.length ?? 0),
            /* settings saved before Sprint 27 have no `engine`: adopt the localStorage-only choice they were using */
            settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}), engine: data.settings?.engine ?? getEnginePref() },
            splitH: data.splitH ?? 55,
            splitV: data.splitV ?? 60,
            sessionHistory: sanitizeHistory(data.sessionHistory),
          })
        } else {
          set({ hydrated: true, freshVisit: true, settings: { ...DEFAULT_SETTINGS, engine: getEnginePref() } })
        }
      } catch {
        set({ hydrated: true, freshVisit: true, settings: { ...DEFAULT_SETTINGS, engine: getEnginePref() } })
        get().addLog('WARN', 'STORAGE', 'Could not read workspace from IndexedDB — starting fresh')
      }
      const s = get()
      /* keep the runtime's copy of the engine choice in step with the persisted setting (a reset or an import of settings must win) */
      setEnginePref(s.settings.engine ?? 'auto')
      if (s.buffers.length === 0) {
        const id = s.newBuffer('scratch.lisp', WELCOME_CODE)
        set({ activeBufferId: id })
      }
    },

    newBuffer: (name, content = '', origin) => {
      const id = nextId('buf')
      const finalName = name ?? makeUntitled(get().buffers)
      set((s) => ({
        buffers: [...s.buffers, { id, name: finalName, content, dirty: false, origin }],
        activeBufferId: id,
      }))
      scheduleSave()
      return id
    },
    closeBuffer: (id) => {
      set((s) => {
        const buffers = s.buffers.filter((b) => b.id !== id)
        const activeBufferId = s.activeBufferId === id ? (buffers[buffers.length - 1]?.id ?? null) : s.activeBufferId
        return { buffers, activeBufferId }
      })
      scheduleSave()
    },
    closeOtherBuffers: (id) => {
      set((s) => ({ buffers: s.buffers.filter((b) => b.id === id), activeBufferId: id }))
      scheduleSave()
    },
    duplicateBuffer: (id) => {
      const b = get().buffers.find((x) => x.id === id)
      if (!b) return
      const base = b.name.replace(/\.lisp$/, '')
      get().newBuffer(`${base}-copy.lisp`, b.content)
    },
    renameBuffer: (id, name) => {
      const clean = name.trim() || 'untitled.lisp'
      set((s) => ({ buffers: s.buffers.map((b) => (b.id === id ? { ...b, name: clean.endsWith('.lisp') ? clean : clean + '.lisp' } : b)) }))
      scheduleSave()
    },
    setActiveBuffer: (id) => { set({ activeBufferId: id }); scheduleSave() },
    updateBufferContent: (id, content) => {
      const cur = get().buffers.find((b) => b.id === id)
      if (!cur || cur.content === content) return
      set((s) => ({ buffers: s.buffers.map((b) => (b.id === id ? { ...b, content, dirty: true } : b)) }))
      scheduleSave()
    },
    markSaved: () => {
      set((s) => ({ buffers: s.buffers.map((b) => ({ ...b, dirty: false })) }))
      persist()
    },
    markBufferSaved: (id) => {
      set((s) => ({ buffers: s.buffers.map((b) => (b.id === id ? { ...b, dirty: false } : b)) }))
      scheduleSave()
    },

    addCell: (c) => {
      const n = get().cellCounter + 1
      const cell: Cell = { ...c, id: nextId('cell'), n }
      set((s) => {
        let cells = [...s.cells, cell]
        const historyTrimmed = cells.length > MAX_CELLS
        if (historyTrimmed) cells = cells.slice(-MAX_CELLS)
        return { cells, cellCounter: n, historyTrimmed }
      })
      scheduleSave()
      return cell
    },
    updateCell: (id, patch) => {
      set((s) => ({ cells: s.cells.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
      scheduleSave()
    },
    appendCellStdout: (id, chunk) => {
      set((s) => ({
        cells: s.cells.map((c) => (c.id === id ? { ...c, stdout: c.stdout ? c.stdout + '\n' + chunk : chunk } : c)),
      }))
    },
    removeCell: (id) => { set((s) => ({ cells: s.cells.filter((c) => c.id !== id) })); scheduleSave() },
    /* clear cells: numbering restarts at [1]. The reader package is NOT
     * touched — it mirrors the live image, and clearing the transcript does
     * not change what the image reads in (Restart Lisp image does). */
    clearCells: () => {
      set({ cells: [], cellCounter: 0, historyTrimmed: false, evaluating: false })
      scheduleSave()
    },

    pushSessionHistory: (text) => {
      const next = pushHistory(get().sessionHistory, text)
      if (next.length === get().sessionHistory.length && next[0] === get().sessionHistory[0]) return
      set({ sessionHistory: next })
      scheduleSave()
    },

    addLog: (level, source, message, opts) => {
      const entry: LogEntry = { id: nextId('log'), ts: Date.now(), level, source, message, ...opts }
      set((s) => ({ logs: [...s.logs.slice(-(MAX_LOGS - 1)), entry] }))
    },
    clearLogs: () => set({ logs: [] }),

    setSettings: (patch) => {
      set((s) => ({ settings: { ...s.settings, ...patch } }))
      if (patch.engine) setEnginePref(patch.engine) /* the runtime reads localStorage at boot */
      scheduleSave()
    },
    setEngine: (status, label) => set((s) => ({
      engineStatus: status, engineLabel: label,
      bootDone: s.bootDone || status.startsWith('ready-'),
    })),
    setEvaluating: (v) => set({ evaluating: v }),
    setPackageName: (p) => set({ packageName: p }),
    setSplits: (h, v) => { set({ splitH: h, splitV: v }); scheduleSave() },
    addBootLine: (line) => set((s) => ({ bootLines: [...s.bootLines, line] })),
    setBootFailed: (v) => set({ bootFailed: v }),
    setBootProgress: (bootProgress) => set({ bootProgress }),
    setMobileView: (v) => set({ mobileView: v }),
    flushSave: () => { if (saveTimer) clearTimeout(saveTimer); persist() },
    resetWorkspace: () => {
      if (saveTimer) clearTimeout(saveTimer)
      idbSet(IDB_KEY, undefined).catch(() => {})
      set({
        buffers: [], activeBufferId: null, cells: [], cellCounter: 0,
        historyTrimmed: false, sessionHistory: [], settings: DEFAULT_SETTINGS, freshVisit: true,
      })
      setEnginePref('auto') /* the engine choice resets with the workspace (Sprint 27) */
      const id = get().newBuffer('scratch.lisp', WELCOME_CODE)
      set({ activeBufferId: id })
    },
  }
})
