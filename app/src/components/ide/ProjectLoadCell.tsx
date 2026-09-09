/* Body of a "project load" session cell: the loaded file tree with per-file
 * ✓/⚠/✗/skipped status (failures expandable), defined packages, and the
 * "then call it" hint. */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, AlertTriangle, X, Minus, ChevronRight, Package, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Cell, ProjectFileStatus } from '@/store/workspace'
import { CellPlots } from '@/plot/SvgPlot'

const STATUS_ICON: Record<ProjectFileStatus['status'], React.ReactNode> = {
  pending: <Minus size={11} className="text-muted/50" />,
  ok: <Check size={11} className="text-success" />,
  warn: <AlertTriangle size={11} className="text-warning" />,
  error: <X size={11} className="text-error" />,
  skipped: <Minus size={11} className="text-muted" />,
}

function FileRow({ f }: { f: ProjectFileStatus }) {
  const [open, setOpen] = useState(false)
  const expandable = f.status === 'error' && f.message
  return (
    <div className="border-b border-hairline/40 last:border-0">
      <button
        className={cn('flex w-full items-center gap-2 px-2 py-1 text-left', expandable && 'hover:bg-panel')}
        onClick={() => expandable && setOpen((o) => !o)}
        disabled={!expandable}
      >
        {expandable ? (
          <ChevronRight size={10} className={cn('shrink-0 text-muted transition-transform duration-150', open && 'rotate-90')} />
        ) : (
          <span className="w-[10px] shrink-0" />
        )}
        <span className="shrink-0">{STATUS_ICON[f.status]}</span>
        <span className={cn(
          'min-w-0 flex-1 truncate font-mono text-[11.5px]',
          f.status === 'error' ? 'text-error' : f.status === 'skipped' || f.status === 'pending' ? 'text-muted' : 'text-secondary',
        )} title={f.path}>
          {f.path}
        </span>
        {f.message && f.status !== 'error' && (
          <span className="shrink-0 truncate font-mono text-[10px] text-muted">{f.message}</span>
        )}
      </button>
      {open && f.message && (
        <motion.pre
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.16 }}
          className="mx-2 mb-1 overflow-hidden whitespace-pre-wrap break-words rounded-md bg-inset px-2 py-1.5 font-mono text-[11px] text-error/90"
        >
          {f.message}
        </motion.pre>
      )}
    </div>
  )
}

export function ProjectLoadBody({ cell, running }: { cell: Cell; running: boolean }) {
  const p = cell.project
  if (!p) return null
  const ok = p.files.filter((f) => f.status === 'ok').length
  const failed = p.files.filter((f) => f.status === 'error').length
  return (
    <div className="mt-2">
      {/* summary line */}
      <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
        {running ? (
          <>
            <Loader2 size={11} className="animate-spin text-steel" />
            <span className="text-steel">loading {p.projectName}…</span>
          </>
        ) : (
          <>
            <Package size={11} className="text-steel" />
            <span>
              {ok}/{p.files.length} files loaded
              {failed > 0 && <span className="text-error"> · {failed} failed</span>}
            </span>
          </>
        )}
      </div>

      {/* per-file tree */}
      <div className="mt-1.5 rounded-md border border-hairline bg-inset py-0.5">
        {p.files.map((f) => <FileRow key={f.path} f={f} />)}
      </div>

      {/* packages + hint */}
      {p.packages.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {p.packages.map((pkg) => (
            <span key={pkg.name} className="rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] text-steel">
              {pkg.name} · {pkg.externalCount} external
            </span>
          ))}
        </div>
      )}
      {p.hint && !running && (
        <div className="mt-2 flex items-start gap-2">
          <span className="select-none font-mono text-[12.5px] font-bold text-success">;;=&gt;</span>
          <span className="font-mono text-[11.5px] text-secondary">{p.hint}</span>
        </div>
      )}

      {/* load-time (show fig) calls — gnuplot captured & rendered in-browser */}
      {cell.plots && cell.plots.length > 0 && <CellPlots plots={cell.plots} />}
    </div>
  )
}
