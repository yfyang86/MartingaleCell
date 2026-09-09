import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { SectionHeading } from './shared'
import { EASE_OUT } from './motion'

interface Shortcut {
  keys: string[]
  action: string
}

const GROUPS: { name: string; shortcuts: Shortcut[] }[] = [
  {
    name: 'Evaluate',
    shortcuts: [
      { keys: ['Ctrl', 'Enter'], action: 'Evaluate top-level form at point' },
      { keys: ['Ctrl', 'Shift', 'Enter'], action: 'Evaluate all top-level forms' },
      { keys: ['Ctrl', '.'], action: 'Interrupt evaluation' },
    ],
  },
  {
    name: 'Buffers',
    shortcuts: [
      { keys: ['Ctrl', 'N'], action: 'New buffer' },
      { keys: ['Ctrl', 'S'], action: 'Save buffers (project files are written to disk / virtual FS)' },
    ],
  },
  {
    name: 'Project',
    shortcuts: [
      { keys: ['Ctrl', 'B'], action: 'Toggle project explorer' },
      { keys: ['Ctrl', 'Shift', 'F'], action: 'Search the workspace (open buffers + project files); Enter jumps to the first hit' },
    ],
  },
  {
    name: 'Session',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'L'], action: 'Clear session cells' },
      { keys: ['0', '–', '9'], action: 'Choose a restart while a cell is paused in the debugger' },
      { keys: ['Ctrl', 'D'], action: 'End of file for a cell waiting on standard input' },
    ],
  },
  {
    name: 'Editor',
    shortcuts: [
      { keys: ['Tab'], action: 'Complete symbol at point' },
      { keys: ['Ctrl', 'Space'], action: 'Autocomplete / symbol documentation' },
      { keys: ['Ctrl', 'Shift', '↑'], action: 'Select enclosing s-expression (repeat to grow)' },
      { keys: ['F12'], action: 'Go to definition of the symbol at point (Ctrl+click too)' },
      { keys: ['Alt', '↑ / ↓'], action: 'Move between top-level forms' },
    ],
  },
  {
    name: 'General',
    shortcuts: [
      { keys: ['Ctrl', 'K'], action: 'Command palette' },
      { keys: ['Ctrl', '/'], action: 'Shortcuts reference' },
      { keys: ['Esc'], action: 'Dismiss palette, modals, and transient UI' },
    ],
  },
]

function Kbd({ label }: { label: string }) {
  return (
    <kbd className="cc-kbd inline-block transition-all duration-150 ease-snap hover:translate-y-px hover:shadow-none">
      {label}
    </kbd>
  )
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {keys.map((k, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-[11px] text-muted">+</span>}
          <Kbd label={k} />
        </span>
      ))}
    </span>
  )
}

export default function Shortcuts() {
  const [raw, setRaw] = useState('')
  const [query, setQuery] = useState('')

  /* 150ms debounce */
  useEffect(() => {
    const t = setTimeout(() => setQuery(raw.trim().toLowerCase()), 150)
    return () => clearTimeout(t)
  }, [raw])

  const filtered = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        shortcuts: query
          ? g.shortcuts.filter(
              (s) =>
                s.action.toLowerCase().includes(query) ||
                s.keys.join(' ').toLowerCase().includes(query)
            )
          : g.shortcuts,
      })).filter((g) => g.shortcuts.length > 0),
    [query]
  )

  return (
    <section id="shortcuts" className="scroll-mt-20">
      <SectionHeading
        title="Keep your hands on the home row."
        lead="Every primary action has a binding. Ctrl is ⌘ Cmd on macOS — the IDE shows the right one for your platform."
      />

      {/* Filter input */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.8 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="relative mt-8 max-w-sm"
      >
        <Search
          size={14}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Filter shortcuts…"
          className="w-full rounded-md border border-hairline bg-inset py-2 pl-9 pr-3 text-[13px] text-primary placeholder:text-muted focus:border-strong focus:outline-none"
        />
      </motion.div>

      <div className="mt-6 overflow-hidden rounded-lg border border-hairline">
        <table className="w-full border-collapse text-left">
          <tbody>
            {filtered.map((group) => (
              <ShortcutGroupRows key={group.name} group={group} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-[13px] text-muted">
                  No shortcuts match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ShortcutGroupRows({
  group,
}: {
  group: { name: string; shortcuts: Shortcut[] }
}) {
  return (
    <>
      <tr className="border-b border-hairline bg-panel">
        <td
          colSpan={2}
          className="px-4 py-2 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
        >
          {group.name}
        </td>
      </tr>
      {group.shortcuts.map((s, i) => (
        <motion.tr
          key={s.action}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ delay: (i % 4) * 0.03, duration: 0.3 }}
          className="border-b border-hairline transition-colors duration-150 ease-snap last:border-b-0 hover:bg-raised"
        >
          <td className="w-[42%] px-4 py-2.5">
            <Keys keys={s.keys} />
          </td>
          <td className="px-4 py-2.5 text-[13px] text-secondary">{s.action}</td>
        </motion.tr>
      ))}
    </>
  )
}
