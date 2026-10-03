/* Pure SVG string builder for PlotSpec — dark-themed to the MartingaleCell design
 * tokens. No DOM/React so the node harness can smoke-test it, and "Download
 * SVG" is just this function's output wrapped in a Blob. */

import type { PlotSpec, PlotSeries, PlotPoint } from './gnuplot'
import { compileExpression, sampleFunction } from './expr'

/* design tokens (src/index.css) */
const C = {
  bg: '#08090F' /* --bg-inset */,
  grid: '#1C2030' /* --border-hairline */,
  border: '#2A2F45' /* --border-strong */,
  tick: '#565D72' /* --text-muted */,
  label: '#9AA1B5' /* --text-secondary */,
  title: '#E7EAF3' /* --text-primary */,
  arrow: '#565D72',
} as const

export const SERIES_COLORS = ['#6EA8DC', '#A78BFA', '#4ADE80', '#FBBF24', '#F472B6', '#38BDF8']

const FONT = "'JetBrains Mono', ui-monospace, monospace"

export function svgSize(spec: PlotSpec): { w: number; h: number } {
  return { w: spec.termSize?.w ?? 640, h: spec.termSize?.h ?? 400 }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function n(v: number): string {
  return String(Math.round(v * 100) / 100)
}

/* ---- ranges & ticks ---- */

function autoRange(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1]
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  let span = max - min
  if (span === 0) span = Math.abs(min) * 0.2 || 1
  const pad = span * 0.05
  return [min - pad, max + pad]
}

function resolveRange(auto: [number, number], explicit?: [number | null, number | null]): [number, number] {
  const lo = explicit?.[0] ?? auto[0]
  const hi = explicit?.[1] ?? auto[1]
  return lo < hi ? [lo, hi] : [Math.min(lo, hi), Math.max(lo, hi) + 1]
}

/** "Nice" tick step (1/2/5 × 10^k) targeting ~`target` ticks over `span`. */
function niceStep(span: number, target: number): number {
  const raw = span / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  return (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag
}

function ticks(min: number, max: number, target = 6): { values: number[]; step: number } {
  const step = niceStep(max - min, target)
  const values: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    values.push(Math.abs(v) < step * 1e-9 ? 0 : v)
  }
  return { values, step }
}

function fmtTick(v: number, step: number): string {
  const decimals = Math.min(6, Math.max(0, -Math.floor(Math.log10(step))))
  let s = v.toFixed(decimals)
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return s
}

/* ---- series geometry ---- */

function seriesElements(
  s: PlotSeries,
  color: string,
  sx: (x: number) => number,
  sy: (y: number) => number,
  baselineY: number,
): string {
  const pts = s.points
  if (pts.length === 0) return ''
  const out: string[] = []
  const width = s.lt ? 0.75 + s.lt * 0.75 : 1.75
  const r = 1.5 + 1.2 * (s.ps ?? 2)
  const dotR = 1.4
  const showLine = s.style === 'lines' || s.style === 'linespoints' || s.style === 'boxes'
  const showPoints = s.style === 'points' || s.style === 'linespoints'
  if (showLine) {
    const attr = pts.map((p) => `${n(sx(p.x))},${n(sy(p.y))}`).join(' ')
    out.push(`<polyline points="${attr}" fill="none" stroke="${color}" stroke-width="${n(width)}" stroke-linejoin="round" stroke-linecap="round"/>`)
  }
  if (s.style === 'impulses') {
    for (const p of pts) {
      out.push(`<line x1="${n(sx(p.x))}" y1="${n(baselineY)}" x2="${n(sx(p.x))}" y2="${n(sy(p.y))}" stroke="${color}" stroke-width="${n(width)}"/>`)
    }
  }
  if (showPoints || s.style === 'dots' || s.style === 'impulses') {
    const rr = s.style === 'dots' ? dotR : r
    for (const p of pts) {
      out.push(`<circle cx="${n(sx(p.x))}" cy="${n(sy(p.y))}" r="${n(rr)}" fill="${color}"/>`)
    }
  }
  return out.join('')
}

