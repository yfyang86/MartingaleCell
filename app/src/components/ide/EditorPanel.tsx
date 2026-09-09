/* Editor panel: buffer tab bar + CodeMirror 6 surface + context menu +
 * signature-help bar + empty state. */

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, rectangularSelection,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import {
  autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap,
  startCompletion, completionStatus,
} from '@codemirror/autocomplete'
import { indentService, indentUnit } from '@codemirror/language'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/store/workspace'
import { useUi } from '@/store/ui'
import { useEditorMeta } from '@/store/editor-meta'
import { clSyntaxExtension, clEditorTheme } from './cl-language'
import { rainbowParens } from './rainbow-parens'
import { clCompletionSource } from './completion'
import { lookupSymbol } from '@/lisp/symbols'
import { depthAt, callContextAt, innermostFormAt, topLevelForms } from './lisp-utils'
import {
  registerEditor, evaluateFormAtPoint, evaluateAllForms, evaluateRegion,
  macroexpandAtPoint, copyText, pasteIntoEditor, saveBuffers, requestCloseBuffer,
} from './actions'

/* -------- lisp-aware indentation (2-space, body-aware) -------- */

const BODY_FORMS = new Set([
  'defun', 'defmacro', 'defmethod', 'defgeneric', 'defclass', 'defstruct', 'defpackage',
  'let', 'let*', 'flet', 'labels', 'macrolet', 'when', 'unless', 'progn', 'handler-case',
  'handler-bind', 'restart-case', 'unwind-protect', 'multiple-value-bind', 'destructuring-bind',
  'with-open-file', 'with-output-to-string', 'with-input-from-string', 'with-slots', 'loop',
  'dolist', 'dotimes', 'do', 'do*', 'cond', 'case', 'ecase', 'typecase', 'block', 'tagbody',
  'catch', 'eval-when', 'lambda', 'defparameter', 'defvar', 'defconstant',
])

const lispIndent = indentService.of((context, pos) => {
  const src = context.state.doc.toString()
  // find innermost unmatched open before pos
  const stack: { pos: number; head: string; headEnd: number }[] = []
  let inStr = false
  for (let i = 0; i < pos; i++) {
    const c = src[i]
    if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue }
    if (c === ';') { while (i < pos && src[i] !== '\n') i++; continue }
    if (c === '"') { inStr = true; continue }
    if (c === '#') {
      if (src[i + 1] === '|') { let d = 1; i += 2; while (i < pos && d > 0) { if (src[i] === '#' && src[i + 1] === '|') { d++; i++ } else if (src[i] === '|' && src[i + 1] === '#') { d--; i++ } i++ } continue }
      if (src[i + 1] === '\\') {
        i += 2
        if (i < pos && /[A-Za-z0-9]/.test(src[i])) { while (i < pos && /[A-Za-z0-9]/.test(src[i])) i++; i-- }
        continue
      }
    }
    if (c === '(') {
      let j = i + 1
      while (j < src.length && /\s/.test(src[j])) j++
      let k = j
      while (k < src.length && /[^\s()'"`,;]/.test(src[k])) k++
      stack.push({ pos: i, head: src.slice(j, k).toLowerCase(), headEnd: k })
    } else if (c === ')') stack.pop()
  }
  const inner = stack[stack.length - 1]
  if (!inner) return 0
  const openCol = inner.pos - (src.lastIndexOf('\n', inner.pos - 1) + 1)
  if (BODY_FORMS.has(inner.head)) return openCol + 2
  // align under the first argument (just after the head symbol)
  return inner.headEnd - (src.lastIndexOf('\n', inner.pos - 1) + 1) + 1
})

/* -------- context menu -------- */

interface MenuState { x: number; y: number }

function ContextMenu({ menu, close }: { menu: MenuState; close: () => void }) {
  const items: { label: string; kbd?: string; run: () => void }[] = [
    { label: 'Evaluate form at point', kbd: 'Ctrl↵', run: evaluateFormAtPoint },
    { label: 'Evaluate region', run: evaluateRegion },
    { label: 'Macroexpand-1', run: macroexpandAtPoint },
    { label: 'Select enclosing form', kbd: 'Ctrl⇧↑', run: selectEnclosingForm },
    { label: 'Copy', kbd: 'Ctrl C', run: () => {
        const v = getViewSafe()
        if (v) { const s = v.state.selection.main; if (!s.empty) void copyText(v.state.sliceDoc(s.from, s.to), 'Copied selection') }
      } },
    { label: 'Paste', kbd: 'Ctrl V', run: () => void pasteIntoEditor() },
  ]
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.12, ease: [0.2, 0.7, 0.3, 1] }}
      className="fixed z-50 min-w-[220px] rounded-lg border border-hairline bg-raised py-1 shadow-modal"
      style={{ left: menu.x, top: menu.y }}
    >
      {items.map((it) => (
        <button
          key={it.label}
          className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-[12.5px] text-secondary transition-colors duration-100 hover:bg-panel hover:text-primary"
          onClick={() => { close(); it.run() }}
        >
          <span>{it.label}</span>
          {it.kbd && <span className="font-mono text-[10px] text-muted">{it.kbd}</span>}
        </button>
      ))}
    </motion.div>
  )
}

