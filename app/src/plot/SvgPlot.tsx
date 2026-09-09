/* SVG plot rendering for session cells.
 *
 * SvgPlot renders a parsed PlotSpec via the pure buildSvg() string builder
 * (single source of truth for on-screen render and "Download SVG").
 * PlotCard wraps it with the cell chrome: title bar, Download SVG/PNG
 * toolbar, and a collapsible "gnuplot script" details for debugging. */

import { memo } from 'react'
import { Download, Image as ImageIcon, ChartLine } from 'lucide-react'
import { toast } from 'sonner'
import { buildSvg } from './build-svg'
import type { PlotAttachment, PlotSpec } from './gnuplot'
import { downloadPlotPng, downloadPlotSvg } from './download'

export function SvgPlot({ spec }: { spec: PlotSpec }) {
  return (
    <div
      className="cc-svg-plot overflow-x-auto rounded-md border border-hairline bg-inset [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      // eslint-disable-next-line react/no-danger -- buildSvg escapes all interpolated text
      dangerouslySetInnerHTML={{ __html: buildSvg(spec) }}
    />
  )
}

function PlotCardComponent({ plot, index }: { plot: PlotAttachment; index: number }) {
  const fallback = `plot-${index + 1}`
  const saved = plot.outputName
  return (
    <div className="cc-plot-card">
      <div className="mb-1 flex items-center gap-2 font-mono text-[10.5px] text-muted">
        <ChartLine size={11} className="text-steel" />
        <span className="text-secondary">gnuplot → svg{saved ? ` · ${saved}` : ''}</span>
        <span className="ml-auto flex gap-1">
          <button
            className="flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[10px] text-steel transition-colors hover:border-strong hover:bg-raised"
            title="Download the rendered SVG"
            onClick={() => downloadPlotSvg(plot, fallback)}
          >
            <Download size={10} /> svg
          </button>
          <button
            className="flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[10px] text-steel transition-colors hover:border-strong hover:bg-raised"
            title="Rasterize at 2× and download as PNG"
            onClick={() => {
              downloadPlotPng(plot, fallback).catch((e) => toast(`PNG export failed: ${(e as Error)?.message ?? e}`))
            }}
          >
            <ImageIcon size={10} /> png
          </button>
        </span>
      </div>
      <SvgPlot spec={plot.spec} />
      <details className="group/details mt-1">
        <summary className="cursor-pointer select-none font-mono text-[10px] text-muted transition-colors hover:text-secondary">
          gnuplot script ({plot.script.split('\n').length} lines)
        </summary>
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-hairline bg-inset px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-secondary scrollbar-thin">
          {plot.script}
        </pre>
      </details>
    </div>
  )
}

export const PlotCard = memo(PlotCardComponent)

/** Render all plots attached to a cell. */
export function CellPlots({ plots }: { plots: PlotAttachment[] }) {
  if (plots.length === 0) return null
  return (
    <div className="mt-2 space-y-3">
      {plots.map((p, i) => (
        <PlotCard key={i} plot={p} index={i} />
      ))}
    </div>
  )
}
