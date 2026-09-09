/* Rainbow-paren decorations for the editor:
 * - the s-expression nesting path around the caret lights up in the 6-color cycle
 * - the innermost matched pair gets a 12% background tint
 * - unmatched close parens get a wavy error underline
 * - typing `)` briefly highlights the matching `(` (electric match)
 * Styles live in cl-language.ts theme (cc-rp-* classes). */

import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder, StateEffect } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { scanParens } from './lisp-utils'

const clearFlash = StateEffect.define<null>()

class RainbowParensPlugin {
  decorations: DecorationSet
  flashPos = -1
  flashTimer: ReturnType<typeof setTimeout> | null = null
  readonly view: EditorView

  constructor(view: EditorView) {
    this.view = view
    this.decorations = this.build()
  }

  update(u: ViewUpdate) {
    // electric match: a ')' was just inserted
    if (u.docChanged) {
      let insertedClose = false
      u.changes.iterChanges((_fA, _tA, _fB, toB, inserted) => {
        if (inserted.toString().endsWith(')')) insertedClose = true
        void toB
      })
      if (insertedClose) {
        const head = u.state.selection.main.head
        const match = this.findMatchForClose(u.state.doc.toString(), head - 1)
        if (match >= 0) {
          this.flashPos = match
          if (this.flashTimer) clearTimeout(this.flashTimer)
          this.flashTimer = setTimeout(() => {
            this.flashPos = -1
            this.view.dispatch({ effects: clearFlash.of(null) })
          }, 500)
        }
      }
    }
    if (u.docChanged || u.selectionSet || u.viewportChanged || u.transactions.some((tr) => tr.effects.some((e) => e.is(clearFlash)))) {
      this.decorations = this.build()
    }
  }

  findMatchForClose(src: string, closePos: number): number {
    const parens = scanParens(src)
    const idx = parens.findIndex((p) => p.pos === closePos && !p.open)
    if (idx < 0) return -1
    const m = parens[idx].match
    return m === -1 ? -1 : parens[m].pos
  }

  build(): DecorationSet {
    const src = this.view.state.doc.toString()
    if (src.length === 0 || src.length > 200_000) return Decoration.none
    const caret = this.view.state.selection.main.head
    const parens = scanParens(src)
    const builder = new RangeSetBuilder<Decoration>()
    const marks: { from: number; to: number; deco: Decoration }[] = []

    // unmatched closes → error underline
    for (const p of parens) {
      if (!p.open && p.match === -1) {
        marks.push({ from: p.pos, to: p.pos + 1, deco: Decoration.mark({ class: 'cc-rp-error' }) })
      }
    }

    // ancestor path of the caret
    const ancestors: { open: number; close: number; depth: number }[] = []
    for (const p of parens) {
      if (!p.open || p.pos >= caret) continue
      if (p.match !== -1 && parens[p.match].pos < caret - 1) continue
      ancestors.push({ open: p.pos, close: p.match === -1 ? -1 : parens[p.match].pos, depth: p.depth })
    }
    // innermost last; tint only the innermost matched pair
    const innermost = ancestors[ancestors.length - 1]
    for (const a of ancestors) {
      const cls = `cc-rp-${((a.depth - 1) % 6) + 1}`
      marks.push({ from: a.open, to: a.open + 1, deco: Decoration.mark({ class: cls }) })
      if (a.close >= 0) marks.push({ from: a.close, to: a.close + 1, deco: Decoration.mark({ class: cls }) })
    }
    if (innermost && innermost.close >= 0) {
      const inner = `cc-rp-inner-${((innermost.depth - 1) % 6) + 1}`
      marks.push({ from: innermost.open, to: innermost.open + 1, deco: Decoration.mark({ class: inner }) })
      marks.push({ from: innermost.close, to: innermost.close + 1, deco: Decoration.mark({ class: inner }) })
    }

    // electric match flash
    if (this.flashPos >= 0 && this.flashPos < src.length) {
      marks.push({ from: this.flashPos, to: this.flashPos + 1, deco: Decoration.mark({ class: 'cc-electric-match' }) })
    }

    marks.sort((a, b) => a.from - b.from || a.to - b.to)
    for (const m of marks) builder.add(m.from, m.to, m.deco)
    return builder.finish()
  }

  destroy() {
    if (this.flashTimer) clearTimeout(this.flashTimer)
  }
}

export function rainbowParens(): Extension {
  return ViewPlugin.fromClass(RainbowParensPlugin, { decorations: (v) => v.decorations })
}
