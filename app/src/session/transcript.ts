/* Session export: pure builders from the session's cells to a Markdown
 * notebook or a `.lisp` transcript. No DOM and no store access, so the
 * Node test (scripts/transcript-test.mjs) can bundle and run this file
 * as is. The IDE wires the results to a download (components/ide/actions). */

import type { Cell, ProjectFileStatus } from '@/store/workspace'
import { buildSvg } from '@/plot/build-svg'

export interface TranscriptMeta {
  /** engine label, e.g. "ECL 24.5 (WECL)" — omitted when unknown */
  engine?: string
  /** export time; defaults to now */
  exportedAt?: Date
}

/* ---- helpers ---- */

const pad = (n: number) => String(n).padStart(2, '0')

export function formatStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** conscell-session-2026-09-09-1530.md */
export function transcriptFileName(ext: 'md' | 'lisp', when = new Date()): string {
  return `conscell-session-${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}-${pad(when.getHours())}${pad(when.getMinutes())}.${ext}`
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** UTF-8 → base64 without btoa (works in browser, worker and Node alike). */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    out += b === undefined ? '=' : B64[(n >> 6) & 63]
    out += c === undefined ? '=' : B64[n & 63]
  }
  return out
}

/** Longest backtick run in `text` + 1, so a fence can never be closed early. */
function fence(lang: string, text: string): string {
  const longest = Math.max(2, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length))
  const ticks = '`'.repeat(longest + 1)
  return `${ticks}${lang}\n${text.replace(/\n$/, '')}\n${ticks}`
}

const escapeCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

function durationLabel(cell: Cell): string {
  if (cell.status === 'queued' || cell.status === 'running' || cell.status === 'paused' || cell.status === 'input') return ''
  return cell.durationMs >= 1000 ? `${(cell.durationMs / 1000).toFixed(2)} s` : `${Math.round(cell.durationMs)} ms`
}

function stateLine(cell: Cell): string | null {
  switch (cell.status) {
    case 'aborted': return 'Evaluation aborted.'
    case 'queued': case 'running': return 'Still running at export time.'
    case 'paused': return 'Paused in the debugger at export time.'
    case 'input': return 'Waiting for standard input at export time.'
    default: return null
  }
}

/** Data URI for a plot, usable as a Markdown image. */
export function plotDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${encodeBase64(svg)}`
}

/* ---- Markdown ---- */

function projectTable(files: ProjectFileStatus[]): string {
  const rows = files.map((f) => `| \`${escapeCell(f.path)}\` | ${f.status} | ${escapeCell(f.message ?? '')} |`)
  return ['| File | Status | Message |', '|---|---|---|', ...rows].join('\n')
}

function markdownCell(cell: Cell): string {
  const out: string[] = []
  const dur = durationLabel(cell)
  const head = cell.kind === 'project'
    ? `## Cell ${cell.n} · project load${cell.project ? ` \`${cell.project.projectName}\`` : ''}`
    : `## Cell ${cell.n} · \`${cell.pkg}\``
  out.push(head + (dur ? ` · ${dur}` : ''))

  if (cell.kind === 'project' && cell.project) {
    const p = cell.project
    out.push(projectTable(p.files))
    if (p.packages.length) out.push('Packages: ' + p.packages.map((k) => `\`${k.name}\` (${k.externalCount} external)`).join(', '))
    if (p.hint) out.push(`> Hint: ${p.hint}`)
  } else {
    out.push(fence('lisp', cell.input))
  }

  if (cell.stdout) out.push('**Output**\n' + fence('text', cell.stdout))
  if (cell.values.length && !cell.error) out.push(fence('lisp', cell.values.map((v) => `;;=> ${v}`).join('\n')))
  for (const w of cell.warnings) out.push(`> ⚠️ ${w.replace(/\n/g, '\n> ')}`)
  if (cell.error) {
    const type = cell.errorType ? ` \`${cell.errorType}\`` : ''
    out.push(`**Error**${type}\n` + fence('text', cell.error))
    if (cell.details?.length) out.push(cell.details.map((d) => `- ${d.key}: \`${d.value}\``).join('\n'))
    if (cell.frames?.length) out.push('Frames (innermost first): ' + cell.frames.map((f) => `\`${f}\``).join(' ← '))
  }
  if (cell.resumedVia) out.push(`_Resumed via \`${cell.resumedVia}\`._`)
  const st = stateLine(cell)
  if (st) out.push(`_${st}_`)
  if (cell.plots?.length) {
    cell.plots.forEach((p, i) => {
      const title = p.spec.title || p.outputName || `plot ${i + 1}`
      out.push(`![${title.replace(/[[\]]/g, '')}](${plotDataUri(buildSvg(p.spec))})`)
    })
  }
  return out.join('\n\n')
}

