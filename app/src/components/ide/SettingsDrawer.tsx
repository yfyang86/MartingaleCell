/* Settings drawer (right, 340px): editor, evaluation, runtime, workspace. */

import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n/context'
import { useWorkspace } from '@/store/workspace'
import { useUi } from '@/store/ui'
import { runtime, getSbclMemory, setSbclMemory } from '@/lisp/runtime'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-hairline px-5 py-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-secondary">{label}</span>
      {children}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={cn('relative h-5 w-9 rounded-full transition-colors duration-150', value ? 'bg-steel' : 'bg-strong')}
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
    >
      <motion.span
        className="absolute top-0.5 h-4 w-4 rounded-full bg-primary"
        animate={{ left: value ? 18 : 2 }}
        transition={{ duration: 0.15, ease: [0.2, 0.7, 0.3, 1] }}
      />
    </button>
  )
}

function Slider({ value, min, max, step, onChange, format }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-28 cursor-pointer appearance-none rounded-full bg-strong accent-steel"
      />
      <span className="w-10 text-right font-mono text-[11.5px] text-secondary">{format ? format(value) : value}</span>
    </div>
  )
}

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-hairline">
      {options.map((o) => (
        <button
          key={String(o)}
          className={cn(
            'px-2.5 py-1 font-mono text-[11px] transition-colors duration-100',
            o === value ? 'bg-steel-dim text-steel-bright' : 'text-muted hover:text-secondary',
          )}
          onClick={() => onChange(o)}
        >
          {String(o)}
        </button>
      ))}
    </div>
  )
}

