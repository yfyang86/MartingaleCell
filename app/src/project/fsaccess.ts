/* File System Access API wrappers: directory picking, permission flow,
 * recursive tree reads, and read/write/create/rename/delete via handles.
 * The directory handle itself is structured-cloneable and persisted in
 * IndexedDB by the project store. */

import type { ProjectNode } from './tree'
import { isTextish, sortTree } from './tree'

/* lib.dom lacks the picker + permission methods — declare what we use. */
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
  }
  interface FileSystemHandle {
    queryPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  }
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>
  }
}

export const fsAccessSupported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

const MAX_DEPTH = 8
const MAX_ENTRIES = 4000
const MAX_FILE_BYTES = 2 * 1024 * 1024
const SKIP_DIRS = new Set(['.git', 'node_modules', '.hg', '.svn', 'dist', 'build'])

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!window.showDirectoryPicker) throw new Error('File System Access API not available')
  return window.showDirectoryPicker({ mode: 'readwrite' })
}

/** true when we may read+write; requests permission when state is 'prompt'. */
export async function ensurePermission(root: FileSystemDirectoryHandle): Promise<boolean> {
  if (!root.queryPermission || !root.requestPermission) return true
  if ((await root.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return (await root.requestPermission({ mode: 'readwrite' })) === 'granted'
}

/** Read the directory tree recursively (files listed, text-ish marked). */
export async function readTree(root: FileSystemDirectoryHandle): Promise<ProjectNode[]> {
  let count = 0
  const walk = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<ProjectNode[]> => {
    if (depth > MAX_DEPTH || count > MAX_ENTRIES) return []
    const out: ProjectNode[] = []
    for await (const [name, handle] of dir.entries()) {
      if (++count > MAX_ENTRIES) break
      const path = prefix ? `${prefix}/${name}` : name
      if (handle.kind === 'directory') {
        if (SKIP_DIRS.has(name)) continue
        out.push({
          name, path, kind: 'dir', textish: false,
          children: await walk(handle as FileSystemDirectoryHandle, path, depth + 1),
        })
      } else {
        let size = 0
        try { size = (await (handle as FileSystemFileHandle).getFile()).size } catch { /* unreadable */ }
        out.push({ name, path, kind: 'file', size, textish: isTextish(name) && size <= MAX_FILE_BYTES })
      }
    }
    return sortTree(out)
  }
  return walk(root, '', 0)
}

async function traverse(root: FileSystemDirectoryHandle, parts: string[]): Promise<FileSystemDirectoryHandle> {
  let dir = root
  for (const p of parts) dir = await dir.getDirectoryHandle(p)
  return dir
}

export async function readFile(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  const parts = path.split('/')
  const dir = await traverse(root, parts.slice(0, -1))
  const fh = await dir.getFileHandle(parts[parts.length - 1])
  return (await fh.getFile()).text()
}

export async function writeFile(root: FileSystemDirectoryHandle, path: string, content: string): Promise<void> {
  const parts = path.split('/')
  const dir = await traverse(root, parts.slice(0, -1))
  const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true })
  const w = await fh.createWritable()
  await w.write(content)
  await w.close()
}

export async function createFolder(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  await traverse(root, path.split('/'))
}

export async function deleteEntry(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const parts = path.split('/')
  const dir = await traverse(root, parts.slice(0, -1))
  await dir.removeEntry(parts[parts.length - 1], { recursive: true })
}

/** No native rename for files in the FS Access stable API — copy + delete. */
export async function renameFile(root: FileSystemDirectoryHandle, path: string, newName: string): Promise<string> {
  const parts = path.split('/')
  const parent = parts.slice(0, -1).join('/')
  const newPath = parent ? `${parent}/${newName}` : newName
  const content = await readFile(root, path)
  await writeFile(root, newPath, content)
  await deleteEntry(root, path)
  return newPath
}

/** Re-read every text-ish project file fresh from disk. */
export async function readAllFiles(root: FileSystemDirectoryHandle, tree: ProjectNode[]): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = []
  const walk = async (nodes: ProjectNode[]) => {
    for (const n of nodes) {
      if (n.kind === 'dir') await walk(n.children ?? [])
      else if (n.textish) {
        try { out.push({ path: n.path, content: await readFile(root, n.path) }) } catch { /* skip unreadable */ }
      }
    }
  }
  await walk(tree)
  return out
}