export function buildMarkdownTranscript(cells: Cell[], meta: TranscriptMeta = {}): string {
  const when = meta.exportedAt ?? new Date()
  const parts = [
    '# ConsCell session',
    `Exported ${formatStamp(when)}${meta.engine ? ` · ${meta.engine}` : ''} · ${cells.length} cell${cells.length === 1 ? '' : 's'}`,
    ...cells.map(markdownCell),
  ]
  return parts.join('\n\n') + '\n'
}

/* ---- .lisp transcript ---- */

const comment = (prefix: string, text: string) => text.replace(/\n$/, '').split('\n').map((l) => `${prefix}${l}`).join('\n')

function lispCell(cell: Cell, prevPkg: string | null): { text: string; pkg: string | null } {
  const out: string[] = []
  const dur = durationLabel(cell)
  if (cell.kind === 'project') {
    const p = cell.project
    out.push(`;;; ---- cell ${cell.n} · project load${p ? ` ${p.projectName}` : ''}${dur ? ` · ${dur}` : ''} ----`)
    if (p) for (const f of p.files) out.push(`;;   ${f.status.padEnd(7)} ${f.path}${f.message ? `  ; ${f.message}` : ''}`)
    if (cell.error) out.push(comment(';; ERROR: ', cell.error))
    return { text: out.join('\n'), pkg: prevPkg }
  }
  out.push(`;;; ---- cell ${cell.n} · ${cell.pkg}${dur ? ` · ${dur}` : ''} ----`)
  if (cell.pkg !== prevPkg && !(prevPkg === null && cell.pkg === 'CL-USER')) out.push(`(in-package :${cell.pkg.toLowerCase()})`)
  out.push(cell.input.replace(/\n$/, ''))
  if (cell.stdout) out.push(comment(';; OUT ', cell.stdout))
  for (const w of cell.warnings) out.push(comment(';; WARNING: ', w))
  if (cell.error) out.push(comment(`;; ERROR${cell.errorType ? ` (${cell.errorType})` : ''}: `, cell.error))
  else for (const v of cell.values) out.push(`;;=> ${v}`)
  if (cell.resumedVia) out.push(`;; resumed via ${cell.resumedVia}`)
  const st = stateLine(cell)
  if (st) out.push(`;; ${st}`)
  if (cell.plots?.length) out.push(`;; ${cell.plots.length} plot${cell.plots.length === 1 ? '' : 's'} captured (not included in the .lisp transcript; export as Markdown for the images)`)
  return { text: out.join('\n'), pkg: cell.pkg }
}

export function buildLispTranscript(cells: Cell[], meta: TranscriptMeta = {}): string {
  const when = meta.exportedAt ?? new Date()
  const head = [
    `;;;; ConsCell session — exported ${formatStamp(when)}${meta.engine ? ` · ${meta.engine}` : ''}`,
    `;;;; ${cells.length} cell${cells.length === 1 ? '' : 's'}. Results are comments; the forms evaluate as they are.`,
  ].join('\n')
  const body: string[] = []
  let pkg: string | null = null
  for (const c of cells) {
    const r = lispCell(c, pkg)
    body.push(r.text)
    pkg = r.pkg
  }
  return [head, ...body].join('\n\n') + '\n'
}

/* ---- Markdown import (the inverse of buildMarkdownTranscript) ---- */

/** A cell reconstructed from a Markdown transcript; enough to append it to a session. */
export interface ImportedCell {
  n: number
  pkg: string
  input: string
  status: 'done' | 'error' | 'aborted'
  stdout: string
  values: string[]
  warnings: string[]
  error?: string
  errorType?: string
  resumedVia?: string
  durationMs: number
  kind?: 'project'
  project?: { projectName: string; files: { path: string; status: 'ok' | 'warn' | 'error' | 'skipped' | 'pending'; message?: string }[] }
}

