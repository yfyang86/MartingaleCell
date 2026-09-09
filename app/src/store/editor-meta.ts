/* Ephemeral editor metadata (cursor position, sexp depth, signature help) —
 * updated on every selection change; kept OUT of the persisted workspace store. */

import { create } from 'zustand'

export interface SignatureInfo {
  fn: string
  arglist: string
  argIndex: number
}

interface EditorMetaState {
  line: number
  col: number
  depth: number
  signature: SignatureInfo | null
  setCursor: (line: number, col: number, depth: number) => void
  setSignature: (s: SignatureInfo | null) => void
}

export const useEditorMeta = create<EditorMetaState>((set) => ({
  line: 1,
  col: 1,
  depth: 0,
  signature: null,
  setCursor: (line, col, depth) => set({ line, col, depth }),
  setSignature: (signature) => set({ signature }),
}))
