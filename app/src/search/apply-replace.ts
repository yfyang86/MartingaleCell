/* The replace apply loop, with its effects injected so the order can be
 * tested without React or CodeMirror (scripts/search-test.mjs):
 *   1. the buffer in the editor — one dispatch, so it is one undo step;
 *   2. other open buffers — through the store;
 *   3. project files that are not open — opened as buffers, then updated
 *      through the store (dirty; nothing reaches disk until saved). */

import type { SourceReplacement } from './workspace-search'

export interface ApplyDeps {
  activeBufferId: string | null
  /** replace the editor's whole document; null when no editor is mounted */
  dispatchActive: ((text: string) => void) | null
  updateBuffer: (bufferId: string, text: string) => void
  openFile: (path: string) => Promise<void>
  /** the buffer showing a project path, after openFile */
  findBufferByPath: (path: string) => { id: string; isProject: boolean } | undefined
  /** whether an existing buffer is a project buffer (for the save-all offer) */
  isProjectBuffer: (bufferId: string) => boolean
}

export interface ApplyOutcome {
  total: number
  files: number
  /** project files opened as new buffers */
  opened: number
  /** project buffers (open before or opened now) left dirty */
  dirtyProjectBuffers: number
  viaEditor: number
  viaStore: number
}

export async function applyReplacements(files: SourceReplacement[], deps: ApplyDeps): Promise<ApplyOutcome> {
  const out: ApplyOutcome = { total: 0, files: 0, opened: 0, dirtyProjectBuffers: 0, viaEditor: 0, viaStore: 0 }
  const active = files.filter((f) => f.bufferId && f.bufferId === deps.activeBufferId)
  const otherOpen = files.filter((f) => f.bufferId && f.bufferId !== deps.activeBufferId)
  const unopened = files.filter((f) => !f.bufferId)
  for (const f of active) {
    if (deps.dispatchActive) { deps.dispatchActive(f.text); out.viaEditor++ } else { deps.updateBuffer(f.bufferId!, f.text); out.viaStore++ }
    out.total += f.count; out.files++
    if (deps.isProjectBuffer(f.bufferId!)) out.dirtyProjectBuffers++
  }
  for (const f of otherOpen) {
    deps.updateBuffer(f.bufferId!, f.text); out.viaStore++
    out.total += f.count; out.files++
    if (deps.isProjectBuffer(f.bufferId!)) out.dirtyProjectBuffers++
  }
  for (const f of unopened) {
    await deps.openFile(f.path)
    const b = deps.findBufferByPath(f.path)
    if (!b) continue
    deps.updateBuffer(b.id, f.text); out.viaStore++
    out.total += f.count; out.files++; out.opened++
    if (b.isProject) out.dirtyProjectBuffers++
  }
  return out
}
