/* gnuplot-subset parser for the scripts cl-plot generates inside the worker.
 *
 * The worker's ext:shell polyfill intercepts `bash /tmp/<cmdfile>` (see
 * public/wecl-worker.js), packs the generated gnuplot script plus every
 * referenced data file into one base64 payload, and prints it as a
 * `;;PLOT64 <base64>` stdout marker. This module decodes/unpacks that
 * payload and parses the gnuplot subset cl-plot emits into a typed PlotSpec.
 *
 * Pure TypeScript — no DOM, no React — so the node harness can bundle it
 * with esbuild and smoke-test the real code path.
 *
 * Verified cl-plot output quirks (from the bundled sample):
 *   - line 1 is the heredoc wrapper: `cat << EOF | gnuplot -p`
 *   - commands are joined with " " including *space* args, so tokens land
 *     with odd spacing: `set   x label   "text"`, `set arrow from   0 , 0 …`
 *   - `using` columns are 1-based and may have a trailing colon: `using 1:2:`
 *   - data rows are space-separated numbers, one row per line (`1 1`)
 */

export interface PlotPoint {
  x: number
  y: number
}

import type { PlotDefs } from './expr'
export type { PlotDefs }

export type PlotStyle = 'lines' | 'points' | 'linespoints' | 'dots' | 'boxes' | 'impulses'

export interface PlotSeries {
  points: PlotPoint[]
  style: PlotStyle
  title?: string
  pt?: number
  ps?: number
  lt?: number
  sourcePath?: string
  /** Sprint 30: a series the renderer cannot draw — a gnuplot function
   * expression (`plot sin(x)`) or a data file that was not shipped in the
   * payload. Kept so the plot can say so instead of drawing nothing. */
  missing?: 'function' | 'no-data'
  /** what to call the series when it has no title: the expression or the path */
  label?: string
}

export interface PlotArrow {
  x1: number
  y1: number
  x2: number
  y2: number
  /** gnuplot default: arrows have heads; `nohead` clears this */
  head: boolean
}

export interface PlotSpec {
  /** Sprint 34: user-defined functions and variables from the script (`f(x) = …`, `a = …`) */
  defs?: PlotDefs
  title?: string
  xlabel?: string
  ylabel?: string
  /** null endpoint = auto-range that side */
  xrange?: [number | null, number | null]
  yrange?: [number | null, number | null]
  arrows: PlotArrow[]
  series: PlotSeries[]
  /** false after `set nokey` */
  legend: boolean
  termSize?: { w: number; h: number }
  outputName?: string
  /** unknown set/show commands we deliberately skipped */
  ignored: string[]
}

export interface PlotDataFile {
  path: string
  content: string
}

/** A plot attached to a session cell. */
export interface PlotAttachment {
  /** parsed gnuplot spec; absent for raw-SVG plots (see svg) */
  spec?: PlotSpec
  script: string
  outputName?: string
  /** raw SVG, drawn by the engine itself (chemicl's show-smiles) instead
   * of going through the gnuplot-subset renderer */
  svg?: string
}

export const PLOT_MARKER = ';;PLOT64 '

/* ---- base64 (manual, works in browser + worker + node harness) ---- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function decodeBase64(b64: string): string {
  let out = ''
  let acc = 0
  let bits = 0
  for (const ch of b64) {
    const v = B64.indexOf(ch)
    if (v < 0) continue /* skips '=' padding and stray whitespace */
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out += String.fromCharCode((acc >> bits) & 0xff)
    }
  }
  return out
}

/* ---- payload unpacking ---- */

/** Parse a sequence of CL prin1-printed strings (only `"` and `\` are escaped;
 * embedded newlines are literal). */
export function parseClStrings(s: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++
    if (i >= s.length) break
    if (s[i] !== '"') throw new Error(`plot payload: expected string at ${i}`)
    i++
    let cur = ''
    while (i < s.length && s[i] !== '"') {
      if (s[i] === '\\' && i + 1 < s.length) {
        cur += s[i + 1]
        i += 2
      } else {
        cur += s[i]
        i++
      }
    }
    i++ /* closing quote */
    out.push(cur)
  }
  return out
}

/** Unpack the decoded payload: script, then path/content pairs. */
export function unpackPlotPayload(payload: string): { script: string; files: PlotDataFile[] } {
  const strs = parseClStrings(payload)
  if (strs.length === 0) throw new Error('plot payload: empty')
  const files: PlotDataFile[] = []
  for (let i = 1; i + 1 < strs.length; i += 2) {
    files.push({ path: strs[i], content: strs[i + 1] })
  }
  return { script: strs[0], files }
}

/** Decode a `;;PLOT64 <base64>` marker line. Returns null for other lines. */
export function decodePlotMarker(line: string): { script: string; files: PlotDataFile[] } | null {
  if (!line.startsWith(PLOT_MARKER)) return null
  return unpackPlotPayload(decodeBase64(line.slice(PLOT_MARKER.length).trim()))
}