function getViewSafe(): EditorView | null { return viewRef.current }
const viewRef: { current: EditorView | null } = { current: null }

/** Jump the editor caret to a 1-based line/col and flash the line. */
export function jumpToPosition(line: number, col: number) {
  const v = viewRef.current
  if (!v) return
  const l = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines)))
  const pos = Math.min(l.from + Math.max(0, col - 1), l.to)
  v.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
  v.focus()
  requestAnimationFrame(() => {
    const el = v.dom.querySelector('.cm-activeLine') as HTMLElement | null
    if (el) {
      el.style.transition = 'none'
      el.style.backgroundColor = 'rgba(110,168,220,0.28)'
      requestAnimationFrame(() => {
        el.style.transition = 'background-color 600ms ease'
        el.style.backgroundColor = ''
      })
    }
  })
}

export function selectEnclosingForm() {
  const v = viewRef.current
  if (!v) return
  const doc = v.state.doc.toString()
  const sel = v.state.selection.main
  // grow: if a form is already fully selected, expand around it
  const probe = sel.empty ? sel.head : Math.max(0, sel.from - 1)
  const form = innermostFormAt(doc, probe)
  if (form) v.dispatch({ selection: { anchor: form.from, head: form.to } })
}

/* -------- tab bar -------- */

function TabBar() {
  const buffers = useWorkspace((s) => s.buffers)
  const activeBufferId = useWorkspace((s) => s.activeBufferId)
  const setActiveBuffer = useWorkspace((s) => s.setActiveBuffer)
  const closeOtherBuffers = useWorkspace((s) => s.closeOtherBuffers)
  const duplicateBuffer = useWorkspace((s) => s.duplicateBuffer)
  const renameBuffer = useWorkspace((s) => s.renameBuffer)
  const newBuffer = useWorkspace((s) => s.newBuffer)
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)

  useEffect(() => {
    if (!tabMenu) return
    const close = () => setTabMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [tabMenu])

  return (
    <div className="flex h-[34px] shrink-0 items-stretch overflow-x-auto border-b border-hairline bg-panel">
      {buffers.map((b) => {
        const active = b.id === activeBufferId
        return (
          <motion.div
            key={b.id}
            layout="position"
            initial={{ opacity: 0, maxWidth: 0 }}
            animate={{ opacity: 1, maxWidth: 240 }}
            exit={{ opacity: 0, maxWidth: 0 }}
            transition={{ duration: 0.16, ease: [0.2, 0.7, 0.3, 1] }}
            className={cn(
              'group relative flex cursor-pointer items-center gap-1.5 overflow-hidden border-r border-hairline px-3 font-mono text-[12px]',
              active ? 'bg-raised text-primary' : 'text-muted hover:text-secondary',
            )}
            onClick={() => setActiveBuffer(b.id)}
            onContextMenu={(e) => { e.preventDefault(); setTabMenu({ x: e.clientX, y: e.clientY, id: b.id }) }}
          >
            <span className="text-[11px] text-muted">λ</span>
            {renaming === b.id ? (
              <input
                autoFocus
                defaultValue={b.name}
                className="w-28 rounded-sm bg-inset px-1 py-0.5 text-[12px] text-primary outline-none ring-1 ring-steel"
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => { renameBuffer(b.id, e.target.value); setRenaming(null) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { renameBuffer(b.id, (e.target as HTMLInputElement).value); setRenaming(null) }
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <span className="truncate">{b.name}</span>
            )}
            {b.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-steel" title="unsaved changes" />}
            <button
              className="ml-0.5 hidden h-4 w-4 items-center justify-center rounded-sm text-muted hover:bg-panel hover:text-primary group-hover:flex"
              onClick={(e) => { e.stopPropagation(); requestCloseBuffer(b.id) }}
              aria-label={`Close ${b.name}`}
            >
              <X size={11} />
            </button>
            {active && <motion.span layoutId="tab-underline" className="absolute inset-x-0 bottom-0 h-[2px] bg-steel" transition={{ type: 'spring', stiffness: 400, damping: 35 }} />}
          </motion.div>
        )
      })}
      <button
        className="flex w-8 shrink-0 items-center justify-center text-muted transition-colors duration-100 hover:bg-raised hover:text-primary"
        onClick={() => newBuffer()}
        title="New buffer (Ctrl N)"
      >
        <Plus size={14} />
      </button>

      <AnimatePresence>
        {tabMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="fixed z-50 min-w-[160px] rounded-lg border border-hairline bg-raised py-1 shadow-modal"
            style={{ left: tabMenu.x, top: tabMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {[
              { label: 'Rename', run: () => setRenaming(tabMenu.id) },
              { label: 'Duplicate', run: () => duplicateBuffer(tabMenu.id) },
              { label: 'Close', run: () => requestCloseBuffer(tabMenu.id) },
              { label: 'Close others', run: () => closeOtherBuffers(tabMenu.id) },
            ].map((it) => (
              <button
                key={it.label}
                className="block w-full px-3 py-1.5 text-left text-[12.5px] text-secondary hover:bg-panel hover:text-primary"
                onClick={() => { setTabMenu(null); it.run() }}
              >
                {it.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* -------- editor surface -------- */

function EditorSurface() {
  const hostRef = useRef<HTMLDivElement>(null)
  const activeBufferId = useWorkspace((s) => s.activeBufferId)
  const fontSize = useWorkspace((s) => s.settings.fontSize)
  const ligatures = useWorkspace((s) => s.settings.ligatures)
  const rainbow = useWorkspace((s) => s.settings.rainbowParens)
  const tabWidth = useWorkspace((s) => s.settings.tabWidth)
  const lineWrap = useWorkspace((s) => s.settings.lineWrap)
  const hydrated = useWorkspace((s) => s.hydrated)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const themeComp = useRef(new Compartment())
  const rainbowComp = useRef(new Compartment())
  const tabComp = useRef(new Compartment())
  const wrapComp = useRef(new Compartment())
  const typedRef = useRef(false)
  /** True while the first-visit typing welcome is animating — the animation is
   * purely visual: it must not write back to the store or trigger doc swaps. */
  const typingWelcomeRef = useRef(false)

  const setCursor = useEditorMeta((s) => s.setCursor)
  const setSignature = useEditorMeta((s) => s.setSignature)

  const updateMeta = useCallback((v: EditorView) => {
    const state = v.state
    const pos = state.selection.main.head
    const line = state.doc.lineAt(pos)
    setCursor(line.number, pos - line.from + 1, depthAt(state.doc.toString(), pos))
    const ctx = callContextAt(state.doc.toString(), pos)
    if (ctx) {
      const sym = lookupSymbol(ctx.fn)
      if (sym && sym.arglist) setSignature({ fn: sym.name.toUpperCase(), arglist: sym.arglist, argIndex: ctx.argIndex })
      else setSignature(null)
    } else setSignature(null)
  }, [setCursor, setSignature])

  // create the editor once
  useEffect(() => {
    if (!hostRef.current) return
    const s = useWorkspace.getState()
    const buf = s.buffers.find((b) => b.id === s.activeBufferId)
    const initialDoc = buf?.content ?? ''
    const doTypingWelcome = s.freshVisit && !typedRef.current && initialDoc.length > 0

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: doTypingWelcome ? '' : initialDoc,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          rectangularSelection(),
          highlightSelectionMatches(),
          EditorState.allowMultipleSelections.of(true),
          indentUnit.of('  '),
          lispIndent,
          closeBrackets(),
          autocompletion({ override: [clCompletionSource], maxRenderedOptions: 8, icons: true }),
          clSyntaxExtension,
          themeComp.current.of(clEditorTheme(useWorkspace.getState().settings.fontSize, useWorkspace.getState().settings.ligatures)),
          tabComp.current.of(EditorState.tabSize.of(useWorkspace.getState().settings.tabWidth)),
          rainbowComp.current.of(useWorkspace.getState().settings.rainbowParens ? rainbowParens() : []),
          wrapComp.current.of(useWorkspace.getState().settings.lineWrap ? EditorView.lineWrapping : []),
          keymap.of([
            { key: 'Mod-Enter', run: () => { evaluateFormAtPoint(); return true } },
            { key: 'Mod-Shift-Enter', run: () => { evaluateAllForms(); return true } },
            { key: 'Mod-k', run: () => { const ui = useUi.getState(); ui.setPaletteOpen(!ui.paletteOpen); return true } },
            { key: 'Mod-.', run: () => { if (useWorkspace.getState().evaluating) useUi.getState().setConfirm('interrupt'); return true } },
            { key: 'Mod-s', run: () => { saveBuffers(); return true } },
            { key: 'Mod-Shift-L', run: () => { useUi.getState().setConfirm('clear-session'); return true } },
            {
              key: 'Ctrl-Space',
              run: (v) => {
                if (completionStatus(v.state) !== null) return false
                const word = v.state.wordAt(v.state.selection.main.head)
                const text = word ? v.state.sliceDoc(word.from, word.to) : ''
                if (text && lookupSymbol(text) && completionStatus(v.state) === null) {
                  // completed symbol → startCompletion still shows docs on hover of the option;
                  // fall through to completion for consistency
                }
                return startCompletion(v)
              },
            },
            { key: 'Mod-Shift-ArrowUp', run: () => { selectEnclosingForm(); return true } },
            {
              key: 'Alt-ArrowUp',
              run: (v) => {
                const forms = topLevelForms(v.state.doc.toString())
                const head = v.state.selection.main.head
                const prev = [...forms].reverse().find((f) => f.from < head - 1)
                if (prev) v.dispatch({ selection: { anchor: prev.from }, scrollIntoView: true })
                return true
              },
            },
            {
              key: 'Alt-ArrowDown',
              run: (v) => {
                const forms = topLevelForms(v.state.doc.toString())
                const head = v.state.selection.main.head
                const next = forms.find((f) => f.from > head)
                if (next) v.dispatch({ selection: { anchor: next.from }, scrollIntoView: true })
                return true
              },
            },
            indentWithTab,
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !typingWelcomeRef.current) {
              const st = useWorkspace.getState()
              const id = st.activeBufferId
              if (id) st.updateBufferContent(id, u.state.doc.toString())
            }
            if (u.selectionSet || u.docChanged) updateMeta(u.view)
          }),
        ],
      }),
    })
    viewRef.current = view
    registerEditor(view)
    updateMeta(view)

    // first-visit typing welcome animation (12ms/char) — visual only; the
    // seeded buffer content is already in the store, so typed characters are
    // never written back (typingWelcomeRef gates the updateListener/swap).
    if (doTypingWelcome) {
      typedRef.current = true
      typingWelcomeRef.current = true
      let i = 0
      const target = initialDoc
      const tick = () => {
        if (!viewRef.current) return
        i = Math.min(target.length, i + 1)
        view.dispatch({ changes: { from: view.state.doc.length, insert: target.slice(i - 1, i) } })
        if (i < target.length) timer = setTimeout(tick, 12)
        else typingWelcomeRef.current = false
      }
      let timer = setTimeout(tick, 350)
      return () => {
        clearTimeout(timer)
        typingWelcomeRef.current = false
        registerEditor(null)
        viewRef.current = null
        view.destroy()
      }
    }

    return () => {
      typingWelcomeRef.current = false
      registerEditor(null)
      viewRef.current = null
      view.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  // swap document when the active buffer changes
  useEffect(() => {
    const v = viewRef.current
    if (!v) return
    if (typingWelcomeRef.current) return // typing welcome owns the doc until done
    const buf = useWorkspace.getState().buffers.find((b) => b.id === activeBufferId)
    const content = buf?.content ?? ''
    if (v.state.doc.toString() !== content) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: content } })
      updateMeta(v)
    }
  }, [activeBufferId, updateMeta])

  // live settings reconfiguration
  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeComp.current.reconfigure(clEditorTheme(fontSize, ligatures)) })
  }, [fontSize, ligatures])
  useEffect(() => {
    viewRef.current?.dispatch({ effects: rainbowComp.current.reconfigure(rainbow ? rainbowParens() : []) })
  }, [rainbow])
  useEffect(() => {
    viewRef.current?.dispatch({ effects: tabComp.current.reconfigure(EditorState.tabSize.of(tabWidth)) })
  }, [tabWidth])
  useEffect(() => {
    viewRef.current?.dispatch({ effects: wrapComp.current.reconfigure(lineWrap ? EditorView.lineWrapping : []) })
  }, [lineWrap])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu])

  return (
    <div
      className="relative min-h-0 flex-1"
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}
    >
      <div ref={hostRef} className="h-full overflow-hidden [&_.cm-editor]:h-full" />
      <AnimatePresence>{menu && <ContextMenu menu={menu} close={() => setMenu(null)} />}</AnimatePresence>
    </div>
  )
}

