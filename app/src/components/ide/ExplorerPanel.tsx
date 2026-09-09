/* Project explorer sidebar (far left, 240px): file tree for FS-Access
 * folders and virtual (ZIP / upload / sample) projects, with open/save
 * integration, context menu actions, and "Load Project into Runtime". */

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderOpen, FolderPlus, FilePlus, PackageOpen, MoreHorizontal, ChevronRight,
  FileUp, FolderInput, RotateCw, Search, ListTree,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/store/workspace'
import { useUi } from '@/store/ui'
import SearchPanel from './SearchPanel'
import OutlinePanel from './OutlinePanel'
import { useProject } from '@/store/project'
import { loadProjectIntoRuntime } from '@/project/load'
import { fsAccessSupported } from '@/project/fsaccess'
import { isLispFile, type ProjectNode } from '@/project/tree'

/* -------- shared bits -------- */

function IconBtn({ icon, title, onClick, disabled }: { icon: React.ReactNode; title: string; onClick: (e: React.MouseEvent) => void; disabled?: boolean }) {
  return (
    <button
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-md transition-colors duration-100',
        disabled ? 'cursor-not-allowed text-muted/40' : 'text-secondary hover:bg-raised hover:text-primary',
      )}
      title={title}
      onClick={(e) => !disabled && onClick(e)}
    >
      {icon}
    </button>
  )
}

function Menu({ x, y, items, close }: { x: number; y: number; items: { label: string; run: () => void; danger?: boolean; disabled?: boolean; hint?: string }[]; close: () => void }) {
  useEffect(() => {
    const onDown = () => close()
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [close])
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.12 }}
      className="fixed z-50 min-w-[180px] rounded-lg border border-hairline bg-raised py-1 shadow-modal"
      style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - items.length * 30 - 16) }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((it) => (
        <button
          key={it.label}
          disabled={it.disabled}
          className={cn(
            'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[12.5px] transition-colors duration-100',
            it.disabled ? 'cursor-not-allowed text-muted/50' : it.danger ? 'text-error/90 hover:bg-panel hover:text-error' : 'text-secondary hover:bg-panel hover:text-primary',
          )}
          title={it.hint}
          onClick={() => { close(); if (!it.disabled) it.run() }}
        >
          <span>{it.label}</span>
          {it.hint && it.disabled && <span className="font-mono text-[9px] text-muted">unavailable</span>}
        </button>
      ))}
    </motion.div>
  )
}

/* -------- tree node -------- */

interface TreeCtx {
  depth: number
  onOpen: (path: string) => void
  onMenu: (e: React.MouseEvent, node: ProjectNode) => void
  renaming: string | null
  setRenaming: (p: string | null) => void
  commitRename: (path: string, name: string) => void
}

