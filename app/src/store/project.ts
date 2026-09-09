/* Project mode: a local folder (File System Access API) or a virtual,
 * in-memory project (ZIP import / folder upload / bundled sample).
 *
 * The FS-Access directory handle is structured-cloneable and persisted in
 * IndexedDB; virtual projects persist their full file map. File contents of
 * FS-Access projects are always read fresh from disk. */

import { create } from 'zustand'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import { toast } from 'sonner'
import { useWorkspace } from './workspace'
import {
  buildTree, flattenPaths, parentOf, baseName, isLispFile,
  type ProjectNode,
} from '@/project/tree'
import * as fsa from '@/project/fsaccess'
import { zipToVirtual, downloadZip } from '@/project/zip'

export type ProjectKind = 'fsaccess' | 'virtual'

export interface LoadedPackage {
  name: string
  externalCount: number
  symbols: string[]
}

/** Where a project symbol was defined during the last Load Project (go-to-definition). */
export interface ProjectDefinition {
  /** upper-case symbol name, e.g. "FIGURE" or "(SETF FOO)" */
  name: string
  /** defun / defmacro / defclass / … */
  kind: string
  /** project-relative path */
  path: string
  line: number
  col: number
}

const IDB_HANDLE = 'conscell-dir-handle'
const IDB_VIRTUAL = 'conscell-virtual-project-v1'

/** The live FS-Access root handle (not serializable into state — module scope). */
let rootHandle: FileSystemDirectoryHandle | null = null
export function getRootHandle() { return rootHandle }

interface VirtualPersisted {
  name: string
  files: Record<string, string>
  attribution: string | null
}

interface ProjectState {
  kind: ProjectKind | null
  name: string | null
  tree: ProjectNode[]
  /** virtual projects: full content map (FS-Access projects read from disk) */
  files: Record<string, string>
  attribution: string | null
  /** a directory handle from a previous session is available to reopen */
  canReopen: boolean
  busy: boolean
  loadedPackages: LoadedPackage[]
  /** definitions reported by the last Load Project (cleared when the project changes) */
  definitions: ProjectDefinition[]

  hydrateProject: () => Promise<void>
  openFolder: () => Promise<void>
  reopenLast: () => Promise<void>
  importZip: (file: Blob, name?: string, attribution?: string | null) => Promise<void>
  importFolderUpload: (fileList: FileList) => Promise<void>
  openSample: () => Promise<void>
  exportZip: () => Promise<void>
  closeProject: () => void
  refreshTree: () => Promise<void>

  readProjectFile: (path: string) => Promise<string>
  readProjectFiles: () => Promise<{ path: string; content: string }[]>
  openFile: (path: string) => Promise<void>
  saveBuffer: (bufferId: string) => Promise<boolean>
  saveAllDirty: () => Promise<void>

  createFile: (dir: string, name: string) => Promise<void>
  createFolder: (dir: string, name: string) => Promise<void>
  renamePath: (path: string, newName: string) => Promise<void>
  duplicatePath: (path: string) => Promise<void>
  deletePath: (path: string) => Promise<void>