/* Sprint 31: a function series (`plot sin(x)`) drawn from its samples; one
 * polyline per segment so asymptotes and domain gaps are not bridged */
function functionElements(segments: PlotPoint[][], s: PlotSeries, color: string, sx: (x: number) => number, sy: (y: number) => number): string {
  const width = s.lt ? 0.75 + s.lt * 0.75 : 1.75
  const asPoints = s.style === 'points' || s.style === 'dots'
  const out: string[] = []
  for (const seg of segments) {
    if (asPoints) {
      const rr = s.style === 'dots' ? 1.4 : 1.5 + 1.2 * (s.ps ?? 2)
      for (const p of seg) out.push(`<circle cx="${n(sx(p.x))}" cy="${n(sy(p.y))}" r="${n(rr)}" fill="${color}"/>`)
    } else if (seg.length === 1) {
      out.push(`<circle cx="${n(sx(seg[0].x))}" cy="${n(sy(seg[0].y))}" r="1.4" fill="${color}"/>`)
    } else {
      const attr = seg.map((p) => `${n(sx(p.x))},${n(sy(p.y))}`).join(' ')
      out.push(`<polyline points="${attr}" fill="none" stroke="${color}" stroke-width="${n(width)}" stroke-linejoin="round" stroke-linecap="round"/>`)
    }
  }
  return out.join('')
}

/** The x-range the plot will show: the data's, an explicit `set xrange`, or
 * gnuplot's default [-10:10] when there is nothing else (a function-only plot). */
export function plotXRange(spec: PlotSpec): [number, number] {
  const dataX = spec.series.flatMap((s) => s.points.map((p) => p.x)).concat(spec.arrows.flatMap((a) => [a.x1, a.x2]))
  return resolveRange(dataX.length > 0 ? autoRange(dataX) : [-10, 10], spec.xrange)
}