/* -------- signature help bar -------- */

function SignatureBar() {
  const signature = useEditorMeta((s) => s.signature)
  const parts = signature ? signature.arglist.split(/\s+/) : []
  const argWords = parts.filter((p) => !p.startsWith('&'))
  return (
    <AnimatePresence>
      {signature && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          className="flex h-[26px] shrink-0 items-center gap-2 overflow-x-auto border-t border-hairline bg-panel px-3 font-mono text-[11.5px]"
        >
          <span className="font-semibold text-lisp-purple">{signature.fn}</span>
          <span className="whitespace-nowrap text-secondary">
            {parts.map((p, i) => {
              const argIdx = parts.slice(0, i + 1).filter((x) => !x.startsWith('&')).length - 1
              const isCurrent = !p.startsWith('&') && argIdx === signature.argIndex - 1 + (argWords.length > 0 ? 1 : 1)
              return (
                <span key={i} className={cn('mr-1.5', p.startsWith('&') ? 'text-muted' : isCurrent ? 'font-bold text-primary' : '')}>
                  {p}
                </span>
              )
            })}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* -------- empty state -------- */

function EmptyEditor() {
  const newBuffer = useWorkspace((s) => s.newBuffer)
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
      <span className="font-mono text-[72px] leading-none text-strong">λ</span>
      <p className="text-[13px] text-secondary">No buffers open</p>
      <button
        className="rounded-md border border-hairline px-4 py-2 text-[13px] text-secondary transition-all duration-150 hover:border-strong hover:bg-raised hover:text-primary"
        onClick={() => newBuffer()}
      >
        New buffer <span className="cc-kbd ml-2">Ctrl N</span>
      </button>
    </div>
  )
}

export default function EditorPanel() {
  const hasBuffers = useWorkspace((s) => s.buffers.length > 0)
  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <TabBar />
      {hasBuffers ? (
        <>
          <EditorSurface />
          <SignatureBar />
        </>
      ) : (
        <EmptyEditor />
      )}
    </div>
  )
}