/** Full marker → PlotAttachment (decode + unpack + parse). Null for other lines. */
export function parsePlotMarker(line: string): PlotAttachment | null {
  const unpacked = decodePlotMarker(line)
  if (!unpacked) return null
  /* raw-SVG capture: the payload's first string is the SVG itself
   * (chemicl's show-smiles draws molecules this way) */
  const head = unpacked.script.trimStart().slice(0, 5).toLowerCase()
  if (head === '<?xml' || unpacked.script.trimStart().startsWith('<svg'))
    return { svg: unpacked.script, script: '' }
  const spec = parseGnuplot(unpacked.script, unpacked.files)
  return { spec, script: unpacked.script, outputName: spec.outputName }
}

/* ---- gnuplot-subset parser ---- */

const NUM = '[-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?'

function unescapeGnuplot(s: string): string {
  return s.replace(/\\(["\\])/g, '$1')
}

function parseRangeEndpoints(a: string, b: string): [number | null, number | null] | undefined {
  const lo = a === '' ? null : Number(a)
  const hi = b === '' ? null : Number(b)
  if ((lo !== null && Number.isNaN(lo)) || (hi !== null && Number.isNaN(hi))) return undefined
  if (lo === null && hi === null) return undefined
  return [lo, hi]
}

/** Parse whitespace-separated numeric rows; 1-based column selection. */
export function parseDataFile(content: string, cols: number[]): PlotPoint[] {
  const points: PlotPoint[] = []
  const ci = cols.length > 0 ? cols : [1, 2]
  lines: for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const row = line.split(/\s+/).map(Number)
    for (const v of row) if (Number.isNaN(v)) continue lines
    let x: number
    let y: number
    if (ci.length >= 2) {
      const xv = row[ci[0] - 1]
      const yv = row[ci[1] - 1]
      if (xv === undefined || yv === undefined) continue
      x = xv
      y = yv
    } else {
      const yv = row[ci[0] - 1]
      if (yv === undefined) continue
      x = points.length + 1
      y = yv
    }
    points.push({ x, y })
  }
  return points
}

function parseStyle(word: string | undefined): PlotStyle {
  switch (word) {
    case 'lines':
    case 'l':
      return 'lines'
    case 'points':
    case 'p':
      return 'points'
    case 'linespoints':
    case 'lp':
      return 'linespoints'
    case 'dots':
      return 'dots'
    case 'boxes':
      return 'boxes'
    case 'impulses':
      return 'impulses'
    default:
      return 'points' /* gnuplot default */
  }
}

/** Split a plot command body on the commas that separate its series:
 * commas inside quotes or parentheses (`f(x, 2)`, `title "a, b"`) stay. */
export function splitPlotSegments(rest: string): string[] {
  const out: string[] = []
  let cur = ''
  let depth = 0
  let quoted = false
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i]
    if (quoted) {
      cur += ch
      if (ch === '\\' && i + 1 < rest.length) cur += rest[++i]
      else if (ch === '"') quoted = false
      continue
    }
    if (ch === '"') { quoted = true; cur += ch; continue }
    if (ch === '(') depth++
    else if (ch === ')' && depth > 0) depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter((s) => s.length > 0)
}

/** Parse one `plot`/`replot` command body into series. */
function parsePlotCommand(rest: string, dataByPath: Map<string, string>, spec: PlotSpec): void {
  /* one command may carry several series separated by commas: "file" specs
   * and, since Sprint 30, function expressions (kept as not-drawn series) */
  const segments = splitPlotSegments(rest)
  let previousPath: string | undefined
  for (const seg of segments) {
    const m = seg.match(/^"([^"]*)"\s*([\s\S]*)$/)
    if (!m) {
      /* a function expression: everything before the first plot keyword */
      const kw = seg.search(/\s+(?:using|u|with|w|title|t|notitle|lt|lw|pt|ps|lc|axes)\b/)
      const expr = (kw === -1 ? seg : seg.slice(0, kw)).trim()
      const fopts = kw === -1 ? '' : seg.slice(kw)
      const ftitle = fopts.match(/title\s+"((?:[^"\\]|\\.)*)"/)
      const fwith = fopts.match(/with\s+([a-zA-Z]+)/)?.[1]
      spec.series.push({
        points: [],
        style: fwith ? parseStyle(fwith) : 'lines' /* gnuplot draws functions as lines by default */,
        title: ftitle ? unescapeGnuplot(ftitle[1]) : undefined,
        missing: 'function',
        label: expr,
      })
      continue
    }
    /* `""` means "the same file as the previous series" in gnuplot */
    const path = m[1] === '' && previousPath !== undefined ? previousPath : m[1]
    previousPath = path
    const opts = m[2]
    const using = opts.match(new RegExp(`using\\s+((?:\\d|:)+)`))
    const cols = using
      ? using[1].split(':').filter((c) => c.length > 0).map((c) => parseInt(c, 10))
      : []
    const withM = opts.match(/with\s+([a-zA-Z]+)/)
    const pt = opts.match(/(?:^|\s)pt\s+(\d+)/)
    const ps = opts.match(/(?:^|\s)ps\s+(\d+)/)
    const lt = opts.match(/(?:^|\s)lt\s+(\d+)/)
    const title = opts.match(/title\s+"((?:[^"\\]|\\.)*)"/)
    const content = dataByPath.get(path)
    spec.series.push({
      points: content !== undefined ? parseDataFile(content, cols) : [],
      style: parseStyle(withM?.[1]),
      title: title ? unescapeGnuplot(title[1]) : undefined,
      pt: pt ? parseInt(pt[1], 10) : undefined,
      ps: ps ? parseInt(ps[1], 10) : undefined,
      lt: lt ? parseInt(lt[1], 10) : undefined,
      sourcePath: path,
      ...(content === undefined ? { missing: 'no-data' as const, label: path || '""' } : {}),
    })
  }
}

