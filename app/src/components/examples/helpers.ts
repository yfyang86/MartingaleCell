import { toast } from 'sonner'
import { compressToEncodedURIComponent } from 'lz-string'
import type { Example } from '@/data/examples'
import { countCells } from './highlight'

export function lineCount(code: string): number {
  return code.replace(/\n+$/, '').split('\n').length
}

export function cellCount(code: string): number {
  return countCells(code)
}

/** "~2s read" style estimate used on the featured card meta row. */
export function readSeconds(code: string): number {
  return Math.max(1, Math.round(lineCount(code) / 14))
}

export async function copyText(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Clipboard API unavailable (non-secure context) — legacy fallback.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  toast.success(message, { duration: 3500 })
}

export function copySource(ex: Example) {
  return copyText(ex.code, 'Copied — paste anywhere')
}

export function shareUrl(ex: Example): string {
  const packed = compressToEncodedURIComponent(ex.code)
  return `${window.location.origin}/ide#s=${packed}`
}

export function copyShareLink(ex: Example) {
  return copyText(shareUrl(ex), 'Share link copied — opens in the IDE')
}

export const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = {
  1: 'intro',
  2: 'intermediate',
  3: 'advanced',
}

/** intro = steel, intermediate = purple, advanced = amber (examples.md §3) */
export const DIFFICULTY_CLASS: Record<1 | 2 | 3, string> = {
  1: 'border-steel/40 bg-steel-dim/40 text-steel-bright',
  2: 'border-lisp/40 bg-lisp/10 text-lisp',
  3: 'border-warning/40 bg-warning/10 text-warning',
}
