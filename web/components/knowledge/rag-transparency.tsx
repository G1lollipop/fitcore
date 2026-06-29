'use client'

import { useState } from 'react'
import { ChevronDown, Cpu } from 'lucide-react'
import type { KnowledgeRetrievalMeta, VectorRetrievalBackend } from '@/lib/ai/types'
import { useT } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'

interface RagTransparencyProps {
  meta: KnowledgeRetrievalMeta | null
  backend: VectorRetrievalBackend | null
}

/**
 * Collapsible panel exposing the RAG retrieval internals (vector store, top-K,
 * reranking, abstention, top score). The "explainability" angle that sets the
 * Knowledge Hub apart from a plain chatbot.
 */
export function RagTransparency({ meta, backend }: RagTransparencyProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  if (!meta) return null

  const tx = t.knowledge.transparency
  const yesNo = (v: boolean | undefined) => (v ? tx.yes : tx.no)

  const rows: { label: string; value: string }[] = [
    { label: tx.backend, value: backend ?? '—' },
    {
      label: tx.k,
      value:
        meta.k != null
          ? `${meta.k} (${meta.kAuto ? tx.kAuto : tx.kManual})`
          : '—',
    },
    { label: tx.chunks, value: meta.retrievedCount != null ? String(meta.retrievedCount) : '—' },
    { label: tx.reranked, value: yesNo(meta.reranked) },
    { label: tx.abstained, value: yesNo(meta.abstained) },
    {
      label: tx.topScore,
      value: typeof meta.topScore === 'number' ? meta.topScore.toFixed(3) : '—',
    },
  ]

  return (
    <div className="glass rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-secondary/40"
      >
        <Cpu size={15} className="text-primary" aria-hidden />
        <span className="text-[13px] font-medium text-foreground">{tx.title}</span>
        {meta.abstained && (
          <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            {tx.abstained}
          </span>
        )}
        <ChevronDown
          size={16}
          className={cn(
            'ml-auto shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 pb-4 sm:grid-cols-3">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
              <dd className="text-[13px] font-medium tabular-nums text-foreground">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
