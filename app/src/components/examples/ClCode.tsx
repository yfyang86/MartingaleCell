/* Highlighted Common Lisp code blocks for the Examples gallery. The
 * tokenizer lives in highlight.tsx (helpers only) so this module exports
 * components exclusively — React fast refresh stays intact. */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { tokenize, renderTokens } from './highlight'

/** Static highlighted code block (no line numbers). */
export function ClCode({
  code,
  className,
  maxLines,
}: {
  code: string
  className?: string
  maxLines?: number
}) {
  const lines = useMemo(() => {
    const all = tokenize(code)
    return maxLines ? all.slice(0, maxLines) : all
  }, [code, maxLines])
  return (
    <pre className={cn('font-mono', className)}>
      {lines.map((toks, i) => (
        <div key={i} className="whitespace-pre">
          {renderTokens(toks, String(i))}
          {toks.length === 0 ? ' ' : null}
        </div>
      ))}
    </pre>
  )
}

/** Highlighted code block with line numbers + horizontal scroll. */
export function ClCodeBlock({
  code,
  className,
}: {
  code: string
  className?: string
}) {
  const lines = useMemo(() => tokenize(code), [code])
  return (
    <pre className={cn('font-mono', className)}>
      {lines.map((toks, i) => (
        <div key={i} className="flex whitespace-pre">
          <span
            aria-hidden
            className="w-8 shrink-0 select-none pr-4 text-right text-muted"
          >
            {i + 1}
          </span>
          <span>{renderTokens(toks, String(i))}</span>
        </div>
      ))}
    </pre>
  )
}