  setLoadedPackages: (pkgs: LoadedPackage[]) => void
  setDefinitions: (defs: ProjectDefinition[]) => void
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

export const useProject = create<ProjectState>((set, get) => {
  const log = (msg: string) => useWorkspace.getState().addLog('INFO', 'PROJECT', msg)
  const logErr = (msg: string) => useWorkspace.getState().addLog('ERROR', 'PROJECT', msg)

  const persistVirtual = () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      const s = get()
      if (s.kind === 'virtual') {
        void idbSet(IDB_VIRTUAL, { name: s.name ?? 'project', files: s.files, attribution: s.attribution } satisfies VirtualPersisted)
      }
    }, 400)
  }

  const setVirtual = (name: string, files: Record<string, string>, attribution: string | null) => {
    rootHandle = null
    void idbDel(IDB_HANDLE)
    set({ kind: 'virtual', name, files, tree: buildTree(Object.keys(files).map((p) => ({ path: p }))), attribution, canReopen: false, loadedPackages: [], definitions: [] })
    persistVirtual()
  }

  const setFsAccess = async (handle: FileSystemDirectoryHandle) => {
    const tree = await fsa.readTree(handle)
    rootHandle = handle
    void idbSet(IDB_HANDLE, handle).catch(() => {})
    set({ kind: 'fsaccess', name: handle.name, tree, files: {}, attribution: null, canReopen: true, loadedPackages: [], definitions: [] })
  }

  const rebuildVirtualTree = () => {
    set((s) => ({ tree: buildTree(Object.keys(s.files).map((p) => ({ path: p }))) }))
    persistVirtual()
  }

  /** Detach open editor buffers pointing at `path` (turn them into scratch buffers). */
  const detachBuffers = (pred: (path: string) => boolean) => {
    useWorkspace.setState((s) => ({
      buffers: s.buffers.map((b) =>
        b.origin?.type === 'project' && pred(b.origin.path)
          ? { ...b, origin: { type: 'scratch' as const } }
          : b,
      ),
    }))
  }

  const retargetBuffer = (oldPath: string, newPath: string) => {
    useWorkspace.setState((s) => ({
      buffers: s.buffers.map((b) =>
        b.origin?.type === 'project' && b.origin.path === oldPath
          ? { ...b, name: baseName(newPath), origin: { type: 'project' as const, path: newPath } }
          : b,
      ),
    }))
  }

  return {
    kind: null,
    name: null,
    tree: [],
    files: {},
    attribution: null,
    canReopen: false,
    busy: false,
    loadedPackages: [],
    definitions: [],

    hydrateProject: async () => {
      try {
        const v = await idbGet<VirtualPersisted>(IDB_VIRTUAL)
        if (v && v.files && Object.keys(v.files).length > 0) {
          set({ kind: 'virtual', name: v.name, files: v.files, tree: buildTree(Object.keys(v.files).map((p) => ({ path: p }))), attribution: v.attribution ?? null })
          return
        }
      } catch { /* fallthrough */ }
      try {
        const handle = await idbGet<FileSystemDirectoryHandle>(IDB_HANDLE)
        if (handle) set({ canReopen: true })
      } catch { /* no reopen available */ }
    },

    openFolder: async () => {
      try {
        set({ busy: true })
        const handle = await fsa.pickDirectory()
        if (!(await fsa.ensurePermission(handle))) {
          toast('Permission denied — cannot read that folder')
          return
        }
        await setFsAccess(handle)
        log(`Opened project folder "${handle.name}" (on disk)`)
        toast(`Opened project: ${handle.name}`)
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') {
          logErr(`Open folder failed: ${(e as Error)?.message ?? e}`)
          toast('Could not open folder')
        }
      } finally {
        set({ busy: false })
      }
    },

    reopenLast: async () => {
      try {
        set({ busy: true })
        const handle = await idbGet<FileSystemDirectoryHandle>(IDB_HANDLE)
        if (!handle) { toast('No previous project folder found'); return }
        if (!(await fsa.ensurePermission(handle))) {
          toast('Permission denied for the previous folder')
          return
        }
        await setFsAccess(handle)
        log(`Reopened project folder "${handle.name}" (on disk)`)
        toast(`Reopened project: ${handle.name}`)
      } catch (e) {
        logErr(`Reopen failed: ${(e as Error)?.message ?? e}`)
        toast('Could not reopen the previous folder')
      } finally {
        set({ busy: false })
      }
    },

    importZip: async (file, name, attribution = null) => {
      try {
        set({ busy: true })
        const { files, skipped } = await zipToVirtual(file)
        const count = Object.keys(files).length
        if (count === 0) { toast('No readable text files in that ZIP'); return }
        const projectName = name ?? (file instanceof File ? file.name.replace(/\.zip$/i, '') : 'imported-project')
        setVirtual(projectName, files, attribution)
        log(`Imported ZIP "${projectName}" — ${count} files${skipped ? `, ${skipped} binary skipped` : ''} (virtual project)`)
        toast(`Imported ${count} files — virtual project (saves go to Export ZIP)`)
      } catch (e) {
        logErr(`ZIP import failed: ${(e as Error)?.message ?? e}`)
        toast('Could not read that ZIP file')
      } finally {
        set({ busy: false })
      }
    },

    importFolderUpload: async (fileList) => {
      const files: Record<string, string> = {}
      let commonRoot: string | null = null
      let rootVaries = false
      for (const f of Array.from(fileList)) {
        const rel = ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).replace(/^\/+/, '')
        const root = rel.split('/')[0]
        if (commonRoot === null) commonRoot = root
        else if (commonRoot !== root) rootVaries = true
        if (!rel.includes('/')) rootVaries = true
        if (f.size > 2 * 1024 * 1024) continue
        try {
          files[rel] = await f.text()
        } catch { /* skip unreadable */ }
      }
      /* strip the single shared root folder */
      if (!rootVaries && commonRoot) {
        const stripped: Record<string, string> = {}
        for (const [p, c] of Object.entries(files)) stripped[p.slice(commonRoot.length + 1)] = c
        setVirtual(commonRoot, stripped, null)
      } else {
        setVirtual('uploaded-folder', files, null)
      }
      const s = get()
      log(`Uploaded folder "${s.name}" — ${Object.keys(s.files).length} files (virtual project)`)
      toast(`Imported ${Object.keys(s.files).length} files — virtual project`)
    },

    openSample: async () => {
      try {
        set({ busy: true })
        const res = await fetch('/sample-projects/cl-plot.zip')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        await get().importZip(blob, 'cl-plot (sample)', 'cl-plot © Martin Kersner, MIT')
      } catch (e) {
        logErr(`Sample project failed: ${(e as Error)?.message ?? e}`)
        toast('Could not load the sample project')
      } finally {
        set({ busy: false })
      }
    },

    exportZip: async () => {
      const s = get()
      if (!s.kind) return
      try {
        set({ busy: true })
        const files = await get().readProjectFiles()
        await downloadZip(`${(s.name ?? 'project').replace(/\s*\(sample\)\s*$/, '')}.zip`, files)
        log(`Exported ${files.length} files as ZIP`)
        toast(`Exported ${files.length} files`)
      } catch (e) {
        logErr(`ZIP export failed: ${(e as Error)?.message ?? e}`)
        toast('Export failed')
      } finally {
        set({ busy: false })
      }
    },

    closeProject: () => {
      detachBuffers(() => true)
      rootHandle = null
      void idbDel(IDB_VIRTUAL)
      set({ kind: null, name: null, tree: [], files: {}, attribution: null, loadedPackages: [], definitions: [] })
      log('Project closed')
    },

    refreshTree: async () => {
      const s = get()
      if (s.kind === 'fsaccess' && rootHandle) {
        try { set({ tree: await fsa.readTree(rootHandle) }) } catch { /* keep stale tree */ }
      } else if (s.kind === 'virtual') {
        rebuildVirtualTree()
      }
    },

    readProjectFile: async (path) => {
      const s = get()
      if (s.kind === 'virtual') {
        const content = s.files[path]
        if (content == null) throw new Error(`No such file: ${path}`)
        return content
      }
      if (s.kind === 'fsaccess' && rootHandle) return fsa.readFile(rootHandle, path)
      throw new Error('No project open')
    },

    readProjectFiles: async () => {
      const s = get()
      if (s.kind === 'virtual') return Object.entries(s.files).map(([path, content]) => ({ path, content }))
      if (s.kind === 'fsaccess' && rootHandle) return fsa.readAllFiles(rootHandle, s.tree)
      return []
    },

    openFile: async (path) => {
      const ws = useWorkspace.getState()
      const existing = ws.buffers.find((b) => b.origin?.type === 'project' && b.origin.path === path)
      if (existing) { ws.setActiveBuffer(existing.id); return }
      try {
        const content = await get().readProjectFile(path)
        ws.newBuffer(baseName(path), content, { type: 'project', path })
      } catch (e) {
        toast(`Could not open ${baseName(path)}`)
        logErr(`open ${path}: ${(e as Error)?.message ?? e}`)
      }
    },

    saveBuffer: async (bufferId) => {
      const ws = useWorkspace.getState()
      const buf = ws.buffers.find((b) => b.id === bufferId)
      if (!buf || buf.origin?.type !== 'project') return false
      const path = buf.origin.path
      try {
        const s = get()
        if (s.kind === 'virtual') {
          const isNew = s.files[path] == null
          set((st) => ({ files: { ...st.files, [path]: buf.content } }))
          if (isNew) rebuildVirtualTree()
          else persistVirtual()
        } else if (s.kind === 'fsaccess' && rootHandle) {
          await fsa.writeFile(rootHandle, path, buf.content)
          if (!flattenPaths(get().tree).includes(path)) await get().refreshTree()
        } else {
          return false
        }
        ws.markBufferSaved(bufferId)
        useWorkspace.getState().addLog('DEBUG', 'PROJECT', `saved ${path}`)
        return true
      } catch (e) {
        logErr(`save ${path}: ${(e as Error)?.message ?? e}`)
        toast(`Could not save ${buf.name}`)
        return false
      }
    },

    saveAllDirty: async () => {
      const ws = useWorkspace.getState()
      const dirty = ws.buffers.filter((b) => b.dirty && b.origin?.type === 'project')
      let saved = 0
      for (const b of dirty) if (await get().saveBuffer(b.id)) saved++
      if (saved > 0) toast(`Saved ${saved} project file${saved === 1 ? '' : 's'}`)
    },

    createFile: async (dir, name) => {
      const clean = name.trim().replace(/^\/+|\/+$/g, '')
      if (!clean) return
      const path = dir ? `${dir}/${clean}` : clean
      const s = get()
      try {
        if (s.kind === 'virtual') {
          if (get().files[path] != null) { toast('File already exists'); return }
          set((st) => ({ files: { ...st.files, [path]: '' } }))
          rebuildVirtualTree()
        } else if (s.kind === 'fsaccess' && rootHandle) {
          await fsa.writeFile(rootHandle, path, '')
          await get().refreshTree()
        } else return
        log(`created ${path}`)
        await get().openFile(path)
      } catch (e) {
        logErr(`create ${path}: ${(e as Error)?.message ?? e}`)
        toast('Could not create file')
      }
    },

    createFolder: async (dir, name) => {
      const clean = name.trim().replace(/^\/+|\/+$/g, '')
      if (!clean) return
      const path = dir ? `${dir}/${clean}` : clean
      const s = get()
      try {
        if (s.kind === 'virtual') {
          /* virtual folders exist implicitly — add a .gitkeep-style marker */
          set((st) => ({ files: { ...st.files, [`${path}/.gitkeep`]: '' } }))
          rebuildVirtualTree()
        } else if (s.kind === 'fsaccess' && rootHandle) {
          await fsa.createFolder(rootHandle, path)
          await get().refreshTree()
        } else return
        log(`created folder ${path}`)
      } catch (e) {
        logErr(`mkdir ${path}: ${(e as Error)?.message ?? e}`)
        toast('Could not create folder')
      }
    },

    renamePath: async (path, newName) => {
      const clean = newName.trim()
      if (!clean || clean === baseName(path)) return
      const parent = parentOf(path)
      const newPath = parent ? `${parent}/${clean}` : clean
      const s = get()
      try {
        if (s.kind === 'virtual') {
          const files = { ...get().files }
          const prefix = `${path}/`
          if (files[path] != null) {
            files[newPath] = files[path]
            delete files[path]
          } else {
            for (const p of Object.keys(files)) {
              if (p.startsWith(prefix)) {
                files[`${newPath}/${p.slice(prefix.length)}`] = files[p]
                delete files[p]
              }
            }
          }
          set({ files })
          rebuildVirtualTree()
        } else if (s.kind === 'fsaccess' && rootHandle) {
          const isDir = (function find(nodes: ProjectNode[]): ProjectNode | null {
            for (const n of nodes) {
              if (n.path === path) return n
              const r = n.children ? find(n.children) : null
              if (r) return r
            }
            return null
          })(get().tree)?.kind === 'dir'
          if (isDir) {
            toast('Renaming folders on disk is not supported — rename in your OS', { duration: 4000 })
            return
          }
          await fsa.renameFile(rootHandle, path, clean)
          await get().refreshTree()
        } else return
        retargetBuffer(path, newPath)
        log(`renamed ${path} → ${newPath}`)
      } catch (e) {
        logErr(`rename ${path}: ${(e as Error)?.message ?? e}`)
        toast('Rename failed')
      }
    },

    duplicatePath: async (path) => {
      const s = get()
      const newPath = path.replace(/(\.[^./]+)?$/, (m) => `-copy${m ?? ''}`)
      try {
        if (s.kind === 'virtual') {
          const content = get().files[path]
          if (content == null) return
          set((st) => ({ files: { ...st.files, [newPath]: content } }))
          rebuildVirtualTree()
        } else if (s.kind === 'fsaccess' && rootHandle) {
          const content = await fsa.readFile(rootHandle, path)
          await fsa.writeFile(rootHandle, newPath, content)
          await get().refreshTree()
        } else return
        log(`duplicated ${path} → ${newPath}`)
      } catch (e) {
        logErr(`duplicate ${path}: ${(e as Error)?.message ?? e}`)
        toast('Duplicate failed')
      }
    },

    deletePath: async (path) => {
      const s = get()
      try {
        if (s.kind === 'virtual') {
          const files = { ...get().files }
          const prefix = `${path}/`
          for (const p of Object.keys(files)) {
            if (p === path || p.startsWith(prefix)) delete files[p]
          }
          set({ files })
          rebuildVirtualTree()
        } else if (s.kind === 'fsaccess' && rootHandle) {
          await fsa.deleteEntry(rootHandle, path)
          await get().refreshTree()
        } else return
        detachBuffers((p) => p === path || p.startsWith(`${path}/`))
        log(`deleted ${path}`)
      } catch (e) {
        logErr(`delete ${path}: ${(e as Error)?.message ?? e}`)
        toast('Delete failed')
      }
    },

    setLoadedPackages: (pkgs) => set({ loadedPackages: pkgs }),
    setDefinitions: (defs) => set({ definitions: defs }),
  }
})

/** Convert a byte offset (ECL `file-position`, UTF-8) in `content` to a 1-based line/col. */
export function byteOffsetToLineCol(content: string, byteOffset: number): { line: number; col: number } {
  let bytes = 0, line = 1, col = 1
  for (const ch of content) {
    if (bytes >= byteOffset) break
    const cp = ch.codePointAt(0) ?? 0
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
    if (ch === '\n') { line++; col = 1 } else col++
  }
  return { line, col }
}

/** Lisp-source files of the current project, fresh. */
export async function collectLispFiles(): Promise<{ path: string; content: string }[]> {
  const s = useProject.getState()
  const all = await s.readProjectFiles()
  return all.filter((f) => isLispFile(f.path))
}
