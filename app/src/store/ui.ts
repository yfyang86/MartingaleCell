/* Ephemeral IDE UI state: overlays, confirms, share URL. */

import { create } from 'zustand'
import type { SearchOptions } from '@/search/workspace-search'

export interface SearchPreset { query: string; opts?: SearchOptions }

const SEARCH_OPTS_KEY = 'conscell-search-opts'
function loadSearchOpts(): SearchOptions {
  try { return JSON.parse(localStorage.getItem(SEARCH_OPTS_KEY) ?? '{}') as SearchOptions } catch { return {} }
}
function saveSearchOpts(o: SearchOptions): SearchOptions {
  try { localStorage.setItem(SEARCH_OPTS_KEY, JSON.stringify(o)) } catch { /* private mode */ }
  return o
}

export type ConfirmKind = 'restart' | 'interrupt' | 'clear-session' | 'reset-workspace' | null

interface UiState {
  paletteOpen: boolean
  settingsOpen: boolean
  shortcutsOpen: boolean
  shareUrl: string | null
  confirm: ConfirmKind
  bannerDismissed: boolean
  explorerOpen: boolean
  /** workspace search panel (explorer column) */
  searchOpen: boolean
  /** bumps every time openSearch() runs so the panel can refocus its input */
  searchFocusTick: number
  /** the search panel's query and options live here so find-references can preset them */
  searchQuery: string
  searchOpts: SearchOptions
  /** dirty project buffer pending a close confirmation */
  confirmCloseBufferId: string | null
  setPaletteOpen: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  setShortcutsOpen: (v: boolean) => void
  setShareUrl: (u: string | null) => void
  setConfirm: (c: ConfirmKind) => void
  setExplorerOpen: (v: boolean) => void
  toggleExplorer: () => void
  setSearchOpen: (v: boolean) => void
  /** open the explorer and the search panel, focus the query box; with a preset, run that search */
  openSearch: (preset?: SearchPreset) => void
  setSearchQuery: (q: string) => void
  setSearchOpts: (patch: Partial<SearchOptions>) => void
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
  searchOpen: false,
  searchFocusTick: 0,
  searchQuery: '',
  searchOpts: loadSearchOpts(),
  confirmCloseBufferId: null,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setShareUrl: (shareUrl) => set({ shareUrl }),
  setConfirm: (confirm) => set({ confirm }),
  setExplorerOpen: (explorerOpen) => set({ explorerOpen }),
  toggleExplorer: () => set((s) => ({ explorerOpen: !s.explorerOpen })),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  openSearch: (preset) => set((s) => ({
    explorerOpen: true, searchOpen: true, searchFocusTick: s.searchFocusTick + 1,
    ...(preset ? { searchQuery: preset.query, searchOpts: saveSearchOpts({ ...s.searchOpts, ...preset.opts }) } : {}),
  })),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSearchOpts: (patch) => set((s) => ({ searchOpts: saveSearchOpts({ ...s.searchOpts, ...patch }) })),
  setConfirmCloseBuffer: (confirmCloseBufferId) => set({ confirmCloseBufferId }),
  dismissBanner: () => {
    localStorage.setItem('conscell-banner-dismissed', '1')
    set({ bannerDismissed: true })
  },
}))
