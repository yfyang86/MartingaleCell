/* "Load Project into Runtime" orchestration: collects fresh project files,
 * sends them to the worker, streams per-file progress into a dedicated
 * project-load session cell, and merges the loaded API into autocomplete. */

import { toast } from 'sonner'
import { runtime } from '@/lisp/runtime'
import type { LoadEvent } from '@/lisp/types'
import { useWorkspace, type ProjectLoadInfo } from '@/store/workspace'
import { useProject, collectLispFiles, byteOffsetToLineCol, type ProjectDefinition } from '@/store/project'
import { registerProjectSymbols, registerProjectDefinitions } from '@/components/ide/completion'
import { autoDownloadSavedPlots } from '@/plot/download'

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/** Match a worker-reported path (absolute /project/… or a bare system name)
 * to a project-relative file path. */
function matchFile(files: { path: string }[], reported: string): string | null {
  const rel = reported.replace(/^\/project\//, '').replace(/^\/+/, '')
  if (files.some((f) => f.path === rel)) return rel
  /* bare system name (e.g. "cl-plot") → the asd that defines it */
  if (!reported.includes('/')) {
    const asd = files.find((f) => f.path.toLowerCase().endsWith(`/${reported.toLowerCase()}.asd`)
      || f.path.toLowerCase() === `${reported.toLowerCase()}.asd`)
    if (asd) return asd.path
  }
  return null
}

export async function loadProjectIntoRuntime(): Promise<void> {
  const ps = useProject.getState()
  const ws = useWorkspace.getState()
  if (!ps.kind) {
    toast('No project open — open a folder or import a ZIP first')
    return
  }
  if (runtime.status === 'error') {
    toast('Runtime crashed — restart it before loading a project')
    return
  }
  let files: { path: string; content: string }[]
  try {
    files = await collectLispFiles()
  } catch (e) {
    toast('Could not read project files')
    ws.addLog('ERROR', 'PROJECT', `collect files: ${(e as Error)?.message ?? e}`)
    return
  }
  if (files.length === 0) {
    toast('No Lisp files (.lisp/.lsp/.cl/.asd) in this project')
    return
  }

  const info: ProjectLoadInfo = {
    projectName: ps.name ?? 'project',
    files: files.map((f) => ({ path: f.path, status: 'pending' as const })),
    packages: [],
  }
  const cell = ws.addCell({
    input: `(load-project "${info.projectName}" · ${files.length} files)`,
    pkg: ws.packageName,
    bufferName: undefined,
    status: 'queued',
    stdout: '',
    values: [],
    warnings: [],
    durationMs: 0,
    startedAt: Date.now(),
    restartsUsed: 0,
    kind: 'project',
    project: info,
  })
  ws.addLog('INFO', 'PROJECT', `Loading ${files.length} files from "${info.projectName}" into the runtime…`, { cellRef: cell.n })
  ws.setEvaluating(true)

  const patchProject = (fn: (p: ProjectLoadInfo) => ProjectLoadInfo) => {
    const s = useWorkspace.getState()
    const cur = s.cells.find((c) => c.id === cell.id)
    if (cur?.project) s.updateCell(cell.id, { project: fn(cur.project) })
  }
  const setFile = (path: string, status: 'ok' | 'warn' | 'error' | 'skipped', message?: string) =>
    patchProject((p) => ({
      ...p,
      files: p.files.map((f) => (f.path === path ? { ...f, status, message } : f)),
    }))

  const symbolMap = new Map<string, string[]>()
  const fileReport: string[] = []
  const definitions: ProjectDefinition[] = []
  const contentOf = new Map(files.map((f) => [f.path, f.content]))
  let workerHint: string | undefined

  const onLoadEvent = (e: LoadEvent) => {
    const s = useWorkspace.getState()
    if (e.kind === 'file') {
      if (e.status === 'loading') return
      const rel = matchFile(files, e.path)
      const status = e.status
      if (rel) {
        setFile(rel, status, e.message || undefined)
        fileReport.push(`${status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✗'} ${rel}${e.message ? ` — ${e.message}` : ''}`)
        if (status === 'error') s.addLog('ERROR', 'PROJECT', `load ${rel}: ${truncate(e.message, 160)}`, { cellRef: cell.n })
      } else if (e.message) {
        fileReport.push(`; ${e.path}: ${e.message}`)
      }
    } else if (e.kind === 'package') {
      patchProject((p) => ({
        ...p,
        packages: [...p.packages.filter((x) => x.name !== e.name), { name: e.name, externalCount: e.externalCount }],
      }))
    } else if (e.kind === 'symbol') {
      const list = symbolMap.get(e.pkg) ?? []
      list.push(e.name)
      symbolMap.set(e.pkg, list)
    } else if (e.kind === 'definition') {
      /* byte offset from the image → line/col against the file we sent */
      const rel = matchFile(files, e.path)
      if (rel) {
        const { line, col } = byteOffsetToLineCol(contentOf.get(rel) ?? '', e.offset)
        definitions.push({ name: e.name.toUpperCase(), kind: e.defKind, path: rel, line, col })
      }
    } else if (e.kind === 'plot') {
      /* load-time (show fig) — attach the gnuplot capture to this load cell */
      const cur = s.cells.find((c) => c.id === cell.id)
      s.updateCell(cell.id, { plots: [...(cur?.plots ?? []), e.plot] })
      s.addLog('INFO', 'PROJECT', `gnuplot intercepted — plot rendered in cell [${cell.n}]`, { cellRef: cell.n })
    } else if (e.kind === 'note') {
      s.addLog('WARN', 'PROJECT', e.message, { cellRef: cell.n })
    } else if (e.kind === 'hint') {
      /* worker-verified hint (symbol checked with find-class/fboundp/boundp) */
      workerHint = e.message
    }
  }

  try {
    const result = await runtime.loadProject(files, {
      onStart: () => {
        const s = useWorkspace.getState()
        s.updateCell(cell.id, { status: 'running', startedAt: Date.now() })
        s.setEvaluating(true)
      },
      onLoadEvent,
      onStream: (chunk) => {
        /* engine noise during load (compile notes etc.) → cell OUT well */
        if (chunk.trim()) useWorkspace.getState().appendCellStdout(cell.id, chunk)
      },
      /* a failing project form pauses the load in the debugger (Sprint 5) —
       * the project cell renders the same restart block as an eval cell */
      onDebug: (pause) => {
        const s = useWorkspace.getState()
        s.updateCell(cell.id, { status: 'paused', debug: pause, errorType: pause.errorType, frames: pause.frames, details: pause.details })
        s.addLog('WARN', 'PROJECT', `${pause.errorType ?? 'ERROR'} — load paused in debugger — ${truncate(pause.condition, 120)} — cell [${cell.n}]`, {
          cellRef: cell.n,
          details: pause.restarts.map((r) => `[${r.index}] ${r.name} — ${r.report}`).join('\n'),
        })
      },
      onDebugNote: (message) => {
        const s = useWorkspace.getState()
        s.appendCellStdout(cell.id, `; debugger: ${message}`)
        s.addLog('WARN', 'PROJECT', `debugger: ${message}`, { cellRef: cell.n })
      },
    }, { debug: ws.settings.debugOnError })
    const s = useWorkspace.getState()

    /* cl-plot (save fig "name.png" …) during load — auto-download the PNG */
    if (result.plots && result.plots.length > 0) {
      autoDownloadSavedPlots(result.plots, (msg) => s.addLog('WARN', 'PROJECT', msg, { cellRef: cell.n }))
    }

    /* anything never reported is "skipped" (not part of the asdf system) */
    patchProject((p) => ({
      ...p,
      files: p.files.map((f) =>
        f.status === 'pending'
          ? { ...f, status: 'skipped', message: 'not loaded — not an asdf component' }
          : f,
      ),
    }))

    /* register autocomplete + build the "then call it" hint */
    const pkgs = [...symbolMap.entries()].map(([name, symbols]) => ({ name, symbols: symbols.sort() }))
    registerProjectSymbols(pkgs)
    registerProjectDefinitions(definitions)
    useProject.getState().setDefinitions(definitions)
    if (definitions.length > 0) s.addLog('DEBUG', 'PROJECT', `${definitions.length} definition${definitions.length === 1 ? '' : 's'} indexed — F12 / Ctrl+click jumps to them`, { cellRef: cell.n })

    /* warnings that know where they came from → log rows with a jump link */
    for (const w of result.locatedWarnings ?? []) {
      const rel = matchFile(files, w.path)
      if (!rel) continue
      const { line, col } = byteOffsetToLineCol(contentOf.get(rel) ?? '', w.offset)
      s.addLog('WARN', 'PROJECT', w.message, { cellRef: cell.n, location: { path: rel, line, col } })
    }
    useProject.getState().setLoadedPackages(
      pkgs.map((p) => ({
        name: p.name,
        symbols: p.symbols,
        externalCount: p.symbols.length,
      })),
    )
    const cur = s.cells.find((c) => c.id === cell.id)
    const pkgNames = (cur?.project?.packages ?? []).map((p) => `${p.name} (${p.externalCount} external symbols)`)
    /* the worker's ;;HINT: is authoritative — its symbol is verified to
     * exist (find-class/fboundp/boundp) before it is printed; the local
     * heuristic below is only a fallback for loads without loader support */
    let hint: string | undefined = workerHint
    if (!hint && pkgs.length > 0) {
      const first = pkgs[0]
      const sample = first.symbols.find((x) => /^(make-|defun|figure)/i.test(x)) ?? first.symbols[0]
      hint = `Loaded packages: ${pkgNames.join(', ')} — call e.g. (${first.name.toLowerCase()}:${(sample ?? '…').toLowerCase()} …)`
    } else if (!hint && !result.error) {
      hint = 'Files loaded — no new packages were defined; definitions live in CL-USER.'
    }
    patchProject((p) => ({ ...p, hint }))

    const okCount = (cur?.project?.files ?? info.files).filter((f) => f.status === 'ok').length
    if (result.aborted) {
      s.updateCell(cell.id, { status: 'aborted', durationMs: result.durationMs })
      s.addLog('WARN', 'PROJECT', `Project load aborted (worker restarted)`, { cellRef: cell.n })
    } else {
      s.updateCell(cell.id, {
        status: result.error ? 'error' : 'done',
        error: result.error,
        errorType: result.errorType,
        warnings: result.warnings,
        durationMs: result.durationMs,
        debug: undefined,
        ...(result.restartUsed ? { resumedVia: result.restartUsed } : {}),
      })
      s.addLog(
        result.error ? 'ERROR' : 'INFO',
        'PROJECT',
        `Project "${info.projectName}" loaded — ${okCount}/${files.length} files ok${result.error ? ` — ${truncate(result.error, 120)}` : ''}`,
        { cellRef: cell.n, details: fileReport.join('\n') || undefined },
      )
      /* located warnings were logged above with their jump links */
      const located = new Set((result.locatedWarnings ?? []).map((w) => w.message))
      result.warnings.filter((w) => !located.has(w)).forEach((w) => s.addLog('WARN', 'PROJECT', w, { cellRef: cell.n }))
      if (!result.error) toast(`Project loaded — ${okCount}/${files.length} files, ${pkgs.length} package(s)`)
    }
  } catch (e) {
    const s = useWorkspace.getState()
    s.updateCell(cell.id, { status: 'error', error: (e as Error)?.message ?? String(e), errorType: 'RUNTIME-FAULT' })
    s.addLog('ERROR', 'PROJECT', `project load failed: ${(e as Error)?.message ?? e}`, { cellRef: cell.n })
  } finally {
    const s = useWorkspace.getState()
    const stillBusy = s.cells.some((c) => c.status === 'running' || c.status === 'paused' || c.status === 'input' || (c.status === 'queued' && c.id !== cell.id))
    if (!stillBusy) s.setEvaluating(false)
  }
}