function TreeNode({ node, ctx }: { node: ProjectNode; ctx: TreeCtx }) {
  const [open, setOpen] = useState(ctx.depth < 1)
  const activePath = useWorkspace((s) => {
    const b = s.buffers.find((x) => x.id === s.activeBufferId)
    return b?.origin?.type === 'project' ? b.origin.path : null
  })
  const dirtyPaths = useWorkspace((s) =>
    s.buffers.filter((b) => b.dirty && b.origin?.type === 'project').map((b) => (b.origin as { path: string }).path).join('|'),
  )
  const isDirty = dirtyPaths.split('|').includes(node.path)
  const isActive = node.path === activePath
  const lisp = isLispFile(node.name)

  if (node.kind === 'dir') {
    return (
      <div>
        <button
          className="flex w-full items-center gap-1 rounded-sm px-1 py-[3px] text-left text-[12px] text-secondary transition-colors duration-100 hover:bg-raised hover:text-primary"
          style={{ paddingLeft: 4 + ctx.depth * 12 }}
          onClick={() => setOpen((o) => !o)}
          onContextMenu={(e) => ctx.onMenu(e, node)}
        >
          <ChevronRight size={11} className={cn('shrink-0 text-muted transition-transform duration-150', open && 'rotate-90')} />
          <span className="truncate">{node.name}</span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              {(node.children ?? []).map((c) => (
                <TreeNode key={c.path} node={c} ctx={{ ...ctx, depth: ctx.depth + 1 }} />
              ))}
              {(node.children ?? []).length === 0 && (
                <div className="py-[3px] font-mono text-[10.5px] text-muted/60" style={{ paddingLeft: 20 + (ctx.depth + 1) * 12 }}>
                  (empty)
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <button
      className={cn(
        'group flex w-full items-center gap-1.5 rounded-sm px-1 py-[3px] text-left font-mono text-[11.5px] transition-colors duration-100',
        isActive ? 'bg-steel-dim text-primary' : 'hover:bg-raised',
        node.textish ? (isActive ? 'text-primary' : 'text-secondary hover:text-primary') : 'cursor-default text-muted/50',
      )}
      style={{ paddingLeft: 14 + ctx.depth * 12 }}
      onClick={() => node.textish && ctx.onOpen(node.path)}
      onContextMenu={(e) => ctx.onMenu(e, node)}
      title={node.textish ? node.path : `${node.path} (binary — not editable)`}
    >
      <span className={cn('shrink-0 text-[11px]', lisp ? 'text-lisp-purple' : 'text-muted')}>{lisp ? 'λ' : '·'}</span>
      {ctx.renaming === node.path ? (
        <input
          autoFocus
          defaultValue={node.name}
          className="w-full min-w-0 rounded-sm bg-inset px-1 py-0 text-[11.5px] text-primary outline-none ring-1 ring-steel"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => { ctx.commitRename(node.path, e.target.value); ctx.setRenaming(null) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { ctx.commitRename(node.path, (e.target as HTMLInputElement).value); ctx.setRenaming(null) }
            if (e.key === 'Escape') ctx.setRenaming(null)
          }}
        />
      ) : (
        <span className="truncate">{node.name}</span>
      )}
      {isDirty && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-steel" />}
    </button>
  )
}

/* -------- empty state -------- */

function EmptyExplorer({ onImportZip, onUploadFolder }: { onImportZip: (f: File) => void; onUploadFolder: (fl: FileList) => void }) {
  const zipRef = useRef<HTMLInputElement>(null)
  const dirRef = useRef<HTMLInputElement>(null)
  const canReopen = useProject((s) => s.canReopen)
  const reopenLast = useProject((s) => s.reopenLast)
  const openFolder = useProject((s) => s.openFolder)
  const openSample = useProject((s) => s.openSample)
  const busy = useProject((s) => s.busy)
  const btn = 'flex w-full items-center gap-2 rounded-md border border-hairline px-3 py-2 text-[12.5px] text-secondary transition-all duration-150 hover:border-strong hover:bg-raised hover:text-primary'
  return (
    <div className="flex flex-1 flex-col gap-2 px-3 py-4">
      <p className="text-[12px] leading-relaxed text-muted">No project open. A project is just a folder of Lisp files.</p>
      {fsAccessSupported && (
        <button className={btn} onClick={() => void openFolder()} disabled={busy}>
          <FolderOpen size={13} className="text-steel" /> Open Folder…
        </button>
      )}
      <button className={btn} onClick={() => zipRef.current?.click()} disabled={busy}>
        <FileUp size={13} className="text-steel" /> Import ZIP…
      </button>
      <button className={btn} onClick={() => dirRef.current?.click()} disabled={busy}>
        <FolderInput size={13} className="text-steel" /> Upload Folder…
      </button>
      {canReopen && (
        <button className={btn} onClick={() => void reopenLast()} disabled={busy}>
          <RotateCw size={13} className="text-steel" /> Reopen last project
        </button>
      )}
      <button
        className="mt-1 text-left font-mono text-[11.5px] text-steel underline decoration-dotted underline-offset-2 hover:text-steel-bright"
        onClick={() => void openSample()}
        disabled={busy}
      >
        Open sample project: cl-plot (MIT)
      </button>
      <input ref={zipRef} type="file" accept=".zip,application/zip" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportZip(f); e.target.value = '' }} />
      <input ref={dirRef} type="file" className="hidden"
        // @ts-expect-error non-standard but universally supported attribute
        webkitdirectory=""
        onChange={(e) => { if (e.target.files?.length) onUploadFolder(e.target.files); e.target.value = '' }} />
    </div>
  )
}

/* -------- main panel -------- */

export default function ExplorerPanel() {
  const kind = useProject((s) => s.kind)
  const name = useProject((s) => s.name)
  const tree = useProject((s) => s.tree)
  const attribution = useProject((s) => s.attribution)
  const busy = useProject((s) => s.busy)
  const engineStatus = useWorkspace((s) => s.engineStatus)
  const evaluating = useWorkspace((s) => s.evaluating)
  const searchOpen = useUi((s) => s.searchOpen)
  const openSearch = useUi((s) => s.openSearch)
  const setSearchOpen = useUi((s) => s.setSearchOpen)
  const outlineOpen = useUi((s) => s.outlineOpen)
  const toggleOutline = useUi((s) => s.toggleOutline)
  const engineReady = engineStatus === 'ready-ecl' || engineStatus === 'ready-jscl' || engineStatus === 'ready-mock'

  const [menu, setMenu] = useState<{ x: number; y: number; node: ProjectNode } | null>(null)
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [creating, setCreating] = useState<{ dir: string; kind: 'file' | 'folder' } | null>(null)
  const zipRef = useRef<HTMLInputElement>(null)
  const dirUploadRef = useRef<HTMLInputElement>(null)

  const ps = useProject.getState

  const ctx: TreeCtx = {
    depth: 0,
    onOpen: (path) => void ps().openFile(path),
    onMenu: (e, node) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, node }) },
    renaming,
    setRenaming,
    commitRename: (path, newName) => void ps().renamePath(path, newName),
  }

  const loadDisabled = !kind || !engineReady || evaluating || busy

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 240, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0.7, 0.3, 1] }}
      className="flex h-full w-60 shrink-0 flex-col overflow-hidden border-r border-hairline bg-panel"
    >
      {/* header */}
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-hairline px-2">
        <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Explorer</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-secondary" title={name ?? undefined}>
          {name ?? ''}
        </span>
        <IconBtn
          icon={<PackageOpen size={13} />}
          title={kind ? 'Load Project into Runtime (recursive, then call it)' : 'Open a project first'}
          onClick={() => void loadProjectIntoRuntime()}
          disabled={loadDisabled}
        />
        <IconBtn icon={<Search size={13} />} title="Search workspace (Ctrl⇧F)" onClick={() => (searchOpen ? setSearchOpen(false) : openSearch())} />
        <IconBtn icon={<ListTree size={13} />} title="Outline of definitions (Ctrl⇧O)" onClick={toggleOutline} />
        <IconBtn icon={<FilePlus size={13} />} title="New file" onClick={() => setCreating({ dir: '', kind: 'file' })} disabled={!kind} />
        <IconBtn icon={<FolderPlus size={13} />} title="New folder" onClick={() => setCreating({ dir: '', kind: 'folder' })} disabled={!kind} />
        <IconBtn icon={<MoreHorizontal size={13} />} title="Project actions" onClick={(e) => setMoreMenu({ x: (e.target as HTMLElement).getBoundingClientRect().left, y: (e.target as HTMLElement).getBoundingClientRect().bottom + 4 })} />
      </div>

      {searchOpen && <SearchPanel />}
      {outlineOpen && <OutlinePanel />}

      {/* inline create row */}
      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="overflow-hidden border-b border-hairline"
          >
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <span className="font-mono text-[10px] text-muted">{creating.kind === 'file' ? 'λ' : '▸'}</span>
              <input
                autoFocus
                placeholder={creating.kind === 'file' ? 'name.lisp' : 'folder-name'}
                className="h-6 w-full min-w-0 rounded-sm bg-inset px-2 font-mono text-[11.5px] text-primary outline-none ring-1 ring-steel"
                onKeyDown={(e) => {
                  const v = (e.target as HTMLInputElement).value
                  if (e.key === 'Enter' && v.trim()) {
                    if (creating.kind === 'file') void ps().createFile(creating.dir, v)
                    else void ps().createFolder(creating.dir, v)
                    setCreating(null)
                  }
                  if (e.key === 'Escape') setCreating(null)
                }}
                onBlur={() => setCreating(null)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* tree / empty state */}
      {!kind ? (
        <EmptyExplorer
          onImportZip={(f) => void ps().importZip(f)}
          onUploadFolder={(fl) => void ps().importFolderUpload(fl)}
        />
      ) : (
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-1 py-1">
          {tree.map((n) => <TreeNode key={n.path} node={n} ctx={ctx} />)}
          {tree.length === 0 && <p className="px-2 py-3 font-mono text-[11px] text-muted">(empty project)</p>}
        </div>
      )}

      {/* footer */}
      {kind && (
        <div className="shrink-0 border-t border-hairline px-3 py-1.5">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-[9.5px] text-muted">
              {kind === 'fsaccess' ? 'on disk' : 'virtual'}
            </span>
            {kind === 'virtual' && (
              <button
                className="font-mono text-[10px] text-steel hover:text-steel-bright"
                onClick={() => void ps().exportZip()}
                title="Download the project as a ZIP (this is how virtual projects are saved)"
              >
                Export ZIP
              </button>
            )}
          </div>
          {attribution && <p className="mt-1 font-mono text-[9.5px] text-muted/70">{attribution}</p>}
        </div>
      )}

      {/* node context menu */}
      <AnimatePresence>
        {menu && (
          <Menu
            x={menu.x}
            y={menu.y}
            close={() => setMenu(null)}
            items={[
              ...(menu.node.kind === 'file' ? [{ label: 'Open', run: () => void ps().openFile(menu.node.path) }] : []),
              ...(menu.node.kind === 'dir' ? [
                { label: 'New file here', run: () => setCreating({ dir: menu.node.path, kind: 'file' }) },
                { label: 'New folder here', run: () => setCreating({ dir: menu.node.path, kind: 'folder' }) },
              ] : []),
              { label: 'Rename', run: () => setRenaming(menu.node.path) },
              ...(menu.node.kind === 'file' ? [{ label: 'Duplicate', run: () => void ps().duplicatePath(menu.node.path) }] : []),
              { label: 'Delete', run: () => void ps().deletePath(menu.node.path), danger: true },
            ]}
          />
        )}
      </AnimatePresence>

      {/* header "more" menu */}
      <AnimatePresence>
        {moreMenu && (
          <Menu
            x={moreMenu.x}
            y={moreMenu.y}
            close={() => setMoreMenu(null)}
            items={[
              { label: 'Load Project into Runtime', run: () => void loadProjectIntoRuntime(), disabled: loadDisabled },
              { label: 'Export ZIP', run: () => void ps().exportZip(), disabled: !kind },
              { label: 'Open Folder…', run: () => void ps().openFolder(), disabled: !fsAccessSupported, hint: 'this browser has no File System Access API' },
              { label: 'Reopen last project', run: () => void ps().reopenLast(), disabled: !useProject.getState().canReopen },
              { label: 'Import ZIP…', run: () => zipRef.current?.click() },
              { label: 'Upload Folder…', run: () => dirUploadRef.current?.click() },
              { label: 'Open sample project: cl-plot (MIT)', run: () => void ps().openSample() },
              { label: 'Close project', run: () => ps().closeProject(), disabled: !kind, danger: true },
            ]}
          />
        )}
      </AnimatePresence>

      <input ref={zipRef} type="file" accept=".zip,application/zip" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void ps().importZip(f); e.target.value = '' }} />
      <input ref={dirUploadRef} type="file" className="hidden"
        // @ts-expect-error non-standard but universally supported attribute
        webkitdirectory=""
        onChange={(e) => { if (e.target.files?.length) void ps().importFolderUpload(e.target.files); e.target.value = '' }} />
    </motion.div>
  )
}


