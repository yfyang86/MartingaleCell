import { motion } from 'framer-motion'
import { FolderOpen, FileUp, PackageOpen, FileCode2, AlertTriangle, Search } from 'lucide-react'
import { SectionHeading } from './shared'
import { EASE_OUT } from './motion'

const CARDS = [
  {
    Icon: FolderOpen,
    title: 'A project is a folder',
    body: 'Open any local folder with the File System Access API (Chrome/Edge) — ConsCell remembers the handle and offers to reopen it next visit. Firefox/Safari get a virtual project instead: import a ZIP or upload a folder, edit in memory, and Export ZIP to save.',
  },
  {
    Icon: FileCode2,
    title: 'Open & save files',
    body: 'Click a file in the explorer and it opens as an editor tab with a dirty dot. Ctrl+S writes it back — createWritable() on real folders, the virtual FS otherwise. New files are created on disk immediately.',
  },
  {
    Icon: PackageOpen,
    title: 'Load the whole project',
    body: '"Load Project into Runtime" ships every .lisp/.lsp/.cl/.asd file to the worker and loads them recursively. If an .asd exists, its system is loaded via asdf:load-source-op — ECL\'s C-compile path can\'t exist in WASM, so sources load uncompiled. Without an .asd, files load manually: package definitions first, then alphabetical; every file is guarded, so one bad file never aborts the batch.',
  },
  {
    Icon: Search,
    title: 'Search & go to definition',
    body: 'Ctrl+Shift+F searches open buffers and every Lisp file of the project — match case, whole symbol, regex, and a code-only mode that skips strings and comments. Results are grouped by file; a click opens the file at the line. A Replace box rewrites the hits: the buffer in the editor through one undoable edit, other open buffers in place, and project files that are not open get opened as dirty buffers — nothing reaches disk until Ctrl+S or the "Save N files" action on the summary. Undo history is kept per buffer: switching buffers is never an undo step.',
  },
  {
    Icon: FileUp,
    title: 'Try it: cl-plot (MIT)',
    body: 'The bundled sample opens Martin Kersner\'s cl-plot as a virtual project. Load it, and CL-PLOT\'s symbols flow straight into autocomplete — (make-instance \'cl-plot:figure) just works.',
  },
]

export default function Projects() {
  return (
    <section id="projects" className="scroll-mt-20">
      <SectionHeading
        title="Projects, not just snippets."
        lead="Point ConsCell at a real folder of Common Lisp and treat the browser like a local IDE: browse, edit, save, then load the entire tree into the runtime and call it."
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {CARDS.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ delay: 0.1 * i, duration: 0.45, ease: EASE_OUT }}
            className="cc-cell cc-cell-input p-6 transition-all [transition-duration:160ms] ease-snap hover:-translate-y-[3px] hover:border-strong hover:shadow-[0_8px_32px_rgba(110,168,220,0.08)]"
          >
            <card.Icon size={18} strokeWidth={1.75} className="text-steel" />
            <p className="mt-3 text-[14px] font-semibold text-primary">{card.title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">{card.body}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ delay: 0.2, duration: 0.45, ease: EASE_OUT }}
        className="mt-4 flex gap-3 rounded-lg border border-warning/25 bg-warning/[0.06] p-5"
      >
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
        <p className="text-[13px] leading-relaxed text-secondary">
          <span className="font-semibold text-primary">gnuplot, emulated:</span> cl-plot builds a
          gnuplot script and shells out to the <code className="font-mono text-[12px]">gnuplot</code> binary —{' '}
          impossible inside WebAssembly. ConsCell intercepts that hand-off in the worker, ships the
          script and its data files to the page, and renders a gnuplot-subset as dark-themed{' '}
          <span className="font-semibold text-primary">SVG right inside the session cell</span> that
          triggered it. Every plot carries Download SVG / Download PNG buttons (PNG is rasterized
          via canvas at 2×), and <code className="font-mono text-[12px]">(save fig &quot;name.png&quot; …)</code>{' '}
          auto-downloads the PNG — no binary required. Other subprocesses still surface as a clean{' '}
          <code className="font-mono text-[12px]">;;ERROR:</code>, never a hung debugger.
        </p>
      </motion.div>
    </section>
  )
}
