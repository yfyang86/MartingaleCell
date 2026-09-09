/* Shared types for the ConsCell Lisp runtime layer. */

import type { PlotAttachment } from '@/plot/gnuplot'

export type EngineStatus =
  | 'booting'
  | 'ready-ecl'
  | 'ready-jscl'
  | 'ready-mock'
  | 'error'

export type EngineKind = 'ecl' | 'jscl' | 'mock' | null

export interface EvalResult {
  stdout: string
  values: string[]
  warnings: string[]
  error?: string
  /** Condition type when the engine could report one (e.g. DIVISION-BY-ZERO). */
  errorType?: string
  durationMs: number
  aborted?: boolean
  /** gnuplot captures (worker ;;PLOT64 markers) rendered as in-browser SVG plots. */
  plots?: PlotAttachment[]
  /** Reader package after the job (worker ;;PACKAGE: marker) — `in-package` persists across cells. */
  package?: string
  /** Named user frames at signal time, innermost first (worker ;;FRAME: markers). */
  frames?: string[]
  /** The restart the user picked while the job was paused in the debugger. */
  restartUsed?: string
}

/** Per-job evaluation options (mirrors the settings drawer). */
export interface EvalOptions {
  /** bytecodes-compile each top-level form before running it (evalMode: 'compile') */
  compile?: boolean
  /** pause in the debugger on an unhandled error (worker ;;DEBUG: protocol) */
  debug?: boolean
}

/** One live restart offered while a job is paused. */
export interface DebugRestart {
  index: number
  name: string
  report: string
}

/** A job paused in the debugger (worker ;;DEBUG-WAIT). */
export interface DebugPause {
  jobId: number
  condition: string
  errorType?: string
  frames: string[]
  restarts: DebugRestart[]
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
export type LogSource = 'RUNTIME' | 'COMPILER' | 'EVAL' | 'WORKER' | 'STORAGE' | 'UI' | 'PROJECT'

/* ---- project loading ---- */

export interface ProjectFilePayload {
  path: string
  content: string
}

/** Structured progress streamed while a project loads (worker ;;FILE:/;;PKG:/;;SYM:/;;NOTE:/;;HINT: markers). */
export type LoadEvent =
  | { kind: 'file'; path: string; status: 'loading' | 'ok' | 'warn' | 'error'; message: string }
  | { kind: 'package'; name: string; externalCount: number }
  | { kind: 'symbol'; pkg: string; name: string }
  | { kind: 'note'; message: string }
  | { kind: 'hint'; message: string }
  | { kind: 'plot'; plot: PlotAttachment }

/* ---- worker protocol (public/wecl-worker.js) ---- */

export type WorkerInMessage =
  | { type: 'eval'; id: number; code: string; compile?: boolean; debug?: boolean }
  | { type: 'restart'; id: number; index: number; value?: string }
  | { type: 'load-project'; id: number; files: ProjectFilePayload[] }
  | { type: 'modules-snapshot'; id: number }
  | { type: 'modules-restore'; id: number; files: { path: string; content: string }[] }

export type WorkerOutMessage =
  | { type: 'boot'; line: string }
  | { type: 'ready' }
  | { type: 'bootfail'; message: string }
  | { type: 'stdout'; id: number; text: string }
  | { type: 'stderr'; id: number; text: string }
  | { type: 'done'; id: number }
  | { type: 'joberror'; id: number; message: string }
  | { type: 'load-progress'; id: number; path: string; status: string; message: string }
  | { type: 'load-note'; id: number; note: string }
  | { type: 'modules-data'; id: number; files: { path: string; content: string }[] }
  | { type: 'crash'; message: string }