export default function SettingsDrawer() {
  const open = useUi((s) => s.settingsOpen)
  const setOpen = useUi((s) => s.setSettingsOpen)
  const settings = useWorkspace((s) => s.settings)
  const setSettings = useWorkspace((s) => s.setSettings)
  const setConfirm = useUi((s) => s.setConfirm)
  const engineLabel = useWorkspace((s) => s.engineLabel)
  const engineStatus = useWorkspace((s) => s.engineStatus)
  const { t } = useI18n()

  const exportWorkspace = () => {
    const s = useWorkspace.getState()
    const blob = new Blob([JSON.stringify({ buffers: s.buffers, cells: s.cells, settings: s.settings }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'martingalecell-workspace.json'; a.click()
    URL.revokeObjectURL(url)
    toast(t('Workspace exported'))
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-[rgba(4,5,9,.7)] backdrop-blur-[6px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
          />
          <motion.aside
            className="fixed inset-y-0 right-0 z-50 flex w-[340px] max-w-[92vw] flex-col border-l border-hairline bg-panel"
            initial={{ x: 340 }} animate={{ x: 0 }} exit={{ x: 340 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-hairline px-5">
              <span className="text-[13px] font-semibold">{t('Settings')}</span>
              <button className="flex h-7 w-7 items-center justify-center rounded-md text-secondary hover:bg-raised hover:text-primary" onClick={() => setOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              <Section title={t('Editor')}>
                <Row label={t('Font size')}>
                  <Slider value={settings.fontSize} min={12} max={18} step={0.5} onChange={(v) => setSettings({ fontSize: v })} />
                </Row>
                <div className="rounded-md bg-inset px-3 py-2 font-mono text-muted" style={{ fontSize: settings.fontSize }}>
                  ;; (preview) (lambda (x) (* x x))
                </div>
                <Row label={t('Tab width')}>
                  <Segmented value={settings.tabWidth} options={[2, 4] as (2 | 4)[]} onChange={(v) => setSettings({ tabWidth: v })} />
                </Row>
                <Row label={t('Rainbow parens')}>
                  <Toggle value={settings.rainbowParens} onChange={(v) => setSettings({ rainbowParens: v })} />
                </Row>
                <Row label={t('Ligatures')}>
                  <Toggle value={settings.ligatures} onChange={(v) => setSettings({ ligatures: v })} />
                </Row>
                <Row label={t('Line wrap')}>
                  <Toggle value={settings.lineWrap} onChange={(v) => setSettings({ lineWrap: v })} />
                </Row>
              </Section>
              <Section title={t('Evaluation')}>
                <Row label={t('Default mode')}>
                  <Segmented value={settings.evalMode} options={['eval', 'compile']} onChange={(v) => setSettings({ evalMode: v })} />
                </Row>
                <Row label={t('Auto-eval on save')}>
                  <Toggle value={settings.autoEvalOnSave} onChange={(v) => setSettings({ autoEvalOnSave: v })} />
                </Row>
                <Row label={t('Pause in debugger on error')}>
                  <Toggle value={settings.debugOnError} onChange={(v) => setSettings({ debugOnError: v })} />
                </Row>
                <Row label={t('Print length')}>
                  <Slider
                    value={settings.printLength} min={0} max={1000} step={10}
                    format={(v) => (v === 0 ? 'nil' : String(v))}
                    onChange={(v) => setSettings({ printLength: v })}
                  />
                </Row>
                <Row label={t('Transcript value limit')}>
                  <Slider
                    value={settings.transcriptValueLimit ?? 0} min={0} max={2000} step={100}
                    format={(v) => (v === 0 ? 'whole' : `${v} chars`)}
                    onChange={(v) => setSettings({ transcriptValueLimit: v })}
                  />
                </Row>
                <p className="text-[11px] leading-snug text-muted">
                  {t('compile: each form goes through the bytecodes compiler first. Print length sets')} <code className="font-mono">*print-length*</code> {t('in the image (nil = unlimited). The transcript value limit clips long values in exported transcripts (whole = as printed).')}
                </p>
              </Section>
              <Section title={t('Runtime')}>
                <div className="rounded-md border border-hairline bg-inset px-3 py-2 font-mono text-[11.5px] text-secondary">
                  <div className="flex justify-between"><span className="text-muted">engine</span><span>{engineLabel || engineStatus}</span></div>
                  <div className="flex justify-between"><span className="text-muted">status</span><span>{engineStatus}</span></div>
                  <div className="flex justify-between"><span className="text-muted">source</span><span>{runtime.engine === 'ecl' ? '/wecl/ (self-hosted)' : runtime.engine === 'sbcl' ? '/sbcl/ (self-hosted)' : runtime.engine === 'jscl' ? 'CDN fallback' : 'built-in'}</span></div>
                </div>
                <Row label={t('Lisp implementation')}>
                  <Segmented
                    value={settings.engine}
                    options={['auto', 'ecl', 'sbcl']}
                    onChange={(v) => {
                      if (v === settings.engine) return
                      setSettings({ engine: v })
                      toast(
                        v === 'sbcl' ? t('SBCL/wasm boots on the next restart (ECL if its artifacts are missing)')
                          : v === 'ecl' ? t('ECL boots on the next restart — no fallback to another engine')
                            : t('Automatic: SBCL, then ECL, then JSCL, then the demo interpreter'),
                        { action: { label: t('Restart now'), onClick: () => useUi.getState().setConfirm('restart') } },
                      )
                    }}
                  />
                </Row>
                <p className="mt-1 font-mono text-[10.5px] text-muted">
                  {t('auto: SBCL, then ECL, then JSCL, then the demo · ecl: ECL only · sbcl: SBCL/wasm, ECL if it cannot boot. Takes effect on Restart Lisp image.')}
                </p>
                <Row label={t('SBCL memory')}>
                  <Segmented<'off' | '512' | '768'>
                    value={String(getSbclMemory()) as 'off' | '512' | '768'}
                    options={['512', '768', 'off']}
                    onChange={(v) => {
                      setSbclMemory(v === 'off' ? 'off' : (Number(v) as 512 | 768))
                      toast(v === 'off'
                        ? t('SBCL memory uncapped — applies on the next SBCL boot')
                        : `SBCL capped at ${v} MB of linear memory — applies on the next SBCL boot`, {
                        action: { label: t('Restart now'), onClick: () => useUi.getState().setConfirm('restart') },
                      })
                    }}
                  />
                </Row>
                <p className="mt-1 font-mono text-[10.5px] text-muted">
                  {t('A total linear-memory ceiling for the SBCL engine (off by default). The image is ~230 MB at rest; cap it to keep embedded preview panes from being OOM-killed. Hitting the cap crashes the image with a clear message (raise it or switch to ECL).')}
                </p>
                <Row label={t('Log verbosity')}>
                  <Segmented value={settings.verbosity} options={['quiet', 'normal', 'verbose']} onChange={(v) => setSettings({ verbosity: v })} />
                </Row>
                <p className="text-[11px] leading-snug text-muted">
                  {t('quiet: boot lines at DEBUG · normal: INFO · verbose: also engine stderr noise. Heap size is fixed by the WECL build (memory grows on demand).')}
                </p>
              </Section>
              <Section title={t('Workspace')}>
                <Row label={t('Autosave')}>
                  <Toggle value={settings.autosave} onChange={(v) => setSettings({ autosave: v })} />
                </Row>
                <button
                  className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] text-secondary transition-all duration-150 hover:border-strong hover:bg-raised hover:text-primary"
                  onClick={exportWorkspace}
                >
                  {t('Export workspace (.json)')}
                </button>
                <button
                  className="w-full rounded-md border border-error/40 px-3 py-2 text-[12.5px] text-error transition-all duration-150 hover:bg-error/10"
                  onClick={() => { setOpen(false); setConfirm('reset-workspace') }}
                >
                  {t('Reset workspace')}
                </button>
              </Section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
