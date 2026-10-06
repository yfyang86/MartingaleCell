/* Browser-side plot downloads: SVG serialization and PNG rasterization
 * (SVG → Image → canvas at 2× → toBlob). This is what answers cl-plot's
 * (save fig "name.png" w h) without a gnuplot binary. */

import { buildSvg, svgSize } from './build-svg'

/** width/height of a raw engine-drawn SVG (our generator always writes both attrs) */
function rawSvgSize(svg: string): { w: number; h: number } {
  const w = Number(/width="([\d.]+)/.exec(svg)?.[1]) || 420
  const h = Number(/height="([\d.]+)/.exec(svg)?.[1]) || 320
  return { w, h }
}
import type { PlotAttachment } from './gnuplot'

function baseName(path: string): string {
  const p = path.replace(/\\/g, '/')
  return p.slice(p.lastIndexOf('/') + 1) || 'plot.png'
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Serialize the rendered SVG and download it. */
export function downloadPlotSvg(plot: PlotAttachment, fallbackName: string): void {
  const svg = plot.svg ?? buildSvg(plot.spec!)
  const name = plot.outputName
    ? baseName(plot.outputName).replace(/\.png$/i, '.svg')
    : fallbackName.replace(/\.png$/i, '') + '.svg'
  triggerDownload(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), name)
}

/** Rasterize the SVG into a canvas at 2× and download as PNG. */
export async function downloadPlotPng(plot: PlotAttachment, fallbackName: string): Promise<void> {
  const svg = plot.svg ?? buildSvg(plot.spec!)
  const { w, h } = plot.svg ? rawSvgSize(plot.svg) : svgSize(plot.spec!)
  const name = plot.outputName
    ? (/\.png$/i.test(plot.outputName) ? baseName(plot.outputName) : baseName(plot.outputName) + '.png')
    : fallbackName.replace(/\.svg$/i, '').replace(/\.png$/i, '') + '.png'
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG rasterization failed'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = w * 2
    canvas.height = h * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d canvas context')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (!blob) throw new Error('canvas.toBlob returned null')
    triggerDownload(blob, name)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** cl-plot `save` sets `set output "name.png"` — honor it by auto-downloading
 * the PNG right after the eval/load completes (still within the user's click
 * gesture window; if the browser blocks it we surface a note). */
export function autoDownloadSavedPlots(plots: PlotAttachment[], onNote: (msg: string) => void): void {
  for (const plot of plots) {
    if (!plot.outputName) continue
    downloadPlotPng(plot, 'plot.png').catch((e) => {
      onNote(`PNG auto-download of ${plot.outputName} was blocked/failed: ${(e as Error)?.message ?? e}`)
    })
  }
}
