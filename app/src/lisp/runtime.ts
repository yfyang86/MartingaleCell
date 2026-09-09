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

import type { EngineKind, EngineStatus, EvalOptions, EvalResult, LoadEvent, ProjectFilePayload, WorkerInMessage, WorkerOutMessage } from './types'
import { mockEval } from './mock'
import { loadJsclEngine } from './jscl-engine'
import { parsePlotMarker, PLOT_MARKER, type PlotAttachment } from '@/plot/gnuplot'
import { get as idbGet, set as idbSet } from 'idb-keyval'

const BOOT_TIMEOUT_MS = 30_000
const MODULES_IDB_KEY = 'conscell-modules-v1'
const MODULES_CHANGED_MARKER = ';;MODULES-CHANGED'
/** Printed by cc:eval-string at the end of every eval job: the package the next job reads in. */
const PACKAGE_MARKER = ';;PACKAGE:'

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
}

export interface LoadCallbacks extends EvalCallbacks {
  onLoadEvent?: (e: LoadEvent) => void
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
}

type Listener = () => void

/** Split `;;=>` payload into top-level values (paren/string aware). */
export function splitValues(payload: string): string[] {
  const out: string[] = []
  let depth = 0, inStr = false, cur = ''
  for (let i = 0; i < payload.length; i++) {
    const c = payload[i]
    if (inStr) {
      cur += c
      if (c === '\\') { cur += payload[i + 1] ?? ''; i++ }
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; cur += c; continue }
    if (c === '(') depth++
    if (c === ')') depth--
    if (/\s/.test(c) && depth === 0) {
      if (cur.trim()) out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  if (cur.trim()) out.push(cur)
  return out
}

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
  let frames: string[] | undefined
  const outLines: string[] = []

  const handle = (line: string, isErr: boolean) => {
    const t = line
    if (t.startsWith(';;=>')) {
      const payload = t.slice(4).trim()
      if (payload && payload !== '; no values') values.push(...splitValues(payload))
      return
    }
    if (t.startsWith(';;WARNING:')) { warnings.push(t.slice(10).trim()); return }
    if (t.startsWith(';;ERRTYPE:')) { pendingType = t.slice(10).trim(); pendingFrames = []; return }
    if (t.startsWith(';;FRAME:')) { pendingFrames.push(t.slice(8).trim()); return }
    if (t.startsWith(';;ERROR:')) {
      const msg = t.slice(8).trim()
      if (!error) {
        error = msg
        if (pendingType) {
          /* the image's own type-of — authoritative */
          errorType = pendingType
          if (pendingFrames.length > 0) frames = pendingFrames
        } else {
          /* reader errors and non-ECL engines: best-effort guess from the text */
          const m = msg.match(/(DIVISION-BY-ZERO|UNDEFINED-FUNCTION|UNBOUND-VARIABLE|TYPE-ERROR|SIMPLE-ERROR|READER-ERROR|reader)/i)
          errorType = m ? m[1].toUpperCase().replace('READER', 'READER-ERROR') : 'SIMPLE-ERROR'
        }
      }
      pendingType = undefined
      pendingFrames = []
      return
    }
    if (!isErr) outLines.push(t)
    else if (t.trim()) outLines.push('; ' + t) /* engine noise, keep visible */
  }
  stdoutLines.forEach((l) => handle(l, false))
  stderrLines.forEach((l) => handle(l, true))
  return { stdout: outLines.join('\n'), values, warnings, error, errorType, durationMs, ...(frames ? { frames } : {}) }
}

class LispRuntime {
  status: EngineStatus = 'booting'
  engine: EngineKind = null
  versionLabel = ''
  /** Reader package of the live image (follows every ;;PACKAGE: marker; CL-USER after a (re)boot). */
  currentPackage = 'CL-USER'
  private worker: Worker | null = null
  private jobs = new Map<number, Job>()
  private queue: Promise<void> = Promise.resolve()
  private nextId = 1
  private statusListeners = new Set<Listener>()
  private bootListeners = new Set<(line: string) => void>()
  private jsclEval: ((code: string) => Promise<EvalResult>) | null = null
  private bootPromise: Promise<void> | null = null
  /** pending modules-snapshot/restore round-trips (ids ≥ 1e6, disjoint from eval jobs). */
  private moduleOps = new Map<number, { resolve: (files: ModuleFile[] | null) => void; reject: (e: Error) => void }>()
  private nextModuleOpId = 1_000_000

  subscribeStatus(fn: Listener): () => void { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn) }
  subscribeBoot(fn: (line: string) => void): () => void { this.bootListeners.add(fn); return () => this.bootListeners.delete(fn) }
  private emitStatus() { this.statusListeners.forEach((f) => f()) }
  private emitBoot(line: string) { this.bootListeners.forEach((f) => f(line)) }

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
    if (this.engine !== 'ecl') {
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
    if (this.engine !== 'ecl') {
      return Promise.resolve({ stdout: '', values: [], warnings: [], durationMs: 0 })
    }
    const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 'nil'
    return this.eval(`(setf *print-length* ${v})`)
  }

  /** Boot the best available engine. Safe to call again after failure (retry). */
  init(): Promise<void> {
    if (this.bootPromise) return this.bootPromise
    this.setStatus('booting', null, '')
    this.bootPromise = this.bootEcl()
      .then(() => {
        /* worker FS is per-session — bring the persisted module tree back */
        void this.restoreModules()
      })
      .catch(async (e) => {
        this.emitBoot(`ECL/WASM boot failed: ${e?.message ?? e}`)
        this.killWorker()
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
    return new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('WASM boot timed out (30s)')) }
      }, BOOT_TIMEOUT_MS)
      let worker: Worker
      try {
        worker = new Worker('/wecl-worker.js')
      } catch (e) {
        clearTimeout(timer)
        reject(e as Error)
        return
      }
      this.worker = worker
      this.emitBoot('λ conscell boot — spawning runtime worker')
      worker.onerror = (ev) => {
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error(ev.message || 'worker error')) }
        else this.onCrash('worker error: ' + (ev.message || 'unknown'))
      }
      worker.onmessage = (ev: MessageEvent<WorkerOutMessage>) => {
        const m = ev.data
        switch (m.type) {
          case 'boot':
            this.emitBoot(m.line)
            break
          case 'ready':
            if (!settled) {
              settled = true
              clearTimeout(timer)
              this.setStatus('ready-ecl', 'ecl', 'ECL 24.5 · wasm32')
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
        if (this.engine === 'ecl' && this.worker) {
          const id = this.nextId++
          const job: Job = {
            id, code, callbacks, stdout: [], stderr: [],
            resolve, reject, started: true, t0, kind: 'eval', plots: [],
          }
          this.jobs.set(id, job)
          this.worker.postMessage({ type: 'eval', id, code, compile: !!opts.compile } satisfies WorkerInMessage)
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
  loadProject(files: ProjectFilePayload[], callbacks: LoadCallbacks = {}): Promise<EvalResult> {
    if (this.engine !== 'ecl' || !this.worker) {
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
        }
        this.jobs.set(id, job)
        this.worker!.postMessage({ type: 'load-project', id, files })
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
      this.worker.postMessage({ ...msg, id } as WorkerInMessage)
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
    if (this.engine !== 'ecl' || !this.worker) return
    try {
      const files = await this.workerOp({ type: 'modules-snapshot' })
      if (files) await idbSet(MODULES_IDB_KEY, files)
    } catch { /* persistence is best-effort — never surface to the cell */ }
  }

  /** Rewrite /modules from the IndexedDB copy and reload the CL registry. */
  async restoreModules(): Promise<void> {
    if (this.engine !== 'ecl' || !this.worker) return
    try {
      const files = await idbGet<ModuleFile[]>(MODULES_IDB_KEY)
      if (files && files.length > 0) await this.workerOp({ type: 'modules-restore', files })
    } catch { /* restore is best-effort */ }
  }

  /** Interrupt = restart the worker (wasm cannot be preempted). */  async interrupt(): Promise<void> {
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
}

export const runtime = new LispRuntime()
