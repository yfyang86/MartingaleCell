/* Ephemeral IDE UI state: overlays, confirms, share URL. */

import { create } from 'zustand'

export type ConfirmKind = 'restart' | 'interrupt' | 'clear-session' | 'reset-workspace' | null

interface UiState {
  paletteOpen: boolean
  settingsOpen: boolean
  shortcutsOpen: boolean
  shareUrl: string | null
  confirm: ConfirmKind
  bannerDismissed: boolean
  explorerOpen: boolean
  /** dirty project buffer pending a close confirmation */
  confirmCloseBufferId: string | null
  setPaletteOpen: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  setShortcutsOpen: (v: boolean) => void
  setShareUrl: (u: string | null) => void
  setConfirm: (c: ConfirmKind) => void
  setExplorerOpen: (v: boolean) => void
  toggleExplorer: () => void
  setConfirmCloseBuffer: (id: string | null) => void
  dismissBanner: () => void
}

export const useUi = create<UiState>((set) => ({
  paletteOpen: false,
  settingsOpen: false,
  shortcutsOpen: false,
  shareUrl: null,
  confirm: null,
  bannerDismissed: typeof localStorage !== 'undefined' && localStorage.getItem('conscell-banner-dismissed') === '1',
  explorerOpen: true,
  confirmCloseBufferId: null,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setShareUrl: (shareUrl) => set({ shareUrl }),
  setConfirm: (confirm) => set({ confirm }),
  setExplorerOpen: (explorerOpen) => set({ explorerOpen }),
  toggleExplorer: () => set((s) => ({ explorerOpen: !s.explorerOpen })),
  setConfirmCloseBuffer: (confirmCloseBufferId) => set({ confirmCloseBufferId }),
  dismissBanner: () => {
    localStorage.setItem('conscell-banner-dismissed', '1')
    set({ bannerDismissed: true })
  },
}))
