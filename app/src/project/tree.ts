/* Shared project tree types + helpers (used by FS-Access and virtual projects). */

export interface ProjectNode {
  name: string
  /** project-relative path, '/'-separated ('' segments for root-level entries) */
  path: string
  kind: 'file' | 'dir'
  children?: ProjectNode[]
  size?: number
  /** decodable text file of reasonable size — others are shown greyed out */
  textish: boolean
}

export const LISP_EXT_RE = /\.(lisp|lsp|cl|asd)$/i

const TEXTISH_EXT_RE = /\.(lisp|lsp|cl|asd|el|scm|rkt|ss|txt|md|markdown|org|json|csv|tsv|dat|in|cfg|conf|ini|yaml|yml|xml|html|css|js|ts|py|sh|bash|c|h|cpp|rs|java|gitignore|license|plt)$/i

export function isTextish(name: string): boolean {
  return TEXTISH_EXT_RE.test(name) || !/\.[a-z0-9]{1,8}$/i.test(name)
}

export function isLispFile(name: string): boolean {
  return LISP_EXT_RE.test(name)
}

/** Directories first, then files, alphabetical within each group. */
export function sortTree(nodes: ProjectNode[]): ProjectNode[] {
  return nodes.sort((a, b) =>
    a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : a.name.localeCompare(b.name),
  )
}

/** Build a nested tree from a flat path list (virtual projects / zip imports). */
export function buildTree(entries: { path: string; size?: number; textish?: boolean }[]): ProjectNode[] {
  const root: ProjectNode[] = []
  const dirMap = new Map<string, ProjectNode>()
  const ensureDir = (path: string): ProjectNode => {
    const existing = dirMap.get(path)
    if (existing) return existing
    const name = path.split('/').pop()!
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const node: ProjectNode = { name, path, kind: 'dir', textish: false, children: [] }
    dirMap.set(path, node)
    if (parentPath) ensureDir(parentPath).children!.push(node)
    else root.push(node)
    return node
  }
  for (const e of entries) {
    const clean = e.path.replace(/^\/+/, '')
    if (!clean) continue
    const parentPath = clean.includes('/') ? clean.slice(0, clean.lastIndexOf('/')) : ''
    const siblings = parentPath ? ensureDir(parentPath).children! : root
    siblings.push({
      name: clean.split('/').pop()!,
      path: clean,
      kind: 'file',
      size: e.size,
      textish: e.textish ?? isTextish(clean),
    })
  }
  /* sort every level */
  const sortRec = (nodes: ProjectNode[]) => {
    sortTree(nodes)
    for (const n of nodes) if (n.children) sortRec(n.children)
  }
  sortRec(root)
  return root
}

/** Flatten a tree into file paths. */
export function flattenPaths(nodes: ProjectNode[]): string[] {
  const out: string[] = []
  const walk = (ns: ProjectNode[]) => {
    for (const n of ns) {
      if (n.kind === 'file') out.push(n.path)
      else walk(n.children ?? [])
    }
  }
  walk(nodes)
  return out
}

export function parentOf(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
}

export function baseName(path: string): string {
  return path.split('/').pop() ?? path
}
