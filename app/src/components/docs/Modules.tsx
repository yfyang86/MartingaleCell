import { motion } from 'framer-motion'
import { Package, Layers, FileCode2, Sparkles, AlertTriangle } from 'lucide-react'
import { SectionHeading } from './shared'
import { EASE_OUT } from './motion'
import { CodeBlock } from './cl-highlight'

const CARDS = [
  {
    Icon: Package,
    title: 'A module is a package',
    body: 'Wrap your code in defpackage + in-package and export exactly the symbols that make up your API. Everything else stays internal — callers see my-module:entry points, not your helpers.',
  },
  {
    Icon: Layers,
    title: 'An .asd declares the parts',
    body: 'An asdf:defsystem lists your source files as :components. With :serial t each file sees the definitions of the ones before it, so load order is declared once instead of reproduced by hand.',
  },
  {
    Icon: FileCode2,
    title: 'init.lisp is the entry point',
    body: 'When a project is loaded, .asd components come first and remaining files — entry files like init.lisp — are loaded last, alphabetically. That makes init.lisp the perfect place to register the system and load it: exactly how the bundled cl-plot sample is wired.',
  },
  {
    Icon: Sparkles,
    title: 'Loaded = autocomplete-ready',
    body: 'After "Load Project into Runtime", every external symbol of your package flows into autocomplete. Type my-module: and your exported API is suggested, inspected, and callable from any session cell.',
  },
]

const ASD_CODE = `;;;; my-module.asd — package + system, one file
(defpackage #:my-module
  (:use :cl)
  (:export #:greet #:make-counter #:counter-next))

(in-package :my-module)

(asdf:defsystem my-module
  :name "my-module"
  :version "0.1"
  :serial t
  :components ((:file "utils")
               (:file "counter")))`

const UTILS_CODE = `;;;; utils.lisp — internal helpers, not exported
(in-package :my-module)

(defun greeting-word (name)
  (format nil "Hello, ~A!" name))`

const COUNTER_CODE = `;;;; counter.lisp — the exported API
(in-package :my-module)

(defstruct counter start step)

(defun make-counter (&key (start 0) (step 1))
  "A closure-free counter you can share across cells."
  (cons start step))

(defun counter-next (c)
  (incf (car c) (cdr c)))

(defun greet (name)
  (greeting-word name))`

const INIT_CODE = `;;;; init.lisp — entry file, loaded LAST by the project loader
(push (namestring (ext:cd)) asdf:*central-registry*)
(asdf:load-system :my-module)

;; the package is live — prove it from the entry file
(my-module:greet "module")`

const USE_CODE = `;; after "Load Project into Runtime":
CL-USER> (defvar *c* (my-module:make-counter :start 10 :step 5))
CL-USER> (my-module:counter-next *c*)  ; ⇒ 15
CL-USER> (my-module:greet "world")     ; ⇒ "Hello, world!"`

const STEPS = [
  {
    title: 'Lay out the folder',
    body: 'One file per concern, plus my-module.asd and init.lisp at the root. Without an .asd the loader still works — package definitions first, then the rest alphabetically — but an explicit system is what makes the module reusable and order-safe.',
  },
  {
    title: 'Declare the system in the .asd',
    body: 'defpackage with your :export list, then asdf:defsystem with :serial t and the component files in dependency order. The loader parses this file and loads the components exactly as declared.',
  },
  {
    title: 'Write init.lisp as the doorway',
    body: 'init.lisp runs after every component: push the project directory onto asdf:*central-registry*, asdf:load-system your system, and optionally exercise the API. This is the same shape as the bundled cl-plot sample.',
  },
  {
    title: 'Load and use it anywhere',
    body: 'Hit "Load Project into Runtime". The load cell reports each file; exported symbols land in autocomplete and stay available for the rest of the session — across every cell and buffer.',
  },
]

export default function Modules() {
  return (
    <section id="modules" className="scroll-mt-20">
      <SectionHeading
        title="Reusable modules, not one-off cells."
        lead="Grow snippets into libraries: a package, an asdf system that declares its parts, and an init.lisp entry file that loads it all — the same layout the bundled cl-plot sample ships with."
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
        transition={{ delay: 0.15, duration: 0.45, ease: EASE_OUT }}
        className="mt-4 rounded-lg border border-hairline bg-inset p-5"
      >
        <p className="text-[13px] font-semibold text-primary">Package management, in Lisp</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">
          Once a project is loaded, promote it to a reusable module — files are copied to{' '}
          <code className="font-mono text-[12px]">/modules/&lt;name&gt;/</code> (name taken from the{' '}
          <code className="font-mono text-[12px]">.asd</code> defsystem) and loaded from there:
        </p>
        <div className="mt-3">
          <CodeBlock
            code={`(package-install "cl-plot")     ; /project -> /modules/cl-plot, then load it\n(package-list)                  ; name - version - files - description\n(package-load "cl-plot")        ; load an installed module (e.g. after a reload)\n(package-uninstall "cl-plot")   ; removes files + registry entry`}
          />
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          The module tree is snapshotted to IndexedDB after every install/uninstall and restored
          on the next boot, so <code className="font-mono text-[12px]">package-list</code> survives a
          reload. Definitions are not auto-loaded into the fresh image — evaluate{' '}
          <code className="font-mono text-[12px]">(package-load "name")</code> to load them from the
          restored files, and note that uninstalling removes files while already-loaded
          definitions honestly stay until the runtime restarts (Common Lisp has no unload).
        </p>
      </motion.div>

      <div className="mt-12 space-y-8">
        {STEPS.map((step, i) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ delay: 0.1 * i, duration: 0.45, ease: EASE_OUT }}
            className="space-y-3"
          >
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[12px] text-steel-bright">0{i + 1}</span>
              <p className="text-[14px] font-semibold text-primary">{step.title}</p>
            </div>
            <p className="max-w-2xl text-[13px] leading-relaxed text-secondary">{step.body}</p>
            {i === 0 && (
              <CodeBlock
                code={`my-module/\n├── my-module.asd   ; package + system definition\n├── utils.lisp      ; internal helpers\n├── counter.lisp    ; exported API\n└── init.lisp       ; entry point, loaded last`}
              />
            )}
            {i === 1 && <CodeBlock code={ASD_CODE} />}
            {i === 2 && (
              <div className="grid gap-3 lg:grid-cols-2">
                <CodeBlock code={UTILS_CODE} />
                <CodeBlock code={COUNTER_CODE} />
              </div>
            )}
            {i === 2 && <CodeBlock code={INIT_CODE} />}
            {i === 3 && <CodeBlock code={USE_CODE} />}
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
          <span className="font-semibold text-primary">Sources load uncompiled:</span> the runtime
          loads modules via <code className="font-mono text-[12px]">asdf:load-source-op</code> —
          ECL&apos;s C-compile path can&apos;t exist inside WebAssembly, so{' '}
          <code className="font-mono text-[12px]">eval-when</code> subtleties that only show up at{' '}
          <code className="font-mono text-[12px]">compile-time</code> won&apos;t bite, but neither
          will compile-time macros run ahead of time. Every file is guarded: one bad file logs a{' '}
          <code className="font-mono text-[12px]">✗</code> in the load cell and the rest of the
          module still loads.
        </p>
      </motion.div>
    </section>
  )
}
