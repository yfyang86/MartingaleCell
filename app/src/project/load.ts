/* "Load Project into Runtime" orchestration: collects fresh project files,
 * sends them to the worker, streams per-file progress into a dedicated
 * project-load session cell, and merges the loaded API into autocomplete. */

import { toast } from 'sonner'
import { runtime } from '@/lisp/runtime'
import type { LoadEvent } from '@/lisp/types'
import { useWorkspace, type ProjectLoadInfo } from '@/store/workspace'
import { useProject, collectLispFiles } from '@/store/project'
import { registerProjectSymbols } from '@/components/ide/completion'
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
    })
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
      })
      s.addLog(
        result.error ? 'ERROR' : 'INFO',
        'PROJECT',
        `Project "${info.projectName}" loaded — ${okCount}/${files.length} files ok${result.error ? ` — ${truncate(result.error, 120)}` : ''}`,
        { cellRef: cell.n, details: fileReport.join('\n') || undefined },
      )
      result.warnings.forEach((w) => s.addLog('WARN', 'PROJECT', w, { cellRef: cell.n }))
      if (!result.error) toast(`Project loaded — ${okCount}/${files.length} files, ${pkgs.length} package(s)`)
    }
  } catch (e) {
    const s = useWorkspace.getState()
    s.updateCell(cell.id, { status: 'error', error: (e as Error)?.message ?? String(e), errorType: 'RUNTIME-FAULT' })
    s.addLog('ERROR', 'PROJECT', `project load failed: ${(e as Error)?.message ?? e}`, { cellRef: cell.n })
  } finally {
    const s = useWorkspace.getState()
    const stillBusy = s.cells.some((c) => c.status === 'running' || c.status === 'paused' || (c.status === 'queued' && c.id !== cell.id))
    if (!stillBusy) s.setEvaluating(false)
  }
}
