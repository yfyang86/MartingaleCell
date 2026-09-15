import { motion } from 'framer-motion'
import { Files, Undo2, DatabaseZap, Link2, Search, ListTree } from 'lucide-react'
import { SectionHeading } from './shared'
import { EASE_OUT } from './motion'

const CARDS = [
  {
    Icon: Files,
    title: 'Buffers & tabs',
    body: 'Each tab is a buffer: scratch buffers you create (Ctrl+N), project files you open from the explorer, and cells you open as buffers. Buffers persist in IndexedDB, so a reload brings every tab back, dirty or not.',
  },
  {
    Icon: Undo2,
    title: 'Undo that stays put',
    body: 'Every buffer keeps its own editor state — document, selection, undo history, scroll position, folds. Switching tabs is never an undo step, and an edit that reached a buffer while it was not shown (a replace, a loaded transcript) becomes one undo step of that buffer.',
  },
  {
    Icon: DatabaseZap,
    title: 'Survives a reload',
    body: 'The per-buffer editor states are saved alongside the buffers. After a reload, Ctrl+Z still undoes the last edit you made before it, the scroll position is where you left it, a folded defun is still folded (Ctrl+Shift+[ folds the outermost form on the line; the palette folds every top-level form or a #| |# comment), and ↑ in the session box recalls what you evaluated there.',
  },
  {
    Icon: Link2,
    title: 'Cells as buffers',
    body: 'Open as buffer turns a session cell into cell-N.lisp, linked both ways: the tab is badged [N], the cell shows ↗ cell-N.lisp, and re-running the cell evaluates the buffer\'s current text — definitions index to the buffer.',
  },
  {
    Icon: Search,
    title: 'Search & replace',
    body: 'Ctrl+Shift+F searches open buffers and project files; Shift+F12 finds references of the symbol at point. Replace rewrites the buffer in the editor as one undoable edit, other open buffers in place, and opens project files as dirty buffers.',
  },
  {
    Icon: ListTree,
    title: 'Outline',
    body: 'Ctrl+Shift+O lists what the buffer, the project and the session box define, ticked when the image has evaluated or loaded it. F12 goes to a definition: the most recent evaluation wins, then the project index, then a text scan.',
  },
]

export default function Editor() {
  return (
    <section id="editor" className="scroll-mt-20">
      <SectionHeading
        title="An editor that keeps its place."
        lead="CodeMirror with a Common Lisp tokenizer, rainbow parens, completion and signature help — and one editor state per buffer, so undo, selection and scroll belong to the buffer, not to the tab bar."
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CARDS.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ delay: 0.08 * i, duration: 0.45, ease: EASE_OUT }}
            className="cc-cell cc-cell-input p-6 transition-all [transition-duration:160ms] ease-snap hover:-translate-y-[3px] hover:border-strong hover:shadow-[0_8px_32px_rgba(110,168,220,0.08)]"
          >
            <card.Icon size={18} strokeWidth={1.75} className="text-steel" />
            <p className="mt-3 text-[14px] font-semibold text-primary">{card.title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">{card.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
