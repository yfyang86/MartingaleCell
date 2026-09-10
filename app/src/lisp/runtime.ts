/* Main-thread Lisp runtime client.
 *
 * Fallback ladder (mandatory):
 *   1. WECL worker (ECL → WASM, self-hosted at /wecl/)   → 'ready-ecl'
 *   2. JSCL from CDN (pure JS)                            → 'ready-jscl'
 *   3. Built-in mock interpreter                          → 'ready-mock'
 *
 * The IDE ALWAYS evaluates something. Engine transitions are surfaced via
 * subscribe() and logged by the workspace store.
 */

import type { ConditionDetail, DebugPause, DebugRestart, EngineKind, EngineStatus, EvalOptions, EvalResult, InputRequest, LoadEvent, LocatedWarning, ProjectFilePayload, WorkerInMessage, WorkerOutMessage, DefinitionEvent } from './types'
import { mockEval } from './mock'
import { loadJsclEngine } from './jscl-engine'
import { parsePlotMarker, PLOT_MARKER, type PlotAttachment } from '@/plot/gnuplot'
import { get as idbGet, set as idbSet } from 'idb-keyval'

const BOOT_TIMEOUT_MS = 120_000 /* sbcl boots ~112 MB of artifacts; wecl is well under the old 30 s */
const MODULES_IDB_KEY = 'conscell-modules-v1'
const MODULES_CHANGED_MARKER = ';;MODULES-CHANGED'
/** Printed by cc:eval-string at the end of every eval job: the package the next job reads in. */
const PACKAGE_MARKER = ';;PACKAGE:'
import { getEnginePref, setEnginePref, type EnginePref } from './engine-pref'
export { getEnginePref, setEnginePref, type EnginePref }

/* the sbcl worker's shared-buffer layout (public/sbcl-worker.js) */
const SBCL_MAILBOX_OFF = 8192
const SBCL_MAILBOX_MAX = 8 << 20

/** One file of the persisted /modules tree (registry + package sources). */
export interface ModuleFile {
  path: string
  content: string
}

export interface EvalCallbacks {
  onStart?: () => void
  onStream?: (chunk: string, isErr: boolean) => void
  /** gnuplot capture arrived mid-job (worker ;;PLOT64 marker). */
  onPlot?: (plot: PlotAttachment) => void
  /** the job is paused in the debugger — answer with runtime.chooseRestart(). */
  onDebug?: (pause: DebugPause) => void
  /** a note from the debugger while paused (e.g. a value form failed). */
  onDebugNote?: (message: string) => void
  /** the job is blocked on standard input — answer with runtime.provideInput(). */
  onInputRequest?: (req: InputRequest) => void
  /** a definition was evaluated (worker ;;DEF:, eval jobs with a `path`). */
  onDefinition?: (d: DefinitionEvent) => void
}

export interface LoadCallbacks extends EvalCallbacks {
  onLoadEvent?: (e: LoadEvent) => void
}

/** `;;DEF: path|offset|NAME|kind` → DefinitionEvent (null when malformed). */
function parseDefMarker(line: string): DefinitionEvent | null {
  const t = line.trimStart()
  if (!t.startsWith(';;DEF:')) return null
  const [path = '', offset = '0', name = '', defKind = ''] = t.slice(6).trim().split('|')
  if (!path || !name) return null
  return { path, offset: parseInt(offset, 10) || 0, name, defKind }
}

interface Job {
  id: number
  code: string
  callbacks: LoadCallbacks
  stdout: string[]
  stderr: string[]
  resolve: (r: EvalResult) => void
  reject: (e: Error) => void
  started: boolean
  t0: number
  /** 'load' jobs intercept ;;FILE:/;;PKG:/;;SYM:/;;NOTE:/;;HINT: stdout markers into LoadEvents. */
  kind: 'eval' | 'load'
  /** gnuplot captures (;;PLOT64 markers) accumulated while the job runs. */
  plots: PlotAttachment[]
  /** job touched /modules (package-install/uninstall) → persist after done. */
  modulesChanged?: boolean
  /** reader package reported by the ;;PACKAGE: marker */
  package?: string
  /* ---- debugger state (streamed markers) ---- */
  lastErrorType?: string
  lastDetails: ConditionDetail[]
  lastFrames: string[]
  /** image suspended on js-wait inside %stdin, waiting for provideInput() */
  awaitingInput: boolean
  /** restart list being assembled between ;;DEBUG: and ;;DEBUG-WAIT */
  debugCondition?: string
  debugRestarts: DebugRestart[]
  /** image suspended on js-wait, waiting for chooseRestart() */
  paused: boolean
  restartUsed?: string
}