/** Build a standalone dark-themed SVG for a parsed gnuplot spec. */
export function buildSvg(spec: PlotSpec): string {
  const { w: W, h: H } = svgSize(spec)
  const ml = 56
  const mr = 18
  const mt = spec.title ? 34 : 18
  const mb = 46
  const pw = Math.max(10, W - ml - mr)
  const ph = Math.max(10, H - mt - mb)

  const [xmin, xmax] = plotXRange(spec)
  /* function series that compile are sampled over that x-range and take part in the y-range */
  const drawnFns = new Map<PlotSeries, PlotPoint[][]>()
  for (const s of spec.series) {
    if (s.missing !== 'function' || !s.label) continue
    const fn = compileExpression(s.label, spec.defs)
    if (!fn) continue
    const segments = sampleFunction(fn, xmin, xmax)
    if (segments.length > 0) drawnFns.set(s, segments)
  }
  const notDrawn = (s: PlotSeries) => s.missing !== undefined && !drawnFns.has(s)
  const allY = spec.series.flatMap((s) => s.points.map((p) => p.y))
    .concat(spec.arrows.flatMap((a) => [a.y1, a.y2]))
    .concat([...drawnFns.values()].flat(2).map((p) => p.y))
  const [ymin, ymax] = resolveRange(autoRange(allY), spec.yrange)
  const sx = (x: number) => ml + ((x - xmin) / (xmax - xmin)) * pw
  const sy = (y: number) => mt + ph - ((y - ymin) / (ymax - ymin)) * ph
  const baselineY = sy(Math.min(Math.max(0, ymin), ymax))

  const el: string[] = []
  el.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(spec.title ?? 'plot')}">`)
  el.push(`<defs><marker id="cc-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="${C.arrow}"/></marker></defs>`)
  el.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${C.bg}"/>`)

  /* grid + ticks */
  const xt = ticks(xmin, xmax)
  const yt = ticks(ymin, ymax)
  for (const v of xt.values) {
    const x = n(sx(v))
    el.push(`<line x1="${x}" y1="${mt}" x2="${x}" y2="${mt + ph}" stroke="${C.grid}" stroke-width="1"/>`)
    el.push(`<text x="${x}" y="${mt + ph + 16}" fill="${C.tick}" font-family="${FONT}" font-size="10" text-anchor="middle">${esc(fmtTick(v, xt.step))}</text>`)
  }
  for (const v of yt.values) {
    const y = n(sy(v))
    el.push(`<line x1="${ml}" y1="${y}" x2="${ml + pw}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`)
    el.push(`<text x="${ml - 8}" y="${n(sy(v) + 3)}" fill="${C.tick}" font-family="${FONT}" font-size="10" text-anchor="end">${esc(fmtTick(v, yt.step))}</text>`)
  }
  el.push(`<rect x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="none" stroke="${C.border}" stroke-width="1"/>`)

  /* arrows (under series) */
  for (const a of spec.arrows) {
    const marker = a.head ? ' marker-end="url(#cc-ah)"' : ''
    el.push(`<line x1="${n(sx(a.x1))}" y1="${n(sy(a.y1))}" x2="${n(sx(a.x2))}" y2="${n(sy(a.y2))}" stroke="${C.arrow}" stroke-width="1.25"${marker}/>`)
  }

  /* series */
  spec.series.forEach((s, i) => {
    const color = SERIES_COLORS[i % SERIES_COLORS.length]
    const segments = drawnFns.get(s)
    el.push(segments ? functionElements(segments, s, color, sx, sy) : seriesElements(s, color, sx, sy, baselineY))
  })

  /* legend (unless set nokey) */
  const legendItems = spec.legend ? spec.series.filter((s) => s.title || s.missing) : []
  if (spec.legend && legendItems.length > 0) {
    const lw = Math.max(...legendItems.map((s) => ((s.title ?? s.label ?? '') + (notDrawn(s) ? ' (not drawn)' : '')).length)) * 6.5 + 30
    const lh = legendItems.length * 16 + 8
    const lx = ml + pw - lw - 6
    const ly = mt + 6
    el.push(`<rect x="${n(lx)}" y="${ly}" width="${n(lw)}" height="${lh}" fill="${C.bg}" fill-opacity="0.85" stroke="${C.grid}"/>`)
    legendItems.forEach((s, i) => {
      const color = SERIES_COLORS[spec.series.indexOf(s) % SERIES_COLORS.length]
      const y = ly + 14 + i * 16
      el.push(`<line x1="${n(lx + 6)}" y1="${y - 3}" x2="${n(lx + 22)}" y2="${y - 3}" stroke="${color}" stroke-width="2"/>`)
      el.push(`<text x="${n(lx + 26)}" y="${y}" fill="${C.label}" font-family="${FONT}" font-size="10">${esc((s.title ?? s.label ?? '') + (notDrawn(s) ? ' (not drawn)' : ''))}</text>`)
    })
  }

  /* Sprint 30: series the renderer cannot draw are named, not dropped */
  const missing = spec.series.filter(notDrawn)
  if (missing.length > 0) {
    const what = missing
      .map((s) => `${s.title ?? s.label ?? '?'} (${s.missing === 'function' ? 'function' : 'no data'})`)
      .join(', ')
    el.push(`<text x="${ml + 6}" y="${mt + ph - 6}" fill="${C.tick}" font-family="${FONT}" font-size="10" data-plot-missing="${missing.length}">${esc('not drawn: ' + what)}</text>`)
  }

  /* labels + title */
  if (spec.xlabel) {
    el.push(`<text x="${n(ml + pw / 2)}" y="${H - 6}" fill="${C.label}" font-family="${FONT}" font-size="11" text-anchor="middle">${esc(spec.xlabel)}</text>`)
  }
  if (spec.ylabel) {
    el.push(`<text transform="rotate(-90 14 ${n(mt + ph / 2)})" x="14" y="${n(mt + ph / 2)}" fill="${C.label}" font-family="${FONT}" font-size="11" text-anchor="middle">${esc(spec.ylabel)}</text>`)
  }
  if (spec.title) {
    el.push(`<text x="${n(ml + pw / 2)}" y="20" fill="${C.title}" font-family="${FONT}" font-size="12" font-weight="600" text-anchor="middle">${esc(spec.title)}</text>`)
  }

  el.push('</svg>')
  return el.join('')
}