/** Parse the gnuplot subset cl-plot emits into a PlotSpec. Unknown set/show
 * commands are counted in `ignored`, never fatal. */
export function parseGnuplot(script: string, files: PlotDataFile[]): PlotSpec {
  const spec: PlotSpec = { arrows: [], series: [], legend: true, ignored: [] }
  const dataByPath = new Map(files.map((f) => [f.path, f.content]))

  for (const rawLine of script.split('\n')) {
    const line = rawLine.trim()
    if (!line || line === 'EOF' || /^cat\s*<</.test(line) || line.startsWith('#')) continue
    let m: RegExpMatchArray | null

    /* Sprint 34: user definitions — `f(x, y) = body` and `a = body` (not `set …`, not `==`) */
    if ((m = line.match(/^([a-zA-Z_]\w*)\s*\(\s*([a-zA-Z_]\w*(?:\s*,\s*[a-zA-Z_]\w*)*)\s*\)\s*=(?!=)\s*(.+)$/))) {
      const defs = (spec.defs ??= {})
      ;(defs.functions ??= {})[m[1]] = { params: m[2].split(',').map((p) => p.trim()), body: m[3].trim() }
      continue
    }
    if ((m = line.match(/^([a-zA-Z_]\w*)\s*=(?!=)\s*(.+)$/)) && !/^(?:set|unset|show|plot|splot|replot)\b/.test(line)) {
      const defs = (spec.defs ??= {})
      ;(defs.variables ??= {})[m[1]] = m[2].trim()
      continue
    }

    if (/^set\s+nokey\b/.test(line)) { spec.legend = false; continue }
    if (/^set\s+key\b/.test(line)) { spec.legend = true; continue }
    if ((m = line.match(/^set\s+title\s+"((?:[^"\\]|\\.)*)"/))) {
      spec.title = unescapeGnuplot(m[1]); continue
    }
    /* cl-plot emits `set x label "…"` (separate tokens); accept `xlabel` too */
    if ((m = line.match(/^set\s+x\s*label\s+"((?:[^"\\]|\\.)*)"/))) {
      spec.xlabel = unescapeGnuplot(m[1]); continue
    }
    if ((m = line.match(/^set\s+y\s*label\s+"((?:[^"\\]|\\.)*)"/))) {
      spec.ylabel = unescapeGnuplot(m[1]); continue
    }
    if ((m = line.match(new RegExp(`^set\\s+x\\s*range\\s*\\[\\s*(${NUM}?)\\s*:\\s*(${NUM}?)\\s*\\]`)))) {
      const r = parseRangeEndpoints(m[1], m[2])
      if (r) spec.xrange = r
      continue
    }
    if ((m = line.match(new RegExp(`^set\\s+y\\s*range\\s*\\[\\s*(${NUM}?)\\s*:\\s*(${NUM}?)\\s*\\]`)))) {
      const r = parseRangeEndpoints(m[1], m[2])
      if (r) spec.yrange = r
      continue
    }
    if ((m = line.match(new RegExp(`^set\\s+arrow\\s+from\\s+(${NUM})\\s*,\\s*(${NUM})\\s+to\\s+(${NUM})\\s*,\\s*(${NUM})\\s*(.*)$`)))) {
      spec.arrows.push({
        x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]),
        head: !/\bnohead\b/.test(m[5]),
      })
      continue
    }
    if ((m = line.match(/^set\s+term(?:inal)?\s+\w+\s+size\s+(\d+)\s*,\s*(\d+)/))) {
      spec.termSize = { w: parseInt(m[1], 10), h: parseInt(m[2], 10) }
      continue
    }
    if ((m = line.match(/^set\s+output\s+"([^"]*)"/))) {
      spec.outputName = m[1]
      continue
    }
    if (/^show\s+palette\b/.test(line)) continue /* known, visual-only */
    if ((m = line.match(/^(?:s?plot|replot)\s+([\s\S]*)$/))) {
      parsePlotCommand(m[1], dataByPath, spec)
      continue
    }
    if (/^(?:set|show|unset)\b/.test(line)) {
      spec.ignored.push(line)
      continue
    }
    /* anything else (comments, stray heredoc text) is skipped silently */
  }
  return spec
}