interface Fence { lang: string; text: string }

/** Split a section into a list of fences and non-fence lines (in order). */
function tokenize(section: string): (Fence | string)[] {
  const out: (Fence | string)[] = []
  const lines = section.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(`{3,})([\w-]*)\s*$/)
    if (m) {
      const ticks = m[1]
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && lines[j] !== ticks) { body.push(lines[j]); j++ }
      out.push({ lang: m[2], text: body.join('\n') })
      i = j
    } else {
      out.push(lines[i])
    }
  }
  return out
}

function parseDuration(s: string | undefined): number {
  if (!s) return 0
  const m = s.match(/([\d.]+)\s*(ms|s)/)
  if (!m) return 0
  return m[2] === 's' ? Math.round(parseFloat(m[1]) * 1000) : parseInt(m[1], 10)
}

const unescapeCell = (s: string) => s.replace(/\\\|/g, '|').trim()

/**
 * Parse a transcript produced by buildMarkdownTranscript (or edited by
 * hand: prose outside the recognised blocks is ignored). Sections start
 * at `## Cell n · …`; anything before the first one is skipped.
 */
export function parseMarkdownTranscript(md: string): ImportedCell[] {
  const cells: ImportedCell[] = []
  const parts = md.replace(/\r\n/g, '\n').split(/^(?=## Cell \d+ · )/m).slice(1)
  for (const part of parts) {
    const nl = part.indexOf('\n')
    const head = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body = nl === -1 ? '' : part.slice(nl + 1)
    const hm = head.match(/^## Cell (\d+) · (.*)$/)
    if (!hm) continue
    const n = parseInt(hm[1], 10)
    const tail = hm[2].split(' · ')
    const cell: ImportedCell = { n, pkg: 'CL-USER', input: '', status: 'done', stdout: '', values: [], warnings: [], durationMs: 0 }
    if (tail[0].startsWith('project load')) {
      cell.kind = 'project'
      const pm = tail[0].match(/^project load(?: `(.*)`)?$/)
      cell.project = { projectName: pm?.[1] ?? 'project', files: [] }
      cell.durationMs = parseDuration(tail[1])
    } else {
      const pm = tail[0].match(/^`(.*)`$/)
      cell.pkg = pm ? pm[1] : tail[0]
      cell.durationMs = parseDuration(tail[1])
    }
    let expectOutput = false, expectError = false, haveInput = cell.kind === 'project'
    for (const tok of tokenize(body)) {
      if (typeof tok !== 'string') {
        if (expectOutput) { cell.stdout = tok.text ? tok.text + '\n' : ''; expectOutput = false; continue }
        if (expectError) { cell.error = tok.text; expectError = false; continue }
        const ls = tok.text.split('\n')
        if (tok.text && ls.every((l) => l.startsWith(';;=> '))) { cell.values.push(...ls.map((l) => l.slice(5))); continue }
        if (!haveInput && tok.lang === 'lisp') { cell.input = tok.text; haveInput = true; continue }
        continue
      }
      const line = tok
      if (/^\*\*Output\*\*/.test(line)) { expectOutput = true; continue }
      const em = line.match(/^\*\*Error\*\*(?: `(.*)`)?/)
      if (em) { expectError = true; cell.status = 'error'; if (em[1]) cell.errorType = em[1]; continue }
      if (line.startsWith('> ⚠️ ')) { cell.warnings.push(line.slice(5)); continue }
      if (line.startsWith('> ') && cell.warnings.length && !line.startsWith('> Hint:')) { cell.warnings[cell.warnings.length - 1] += '\n' + line.slice(2); continue }
      const rm = line.match(/^_Resumed via `(.*)`\._$/)
      if (rm) { cell.resumedVia = rm[1]; continue }
      if (line === '_Evaluation aborted._') { cell.status = 'aborted'; continue }
      const tm = line.match(/^\| `(.*)` \| (\w+) \| (.*) \|$/)
      if (tm && cell.project) {
        cell.project.files.push({ path: unescapeCell(tm[1]), status: tm[2] as 'ok' | 'warn' | 'error' | 'skipped' | 'pending', message: unescapeCell(tm[3]) || undefined })
        continue
      }
    }
    cells.push(cell)
  }
  return cells
}