type Listener = () => void

/** Parse accumulated ECL output into a structured EvalResult. */
export function parseEclOutput(stdoutLines: string[], stderrLines: string[], durationMs: number): EvalResult {
  const values: string[] = []
  const warnings: string[] = []
  let error: string | undefined
  let errorType: string | undefined
  /* ;;ERRTYPE:/;;FRAME: arrive at signal time, before ;;ERROR: — keep the
   * ones belonging to the FIRST reported error only */
  let pendingType: string | undefined
  let pendingFrames: string[] = []
  let pendingDetails: ConditionDetail[] = []
  let frames: string[] | undefined
  let details: ConditionDetail[] | undefined
  const locatedWarnings: LocatedWarning[] = []
  const outLines: string[] = []

  const handle = (line: string, isErr: boolean) => {
    const t = line
    if (t.startsWith(';;=>')) {
      const payload = t.slice(4).trim()
      /* one value per line since Sprint 12 — a value may itself contain spaces (#<"SMOKE" package>) */
      if (payload && payload !== '; no values') values.push(payload)
      return
    }
    if (t.startsWith(';;WARNING:')) {
      const body = t.slice(10).trim()
      /* located form: /project/file.lisp|<byte-offset>|text */
      const lw = body.match(/^(\/[^|]+)\|(\d+)\|([\s\S]*)$/)
      if (lw) {
        warnings.push(lw[3].trim())
        locatedWarnings.push({ path: lw[1], offset: parseInt(lw[2], 10) || 0, message: lw[3].trim() })
      } else warnings.push(body)
      return
    }
    if (t.startsWith(';;ERRTYPE:')) { pendingType = t.slice(10).trim(); pendingFrames = []; pendingDetails = []; return }
    if (t.startsWith(';;FRAME:')) { pendingFrames.push(t.slice(8).trim()); return }
    if (t.startsWith(';;DETAIL:')) { const d = parseDetail(t); if (d) pendingDetails.push(d); return }
    if (t.startsWith(';;ERROR:')) {
      const msg = t.slice(8).trim()
      if (!error) {
        error = msg
        if (pendingType) {
          /* the image's own type-of — authoritative */
          errorType = pendingType
          if (pendingFrames.length > 0) frames = pendingFrames
          if (pendingDetails.length > 0) details = pendingDetails
        } else {
          /* reader errors and non-ECL engines: best-effort guess from the text */
          const m = msg.match(/(DIVISION-BY-ZERO|UNDEFINED-FUNCTION|UNBOUND-VARIABLE|TYPE-ERROR|SIMPLE-ERROR|READER-ERROR|reader)/i)
          errorType = m ? m[1].toUpperCase().replace('READER', 'READER-ERROR') : 'SIMPLE-ERROR'
        }
      }
      pendingType = undefined
      pendingFrames = []
      pendingDetails = []
      return
    }
    if (!isErr) outLines.push(t)
    else if (t.trim()) outLines.push('; ' + t) /* engine noise, keep visible */
  }
  stdoutLines.forEach((l) => handle(l, false))
  stderrLines.forEach((l) => handle(l, true))
  return {
    stdout: outLines.join('\n'), values, warnings, error, errorType, durationMs,
    ...(frames ? { frames } : {}),
    ...(details ? { details } : {}),
    ...(locatedWarnings.length > 0 ? { locatedWarnings } : {}),
  }
}

/** `;;DETAIL: key|value` → { key, value } (null for a malformed line). */
function parseDetail(line: string): ConditionDetail | null {
  const body = line.trimStart().slice(9).trim()
  const bar = body.indexOf('|')
  if (bar <= 0) return null
  return { key: body.slice(0, bar).trim(), value: body.slice(bar + 1).trim() }
}

class LispRuntime {
  status: EngineStatus = 'booting'
  engine: EngineKind = null
  versionLabel = ''
  /** Reader package of the live image (follows every ;;PACKAGE: marker; CL-USER after a (re)boot). */
  currentPackage = 'CL-USER'
  private worker: Worker | null = null
  /** the SBCL worker's request channel (set by the 'sbcl-sab' message) */
  private sbclSab: SharedArrayBuffer | null = null
  private jobs = new Map<number, Job>()
  private queue: Promise<void> = Promise.resolve()
  private nextId = 1
  private statusListeners = new Set<Listener>()
  private bootListeners = new Set<(line: string) => void>()
  private progressListeners = new Set<(p: { file: string; loaded: number; total: number | null }) => void>()
  private jsclEval: ((code: string) => Promise<EvalResult>) | null = null
  private bootPromise: Promise<void> | null = null
  /** pending modules-snapshot/restore round-trips (ids ≥ 1e6, disjoint from eval jobs). */
  private moduleOps = new Map<number, { resolve: (files: ModuleFile[] | null) => void; reject: (e: Error) => void }>()
  private nextModuleOpId = 1_000_000

