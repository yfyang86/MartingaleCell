/* Log / debug panel: LOG / TRACE / WARNINGS tabs, level filter chips, text
 * filter, autoscroll, timestamps, export, clear, WASM heap gauge. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Magnet, Clock, Download, Trash2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspace, type LogEntry } from '@/store/workspace'
import type { LogLevel } from '@/lisp/types'
import { copyText, gotoLocation } from './actions'

type Tab = 'log' | 'trace' | 'warnings'
const LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR']

const LEVEL_STYLE: Record<LogLevel, string> = {
  DEBUG: 'text-muted bg-muted/10',
  INFO: 'text-info bg-info/10',
  WARN: 'text-warning bg-warning/10',
  ERROR: 'text-error bg-error/10',
}

function fmtTs(ts: number): string {
  const d = new Date(ts)
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

function MemoryGauge() {
  const [heap, setHeap] = useState<{ used: number; total: number } | null>(null)
  useEffect(() => {
    const perf = performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }
    if (!perf.memory) return
    const tick = () => setHeap({ used: perf.memory!.usedJSHeapSize, total: perf.memory!.jsHeapSizeLimit })
    tick()
    const t = setInterval(tick, 2000)
    return () => clearInterval(t)
  }, [])
  if (!heap) return null
  const usedMb = heap.used / 1048576
  const totalMb = heap.total / 1048576
  const pct = Math.min(1, heap.used / heap.total)
  return (
    <div
      className="flex items-center gap-1.5"
      title={`WASM heap ${usedMb.toFixed(0)} / ${totalMb.toFixed(0)} MB · GC pressure ${pct < 0.75 ? 'low' : pct < 0.9 ? 'moderate' : 'high'}`}
    >
      <span className="font-mono text-[10.5px] text-muted">{usedMb.toFixed(0)} MB</span>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-inset">
        <span
          className={cn('block h-full rounded-full transition-[width] duration-200', pct > 0.9 ? 'bg-error' : pct > 0.75 ? 'bg-warning' : 'bg-steel')}
          style={{ width: `${pct * 100}%` }}
        />
      </span>
    </div>
  )
}

function LogRow({ entry, showTs }: { entry: LogEntry; showTs: boolean }) {
  const [open, setOpen] = useState(false)
  const gotoCell = () => {
    if (entry.cellRef != null) window.dispatchEvent(new CustomEvent('martingalecell:goto-cell', { detail: entry.cellRef }))
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      className="border-b border-hairline/40 px-3 py-1"
    >
      <div className="flex items-baseline gap-2 font-mono text-[11.5px]">
        {entry.details && (
          <button className="self-center text-muted hover:text-primary" onClick={() => setOpen((o) => !o)}>
            <ChevronRight size={11} className={cn('transition-transform duration-150', open && 'rotate-90')} />
          </button>
        )}
        {showTs && <span className="shrink-0 text-muted/70">{fmtTs(entry.ts)}</span>}
        <span className={cn('shrink-0 rounded-sm px-1 py-px text-[9px] font-semibold uppercase tracking-wide', LEVEL_STYLE[entry.level])}>
          {entry.level}
        </span>
        <span className="shrink-0 text-[10px] text-muted">{entry.source}</span>
        <span className="min-w-0 flex-1 break-words text-secondary">
          {entry.trace
            ? <>eval · {entry.trace.forms} · {entry.trace.ms.toFixed(1)}ms{entry.trace.ms > 50 && <span className="ml-2 rounded-sm bg-warning/10 px-1 py-px text-[9px] text-warning">slow</span>}</>
            : entry.message}
        </span>
        {entry.location && (
          <button
            className="shrink-0 rounded-full border border-hairline px-1.5 text-[10px] text-steel hover:border-strong hover:text-steel-bright"
            title={`Open ${entry.location.path} at line ${entry.location.line}`}
            onClick={() => gotoLocation(entry.location!.path, entry.location!.line, entry.location!.col)}
          >
            {entry.location.path.split('/').pop()}:{entry.location.line}
          </button>
        )}
        {entry.cellRef != null && (
          <button className="shrink-0 text-[10px] text-steel hover:text-steel-bright" onClick={gotoCell}>
            cell [{entry.cellRef}]
          </button>
        )}
      </div>
      <AnimatePresence>
        {open && entry.details && (
          <motion.pre
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="mt-1 overflow-hidden whitespace-pre-wrap break-words rounded-md bg-inset px-2 py-1.5 font-mono text-[11px] text-muted"
          >
            {entry.details}
          </motion.pre>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function LogPanel() {
  const logs = useWorkspace((s) => s.logs)
  const clearLogs = useWorkspace((s) => s.clearLogs)
  const [tab, setTab] = useState<Tab>('log')
  const [levels, setLevels] = useState<Set<LogLevel>>(new Set(LEVELS))
  const [filter, setFilter] = useState('')
  const [filterInput, setFilterInput] = useState('')
  const [autoscroll, setAutoscroll] = useState(true)
  const [showTs, setShowTs] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  // debounce text filter
  useEffect(() => {
    const t = setTimeout(() => setFilter(filterInput), 150)
    return () => clearTimeout(t)
  }, [filterInput])

  const traceLogs = useMemo(() => logs.filter((l) => l.trace), [logs])
  const warnLogs = useMemo(() => logs.filter((l) => l.level === 'WARN' || l.level === 'ERROR'), [logs])
  const tabLogs = tab === 'log' ? logs : tab === 'trace' ? traceLogs : warnLogs
  const visible = useMemo(() => tabLogs.filter((l) => {
    if (tab === 'log' && !levels.has(l.level)) return false
    if (filter && !l.message.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  }), [tabLogs, levels, filter, tab])

  useEffect(() => {
    if (autoscroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [visible.length, autoscroll])

  const toggleLevel = (lv: LogLevel) => {
    setLevels((prev) => {
      const next = new Set(prev)
      if (next.has(lv)) next.delete(lv); else next.add(lv)
      return next
    })
  }

  const exportLog = () => {
    const text = logs
      .map((l) => `${fmtTs(l.ts)}  ${l.level.padEnd(5)}  ${l.source.padEnd(8)}  ${l.message}${l.details ? '\n' + l.details : ''}`)
      .join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'martingalecell-log.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel">
      <header className="flex h-8 shrink-0 items-center gap-1 border-b border-hairline px-3">
        {(['log', 'trace', 'warnings'] as Tab[]).map((t) => {
          const count = t === 'log' ? logs.length : t === 'trace' ? traceLogs.length : warnLogs.length
          return (
            <button
              key={t}
              className={cn(
                'relative flex h-8 items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors duration-100',
                tab === t ? 'text-primary' : 'text-muted hover:text-secondary',
              )}
              onClick={() => setTab(t)}
            >
              {t}
              <motion.span
                key={count}
                initial={{ scale: 1.25 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  'rounded-full px-1.5 font-mono text-[10px] font-normal',
                  t === 'warnings' && count > 0 ? 'bg-warning/10 text-warning' : 'bg-raised text-muted',
                )}
              >
                {count}
              </motion.span>
              {tab === t && <motion.span layoutId="log-tab-bar" className="absolute inset-x-1 bottom-0 h-[2px] bg-steel" transition={{ duration: 0.15 }} />}
            </button>
          )
        })}
        <div className="mx-1 h-4 w-px bg-hairline" />
        {tab === 'log' && (
          <div className="flex items-center gap-1">
            {LEVELS.map((lv) => (
              <button
                key={lv}
                className={cn(
                  'rounded-full border px-1.5 py-px font-mono text-[10px] transition-all duration-150',
                  levels.has(lv) ? 'border-steel/40 bg-steel-dim text-steel-bright' : 'border-hairline text-muted hover:text-secondary',
                )}
                onClick={() => toggleLevel(lv)}
              >
                {lv}
              </button>
            ))}
          </div>
        )}
        <div className="relative ml-auto hidden items-center md:flex">
          <Search size={11} className="absolute left-2 text-muted" />
          <input
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            placeholder="filter"
            className="h-6 w-32 rounded-md border border-hairline bg-inset pl-6 pr-2 text-[12px] text-primary placeholder:text-muted focus:border-steel/50 focus:outline-none"
          />
        </div>
        <button
          className={cn('flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-100 hover:bg-raised', autoscroll ? 'text-steel' : 'text-secondary hover:text-primary')}
          title="Autoscroll" onClick={() => setAutoscroll((v) => !v)}
        >
          <Magnet size={13} />
        </button>
        <button
          className={cn('flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-100 hover:bg-raised', showTs ? 'text-steel' : 'text-secondary hover:text-primary')}
          title="Timestamps" onClick={() => setShowTs((v) => !v)}
        >
          <Clock size={13} />
        </button>
        <button className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors duration-100 hover:bg-raised hover:text-primary" title="Copy log" onClick={() => void copyText(logs.map((l) => `${fmtTs(l.ts)} ${l.level} ${l.source} ${l.message}`).join('\n'), 'Log copied')}>
          <Download size={13} className="hidden" />
          <span className="font-mono text-[10px]">copy</span>
        </button>
        <button className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors duration-100 hover:bg-raised hover:text-primary" title="Export .log" onClick={exportLog}>
          <Download size={13} />
        </button>
        <button className="flex h-7 w-7 items-center justify-center rounded-md text-secondary transition-colors duration-100 hover:bg-raised hover:text-error" title="Clear log" onClick={clearLogs}>
          <Trash2 size={13} />
        </button>
        <MemoryGauge />
      </header>

      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-1">
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-[11.5px] text-muted">
            {filter ? 'no rows match the filter' : 'quiet so far…'}
          </div>
        ) : (
          visible.map((l) => <LogRow key={l.id} entry={l} showTs={showTs} />)
        )}
      </div>
    </section>
  )
}
