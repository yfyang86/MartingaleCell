/* Workspace search: a pure matcher over text sources (open buffers and
 * project files). No DOM, no store — scripts/search-test.mjs bundles and
 * runs this file as is; the explorer's search panel wires it to the UI. */

export interface SearchOptions {
  caseSensitive?: boolean
  regex?: boolean
  wholeWord?: boolean
  /** skip matches inside strings, `;` comments and `#|…|#` comments */
  symbolsOnly?: boolean
}

export interface SearchMatch {
  /** 1-based */
  line: number
  /** 1-based column of the match start (characters) */
  col: number
  /** the whole line, without its newline */
  lineText: string
  /** character offsets of the match within lineText */
  from: number
  to: number
}

export interface SearchSource {
  path: string
  content: string
  kind: 'buffer' | 'project'
  /** buffer id when kind === 'buffer' */
  bufferId?: string
}

export interface SearchFileResult {
  path: string
  kind: 'buffer' | 'project'
  bufferId?: string
  matches: SearchMatch[]
}

export interface SearchResults {
  files: SearchFileResult[]
  totalMatches: number
  /** results were cut at the cap */
  truncated: boolean
  /** an invalid regex, reported instead of throwing */
  error?: string
}

export const DEFAULT_CAP = 500

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The compiled query, or an error message for an invalid regex. */
export function compileQuery(query: string, opts: SearchOptions): RegExp | string {
  if (!query) return 'empty query'
  let source = opts.regex ? query : escapeRegex(query)
  if (opts.wholeWord) source = `(?<![\\w\\-*+/<>=!?%&$.])(?:${source})(?![\\w\\-*+/<>=!?%&$.])`
  try {
    return new RegExp(source, opts.caseSensitive ? 'g' : 'gi')
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/**
 * Classify every character of a CL source as code (0), string (1),
 * line comment (2) or block comment (3). Small and forgiving: `"` with
 * backslash escapes, `;` to end of line, nested `#| … |#`, and `#\x`
 * character literals (so `#\"` and `#\;` do not open a string/comment).
 */
export function classifyChars(src: string): Uint8Array {
  const out = new Uint8Array(src.length)
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === '"') {
      out[i] = 1; i++
      while (i < n && src[i] !== '"') { out[i] = 1; if (src[i] === '\\' && i + 1 < n) { i++; out[i] = 1 } i++ }
      if (i < n) { out[i] = 1; i++ }
      continue
    }
    if (c === ';') {
      while (i < n && src[i] !== '\n') { out[i] = 2; i++ }
      continue
    }
    if (c === '#' && src[i + 1] === '|') {
      let depth = 1
      out[i] = 3; out[i + 1] = 3; i += 2
      while (i < n && depth > 0) {
        if (src[i] === '|' && src[i + 1] === '#') { out[i] = 3; out[i + 1] = 3; i += 2; depth--; continue }
        if (src[i] === '#' && src[i + 1] === '|') { out[i] = 3; out[i + 1] = 3; i += 2; depth++; continue }
        out[i] = 3; i++
      }
      continue
    }
    if (c === '#' && src[i + 1] === '\\') {
      /* #\x — the next character is literal, then the rest of the token */
      out[i] = 0; out[i + 1] = 0; i += 2
      if (i < n) { out[i] = 0; i++ }
      while (i < n && /[A-Za-z0-9_-]/.test(src[i])) { out[i] = 0; i++ }
      continue
    }
    out[i] = 0; i++
  }
  return out
}

/** All matches of the compiled query in one text. */
export function searchText(content: string, re: RegExp, opts: SearchOptions = {}, cap = Infinity): SearchMatch[] {
  const out: SearchMatch[] = []
  const classes = opts.symbolsOnly ? classifyChars(content) : null
  const lineStarts = [0]
  for (let i = 0; i < content.length; i++) if (content[i] === '\n') lineStarts.push(i + 1)
  const lineOf = (offset: number) => {
    let lo = 0, hi = lineStarts.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1 }
    return lo
  }
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    if (m[0].length === 0) { re.lastIndex++; continue }
    const start = m.index
    if (classes && classes[start] !== 0) continue
    const li = lineOf(start)
    const ls = lineStarts[li]
    const le = content.indexOf('\n', ls)
    const lineText = content.slice(ls, le === -1 ? content.length : le)
    out.push({ line: li + 1, col: start - ls + 1, lineText, from: start - ls, to: Math.min(start - ls + m[0].length, lineText.length) })
    if (out.length >= cap) break
  }
  return out
}

/** Search every source; results grouped by path in source order, capped in total. */
export function searchSources(sources: SearchSource[], query: string, opts: SearchOptions = {}, cap = DEFAULT_CAP): SearchResults {
  const re = compileQuery(query, opts)
  if (typeof re === 'string') return { files: [], totalMatches: 0, truncated: false, error: re }
  const files: SearchFileResult[] = []
  let total = 0
  let truncated = false
  for (const s of sources) {
    if (total >= cap) { truncated = true; break }
    const matches = searchText(s.content, re, opts, cap - total)
    if (!matches.length) continue
    total += matches.length
    files.push({ path: s.path, kind: s.kind, bufferId: s.bufferId, matches })
    if (total >= cap) truncated = true
  }
  return { files, totalMatches: total, truncated }
}

/**
 * Merge open buffers and project files into search sources: a project
 * file that is open as a buffer is searched in its buffer content (which
 * may be unsaved), everything else from disk / the virtual project.
 */
export function mergeSources(
  buffers: { id: string; name: string; content: string; origin?: { type: 'scratch' } | { type: 'project'; path: string } }[],
  projectFiles: { path: string; content: string }[],
): SearchSource[] {
  const out: SearchSource[] = []
  const openPaths = new Set<string>()
  for (const b of buffers) {
    if (b.origin?.type === 'project') {
      openPaths.add(b.origin.path)
      out.push({ path: b.origin.path, content: b.content, kind: 'project', bufferId: b.id })
    } else {
      out.push({ path: b.name, content: b.content, kind: 'buffer', bufferId: b.id })
    }
  }
  for (const f of projectFiles) if (!openPaths.has(f.path)) out.push({ path: f.path, content: f.content, kind: 'project' })
  return out
}