  subscribeStatus(fn: Listener): () => void { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn) }
  subscribeBoot(fn: (line: string) => void): () => void { this.bootListeners.add(fn); return () => this.bootListeners.delete(fn) }
  private emitStatus() { this.statusListeners.forEach((f) => f()) }
  private emitBoot(line: string) { this.bootListeners.forEach((f) => f(line)) }
  /** artifact download progress while an engine boots (Sprint 27) */
  subscribeProgress(f: (p: { file: string; loaded: number; total: number | null }) => void): () => void {
    this.progressListeners.add(f)
    return () => this.progressListeners.delete(f)
  }

  private setStatus(s: EngineStatus, engine: EngineKind, label: string) {
    this.status = s
    this.engine = engine
    this.versionLabel = label
    /* a fresh image (boot, restart, interrupt-respawn) always reads in CL-USER */
    if (s === 'booting' || s.startsWith('ready-')) this.currentPackage = 'CL-USER'
    this.emitStatus()
  }

  /**
   * Switch the reader package of the live image (toolbar package pill).
   * Runs `(in-package …)` as a hidden job — no session cell — and resolves
   * with the job result; `result.package` is the package actually in effect
   * (unchanged when the package does not exist, with `result.error` set).
   */
  setPackage(name: string): Promise<EvalResult> {
    const clean = name.trim().toUpperCase()
    if (this.engine !== 'ecl' && this.engine !== 'sbcl') {
      /* jscl / mock have no real package system — track the label only */
      this.currentPackage = clean || 'CL-USER'
      return Promise.resolve({ stdout: '', values: [], warnings: [], durationMs: 0, package: this.currentPackage })
    }
    return this.eval(`(in-package "${clean.replace(/["\\]/g, '')}")`)
  }

  /**
   * Settings drawer → image: `*print-length*` is a plain global `setf`
   * (so a user's own `(setf *print-length* …)` persists too). Called on
   * every ready transition and whenever the setting changes. Hidden job,
   * no session cell; nil (unlimited) when n is 0 or not finite.
   */
  setPrintLength(n: number): Promise<EvalResult> {
    if (this.engine !== 'ecl' && this.engine !== 'sbcl') {
      return Promise.resolve({ stdout: '', values: [], warnings: [], durationMs: 0 })
    }
    const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 'nil'
    return this.eval(`(setf *print-length* ${v})`)
  }

  /** Boot the engine the preference asks for (see engine-pref.ts). Safe to call again after failure (retry). */
  init(): Promise<void> {
    if (this.bootPromise) return this.bootPromise
    this.setStatus('booting', null, '')
    const pref = getEnginePref()
    this.emitBoot(`engine preference: ${pref}${pref === 'ecl' ? ' (ECL only)' : ' (SBCL first — ECL if it cannot boot)'}`)
    this.bootPromise = (async () => {
      /* the alpha default: SBCL (the MIT+BSD core engine); ECL only when
       * explicitly chosen, or as the fallback when SBCL cannot boot */
      if (pref !== 'ecl') {
        try {
          await this.bootSbcl()
        } catch (e) {
          this.emitBoot(`SBCL/wasm boot failed: ${(e as Error)?.message ?? e} — falling back to ECL`)
          this.killWorker()
          this.sbclSab = null
          await this.bootEcl()
        }
      } else {
        await this.bootEcl()
      }
    })()
      .then(() => {
        /* worker FS is per-session — bring the persisted module tree back */
        void this.restoreModules()
      })
      .catch(async (e) => {
        this.emitBoot(`ECL/WASM boot failed: ${e?.message ?? e}`)
        this.killWorker()
        this.sbclSab = null
        if (pref === 'ecl') {
          /* an explicit ECL choice does not fall through to JSCL or the mock: the boot screen offers Retry / demo */
          this.emitBoot('Lisp implementation is set to ecl — not falling back to another engine')
          this.setStatus('error', null, '')
          this.bootPromise = null /* Retry (restart) or a later init() may try again */
          return
        }
        try {
          this.jsclEval = await loadJsclEngine((l) => this.emitBoot(l))
          this.setStatus('ready-jscl', 'jscl', 'JSCL 0.9.0 · js')
        } catch (e2) {
          this.emitBoot(`JSCL fallback failed: ${(e2 as Error)?.message ?? e2}`)
          this.emitBoot('falling back to built-in mock interpreter')
          this.setStatus('ready-mock', 'mock', 'mock interpreter')
        }
      })
      .finally(() => {
        /* allow re-init after a later restart */
      })
    return this.bootPromise
  }

  /** Skip straight to the mock (boot-failure "Continue with demo runtime"). */
  useMock() {
    this.killWorker()
    this.bootPromise = Promise.resolve()
    this.setStatus('ready-mock', 'mock', 'mock interpreter')
    this.emitBoot('demo runtime engaged — built-in mock interpreter')
  }

  private bootEcl(): Promise<void> {
    return this.spawnWorker('/wecl-worker.js', 'ecl', 'ECL 24.5 · wasm32')
  }

  /** The SBCL/wasm engine (public/sbcl-worker.js, artifacts at /sbcl/). */
  private async bootSbcl(): Promise<void> {
    const head = (url: string) => fetch(url, { method: 'HEAD' }).then((r) => r.ok && !/text\/html/i.test(r.headers.get('content-type') ?? '')).catch(() => false)
    const present = (await head('/sbcl/sbcl.wasm')) || (await head('/sbcl/sbcl.wasm.gz')) /* plain or gzip'd (Sprint 24) */
    if (!present) throw new Error('/sbcl/sbcl.wasm not found (copy the artifacts with scripts/fetch-sbcl.mjs)')
    /* a deep-enough native stack so runaway Lisp recursion reports a Lisp
     * storage-condition rather than an engine RangeError (SBCL-Handoff 4.5) */
    return this.spawnWorker('/sbcl-worker.js', 'sbcl', 'SBCL 2.4.8 · wasm32-wasip1', {
      resourceLimits: { stackSizeMb: 256 },
    })
  }

  /** Spawn a runtime worker and settle on its ready/bootfail message.
   * Used for the ECL worker and the SBCL worker alike — both speak the
   * same WorkerOutMessage protocol; the SBCL one additionally posts its
   * request channel ('sbcl-sab') before ready. */
  private spawnWorker(url: string, engine: Exclude<EngineKind, null>, label: string, opts?: { resourceLimits?: { stackSizeMb?: number } }): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error(`WASM boot timed out (${BOOT_TIMEOUT_MS / 1000}s)`)) }
      }, BOOT_TIMEOUT_MS)
      let worker: Worker
      try {
        worker = new Worker(url, opts?.resourceLimits ? { type: 'classic', resourceLimits: opts.resourceLimits } as WorkerOptions : undefined)
      } catch (e) {
        clearTimeout(timer)
        reject(e as Error)
        return
      }
      this.worker = worker
      this.emitBoot(`λ conscell boot — spawning runtime worker (${engine})`)
      worker.onerror = (ev) => {
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error(ev.message || 'worker error')) }
        else this.onCrash('worker error: ' + (ev.message || 'unknown'))
      }
      worker.onmessage = (ev: MessageEvent<WorkerOutMessage | { type: 'sbcl-sab'; sab: SharedArrayBuffer }>) => {
        const m = ev.data
        if (m.type === 'sbcl-sab') {
          this.sbclSab = m.sab
          return
        }
        switch (m.type) {
          case 'boot':
            this.emitBoot(m.line)
            break
          case 'progress':
            this.progressListeners.forEach((f) => f({ file: m.file, loaded: m.loaded, total: m.total }))
            break
          case 'ready':
            if (!settled) {
              settled = true
              clearTimeout(timer)
              this.setStatus(`ready-${engine}` as EngineStatus, engine, label)
              resolve()
            }
            break
          case 'bootfail':
            if (!settled) { settled = true; clearTimeout(timer); reject(new Error(m.message)) }
            break
          case 'stdout': case 'stderr': {
            const job = this.jobs.get(m.id)
            const line = m.text
            if (job) {
              if (m.type === 'stdout' && line.trimStart().startsWith(PLOT_MARKER)) { this.handlePlotMarker(job, line); break }
              if (m.type === 'stdout' && line.trimStart().startsWith(MODULES_CHANGED_MARKER)) { job.modulesChanged = true; break }
              if (m.type === 'stdout' && line.trimStart().startsWith(PACKAGE_MARKER)) {
                const name = line.trimStart().slice(PACKAGE_MARKER.length).trim()
                if (name) { job.package = name; this.currentPackage = name }
                break
              }
              if (job.kind === 'load' && m.type === 'stdout' && this.handleLoadMarker(job, line)) break
              if (job.kind === 'eval' && m.type === 'stdout' && line.trimStart().startsWith(';;DEF:')) {
                const d = parseDefMarker(line)
                if (d) job.callbacks.onDefinition?.(d)
                break
              }
              if (m.type === 'stderr' && this.handleDebugMarker(job, line)) break
              ;(m.type === 'stdout' ? job.stdout : job.stderr).push(line)
              job.callbacks.onStream?.(line, m.type === 'stderr')
            }
            break
          }
          case 'modules-data': {
            const op = this.moduleOps.get(m.id)
            if (op) { this.moduleOps.delete(m.id); op.resolve(m.files) }
            break
          }
          case 'load-progress': {
            const job = this.jobs.get(m.id)
            job?.callbacks.onLoadEvent?.({
              kind: 'file', path: m.path,
              status: (m.status as 'loading' | 'ok' | 'warn' | 'error') || 'ok',
              message: m.message ?? '',
            })
            break
          }
          case 'load-note': {
            const job = this.jobs.get(m.id)
            job?.callbacks.onLoadEvent?.({ kind: 'note', message: m.note })
            break
          }
          case 'done': {
            const op = this.moduleOps.get(m.id)
            if (op) { this.moduleOps.delete(m.id); op.resolve(null); break }
            const job = this.jobs.get(m.id)
            if (job) {
              this.jobs.delete(m.id)
              const r = parseEclOutput(job.stdout, job.stderr, performance.now() - job.t0)
              if (job.plots.length > 0) r.plots = job.plots
              if (job.package) r.package = job.package
              if (job.restartUsed) r.restartUsed = job.restartUsed
              if (job.modulesChanged) void this.persistModules()
              job.resolve(r)
            }
            break
          }
          case 'joberror': {
            const op = this.moduleOps.get(m.id)
            if (op) { this.moduleOps.delete(m.id); op.reject(new Error(m.message)); break }
            const job = this.jobs.get(m.id)
            if (job) {
              this.jobs.delete(m.id)
              if (job.modulesChanged) void this.persistModules()
              job.resolve({
                stdout: job.stdout.join('\n'), values: [], warnings: [],
                error: m.message, errorType: 'RUNTIME-FAULT',
                durationMs: performance.now() - job.t0,
                plots: job.plots.length > 0 ? job.plots : undefined,
              })
            }
            break
          }
          case 'crash':
            this.onCrash(m.message)
            break
        }
      }
    })
  }

  /** Decode a ;;PLOT64 marker (gnuplot capture) and attach it to the job.
   * Consumed before load-marker parsing so it works for eval AND load jobs. */
  private handlePlotMarker(job: Job, line: string): void {
    try {
      const plot = parsePlotMarker(line.trimStart())
      if (!plot) return
      job.plots.push(plot)
      job.callbacks.onPlot?.(plot)
      if (job.kind === 'load') job.callbacks.onLoadEvent?.({ kind: 'plot', plot })
    } catch {
      job.stdout.push('; [gnuplot plot payload could not be decoded]')
    }
  }

  /**
   * Debugger markers (stderr). ;;ERRTYPE:/;;FRAME: are mirrored (not
   * consumed) so parseEclOutput still sees them; ;;DEBUG:/;;RESTART:/
   * ;;DEBUG-WAIT/;;DEBUG-NOTE: are consumed. Returns true when consumed.
   */
  private handleDebugMarker(job: Job, line: string): boolean {
    const t = line.trimStart()
    if (t.startsWith(';;ERRTYPE:')) { job.lastErrorType = t.slice(10).trim(); job.lastFrames = []; job.lastDetails = []; return false }
    if (t.startsWith(';;FRAME:')) { job.lastFrames.push(t.slice(8).trim()); return false }
    if (t.startsWith(';;DETAIL:')) { const d = parseDetail(t); if (d) job.lastDetails.push(d); return false }
    if (t.startsWith(';;READ-WAIT')) {
      job.awaitingInput = true
      if (job.callbacks.onInputRequest) job.callbacks.onInputRequest({ jobId: job.id })
      else {
        /* nobody can answer (hidden job, no cell) — end the file rather than hang the image */
        job.stderr.push('; standard input is not available for this job (end of file)')
        setTimeout(() => this.provideInput(job.id, null), 0)
      }
      return true
    }
    if (t.startsWith(';;DEBUG:')) { job.debugCondition = t.slice(8).trim(); job.debugRestarts = []; return true }
    if (t.startsWith(';;RESTART:')) {
      const [idx = '0', name = '', ...rest] = t.slice(10).trim().split('|')
      job.debugRestarts.push({ index: parseInt(idx, 10) || 0, name, report: rest.join('|') })
      return true
    }
    if (t.startsWith(';;DEBUG-NOTE:')) { job.callbacks.onDebugNote?.(t.slice(13).trim()); return true }
    if (t.startsWith(';;DEBUG-WAIT')) {
      job.paused = true
      if (!job.callbacks.onDebug) {
        /* a pause nobody listens to must never hang the worker: decline it */
        setTimeout(() => this.chooseRestart(job.id, -1), 0)
        return true
      }
      job.callbacks.onDebug({
        jobId: job.id,
        condition: job.debugCondition ?? '',
        errorType: job.lastErrorType,
        details: job.lastDetails.slice(),
        frames: job.lastFrames.slice(),
        restarts: job.debugRestarts.slice(),
      })
      return true
    }
    return false
  }

  /**
   * Answer a paused job: invoke restart `index` (from the DebugPause list),
   * optionally with a Lisp form whose value is passed to the restart.
   * index -1 declines: the error is reported as if no debugger was on.
   */
  chooseRestart(jobId: number, index: number, value?: string): boolean {
    const job = this.jobs.get(jobId)
    if (!job || !job.paused || !this.worker) return false
    job.paused = false
    const chosen = job.debugRestarts.find((r) => r.index === index)
    job.restartUsed = index < 0 ? 'DECLINE' : (chosen?.name ?? `#${index}`)
    const msg: WorkerInMessage = { type: 'restart', id: jobId, index, ...(value != null && value.trim() ? { value: value.trim() } : {}) }
    this.send(msg)
    return true
  }

  /** Answer a job blocked on standard input with one line (null = end of file). */
  provideInput(jobId: number, text: string | null): boolean {
    const job = this.jobs.get(jobId)
    if (!job || !job.awaitingInput || !this.worker) return false
    job.awaitingInput = false
    this.send({ type: 'input', id: jobId, text } satisfies WorkerInMessage)
    return true
  }

  /** Parse a ;;FILE:/;;PKG:/;;SYM: marker line into a LoadEvent. Returns true when consumed. */
  private handleLoadMarker(job: Job, line: string): boolean {
    const t = line.trimStart()
    const emit = (e: LoadEvent) => job.callbacks.onLoadEvent?.(e)
    if (t.startsWith(';;FILE:')) {
      const [path = '', status = 'ok', ...rest] = t.slice(7).trim().split('|')
      emit({ kind: 'file', path, status: (status as 'ok' | 'warn' | 'error') || 'ok', message: rest.join('|') })
      return true
    }
    if (t.startsWith(';;PKG:')) {
      const [name = '', count = '0'] = t.slice(6).trim().split('|')
      emit({ kind: 'package', name, externalCount: parseInt(count, 10) || 0 })
      return true
    }
    if (t.startsWith(';;SYM:')) {
      const [pkg = '', name = ''] = t.slice(6).trim().split('|')
      if (pkg && name) emit({ kind: 'symbol', pkg, name })
      return true
    }
    if (t.startsWith(';;NOTE:')) {
      emit({ kind: 'note', message: t.slice(7).trim() })
      return true
    }
    if (t.startsWith(';;DEF:')) {
      const d = parseDefMarker(t)
      if (d) emit({ kind: 'definition', ...d })
      return true
    }
    if (t.startsWith(';;HINT:')) {
      emit({ kind: 'hint', message: t.slice(7).trim() })
      return true
    }
    return false
  }

  private onCrash(message: string) {
    this.emitBoot('runtime crashed: ' + message)
    this.setStatus('error', this.engine, this.versionLabel)
    for (const job of this.jobs.values()) {
      job.resolve({
        stdout: job.stdout.join('\n'), values: [], warnings: [],
        error: 'RUNTIME-FAULT: ' + message, errorType: 'RUNTIME-FAULT',
        durationMs: performance.now() - job.t0,
      })
    }
    this.jobs.clear()
  }

  private killWorker() {
    if (this.worker) { this.worker.terminate(); this.worker = null }
    this.sbclSab = null
  }

  /** Send a request to the live worker: postMessage for the ECL worker,
   * a mailbox write into the shared buffer for the SBCL worker (its
   * thread sits inside wasm and never processes onmessage). */
  private send(msg: WorkerInMessage): void {
    if (!this.worker) return
    if (this.engine === 'sbcl' && this.sbclSab) {
      void this.sbclSubmit(msg).catch((e) => this.onCrash('sbcl submit failed: ' + String(e?.message ?? e)))
    } else {
      this.worker.postMessage(msg)
    }
  }

  /** Write one JSON request into the SBCL worker's shared-buffer mailbox
   * and wake it. Requests are serialized by the eval queue; the worker
   * drains the flag at its next WASI call, so a busy mailbox just means
   * the image is still running the previous request. */
  private async sbclSubmit(msg: WorkerInMessage): Promise<void> {
    if (!this.sbclSab) throw new Error('sbcl channel not ready')
    const i32 = new Int32Array(this.sbclSab)
    const u8 = new Uint8Array(this.sbclSab)
    const bytes = new TextEncoder().encode(JSON.stringify(msg))
    if (bytes.length + 1 > SBCL_MAILBOX_MAX) throw new Error(`request too large for the sbcl mailbox (${bytes.length} bytes)`)
    const t0 = performance.now()
    while (Atomics.load(i32, 4) === 1) {
      if (performance.now() - t0 > 30_000) throw new Error('sbcl runtime did not drain its mailbox')
      await new Promise((r) => setTimeout(r, 15))
    }
    u8.set(bytes, SBCL_MAILBOX_OFF)
    u8[SBCL_MAILBOX_OFF + bytes.length] = 0
    Atomics.store(i32, 4, 1)
    Atomics.notify(i32, 4)
  }

  /** Evaluate code. Always resolves with an EvalResult (never rejects on Lisp errors). */
  eval(code: string, callbacks: EvalCallbacks = {}, opts: EvalOptions = {}): Promise<EvalResult> {
    return new Promise<EvalResult>((resolve, reject) => {
      const run = async () => {
        callbacks.onStart?.()
        if (this.status === 'error') {
          resolve({
            stdout: '', values: [], warnings: [],
            error: 'RUNTIME-FAULT: the runtime crashed — restart it from the toolbar',
            errorType: 'RUNTIME-FAULT', durationMs: 0,
          })
          return
        }
        const t0 = performance.now()
        if (this.engine === 'mock') {
          /* mock runs on the main thread; keep it snappy and stream stdout at end */
          await new Promise((r) => setTimeout(r, 0))
          const r = mockEval(code)
          if (r.stdout) callbacks.onStream?.(r.stdout.replace(/\n$/, ''), false)
          resolve(r)
          return
        }
        if (this.engine === 'jscl' && this.jsclEval) {
          const r = await this.jsclEval(code)
          if (r.stdout) callbacks.onStream?.(r.stdout.replace(/\n$/, ''), false)
          resolve({ ...r, durationMs: performance.now() - t0 })
          return
        }
        if ((this.engine === 'ecl' || this.engine === 'sbcl') && this.worker) {
          const id = this.nextId++
          const job: Job = {
            id, code, callbacks, stdout: [], stderr: [],
            resolve, reject, started: true, t0, kind: 'eval', plots: [],
            lastFrames: [], lastDetails: [], debugRestarts: [], paused: false, awaitingInput: false,
          }
          this.jobs.set(id, job)
          this.send({ type: 'eval', id, code, compile: !!opts.compile, debug: !!opts.debug, ...(opts.path ? { path: opts.path } : {}) } satisfies WorkerInMessage)
          return
        }
        reject(new Error('runtime not ready'))
      }
      this.queue = this.queue.then(run, run)
    })
  }

  /**
   * Load a whole project (list of path/content files) into the runtime.
   * Streams LoadEvents (per-file status, packages, symbols) via callbacks.
   * On non-ECL engines falls back to evaluating each file in order.
   */
  loadProject(files: ProjectFilePayload[], callbacks: LoadCallbacks = {}, opts: EvalOptions = {}): Promise<EvalResult> {
    const isWorkerEngine = (this.engine === 'ecl' || this.engine === 'sbcl') && !!this.worker
    if (!isWorkerEngine) {
      /* jscl / mock: evaluate files sequentially (package files first) */
      return (async () => {
        callbacks.onStart?.()
        const t0 = performance.now()
        const sorted = [...files].sort((a, b) => {
          const pa = /(^|\/)packages?\.[^.]+$/i.test(a.path) ? 0 : 1
          const pb = /(^|\/)packages?\.[^.]+$/i.test(b.path) ? 0 : 1
          return pa - pb || a.path.localeCompare(b.path)
        })
        const warnings: string[] = []
        let firstError: string | undefined
        const stdout: string[] = []
        for (const f of sorted) {
          if (!/\.(lisp|lsp|cl)$/i.test(f.path)) continue
          callbacks.onLoadEvent?.({ kind: 'file', path: f.path, status: 'loading', message: '' })
          const r = await this.eval(f.content)
          if (r.stdout) stdout.push(r.stdout)
          warnings.push(...r.warnings)
          if (r.error && !firstError) firstError = `${f.path}: ${r.error}`
          callbacks.onLoadEvent?.({
            kind: 'file', path: f.path,
            status: r.error ? 'error' : 'ok',
            message: r.error ?? '',
          })
        }
        return {
          stdout: stdout.join('\n'), values: [], warnings,
          error: firstError, errorType: firstError ? 'SIMPLE-ERROR' : undefined,
          durationMs: performance.now() - t0,
        } as EvalResult
      })()
    }
    return new Promise<EvalResult>((resolve, reject) => {
      const run = () => {
        callbacks.onStart?.()
        const id = this.nextId++
        const job: Job = {
          id, code: `(load-project ${files.length} files)`, callbacks,
          stdout: [], stderr: [], resolve, reject, started: true,
          t0: performance.now(), kind: 'load', plots: [],
          lastFrames: [], lastDetails: [], debugRestarts: [], paused: false, awaitingInput: false,
        }
        this.jobs.set(id, job)
        this.send({ type: 'load-project', id, files, debug: !!opts.debug } satisfies WorkerInMessage)
      }
      this.queue = this.queue.then(run, run)
    })
  }

  /* ---- module persistence (/modules ⇄ IndexedDB) ---- */

  /** Round-trip a modules-snapshot/restore message through the worker.
   * Snapshot resolves with the file list; restore resolves with null. */
  private workerOp(msg: { type: 'modules-snapshot' } | { type: 'modules-restore'; files: ModuleFile[] }): Promise<ModuleFile[] | null> {
    return new Promise((resolve, reject) => {
      if (!this.worker) { reject(new Error('runtime worker not running')); return }
      const id = this.nextModuleOpId++
      this.moduleOps.set(id, { resolve, reject })
      this.send({ ...msg, id } as WorkerInMessage)
      setTimeout(() => {
        if (this.moduleOps.has(id)) {
          this.moduleOps.delete(id)
          reject(new Error('modules operation timed out'))
        }
      }, 15_000)
    })
  }

  /** Snapshot /modules from the worker and store it in IndexedDB (best-effort). */
  async persistModules(): Promise<void> {
    if ((this.engine !== 'ecl' && this.engine !== 'sbcl') || !this.worker) return
    try {
      const files = await this.workerOp({ type: 'modules-snapshot' })
      if (files) await idbSet(MODULES_IDB_KEY, files)
    } catch { /* persistence is best-effort — never surface to the cell */ }
  }

  /** Rewrite /modules from the IndexedDB copy and reload the CL registry. */
  async restoreModules(): Promise<void> {
    if ((this.engine !== 'ecl' && this.engine !== 'sbcl') || !this.worker) return
    try {
      const files = await idbGet<ModuleFile[]>(MODULES_IDB_KEY)
      if (files && files.length > 0) await this.workerOp({ type: 'modules-restore', files })
    } catch { /* restore is best-effort */ }
  }

  /** Interrupt: SBCL takes the interrupt-pending word (Ctrl-C equivalent,
   * serviced at the next clock read / safe point); ECL has no preemption,
   * so its worker is respawned instead. */
  async interrupt(): Promise<void> {
    if (this.engine === 'sbcl' && this.sbclSab) {
      /* the interrupt request reaches the port (it acknowledges it at the
       * next safe point), but Lisp delivery is not implemented there yet —
       * so like ECL the running image is replaced; the bit stays set for
       * the day the port grows delivery */
      Atomics.store(new Int32Array(this.sbclSab), 5, 1)
      for (const job of this.jobs.values()) {
        job.resolve({
          stdout: job.stdout.join('\n'), values: [], warnings: [],
          error: undefined, aborted: true,
          durationMs: performance.now() - job.t0,
        })
      }
      this.jobs.clear()
      await this.respawnSbcl()
      return
    }
    if (this.engine !== 'ecl' || !this.worker) return
    for (const job of this.jobs.values()) {
      job.resolve({
        stdout: job.stdout.join('\n'), values: [], warnings: [],
        error: undefined, aborted: true,
        durationMs: performance.now() - job.t0,
      })
    }
    this.jobs.clear()
    await this.respawnEcl()
  }

  /** Restart the runtime; buffers/cells are kept by the store. */
  async restart(): Promise<void> {
    for (const job of this.jobs.values()) {
      job.resolve({
        stdout: job.stdout.join('\n'), values: [], warnings: [],
        error: undefined, aborted: true, durationMs: performance.now() - job.t0,
      })
    }
    this.jobs.clear()
    this.killWorker()
    this.jsclEval = null
    this.bootPromise = null
    this.setStatus('booting', null, '')
    await this.init()
  }

  private respawnEcl(): Promise<void> {
    this.killWorker()
    this.bootPromise = null
    return this.init()
  }

  private respawnSbcl(): Promise<void> {
    /* same dance, honoring the engine preference (sbcl first) */
    this.killWorker()
    this.bootPromise = null
    return this.init()
  }
}

export const runtime = new LispRuntime()
