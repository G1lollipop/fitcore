'use client'

import { Clock, History } from 'lucide-react'
import { useT } from '@/lib/i18n/provider'

interface KnowledgeHistoryProps {
  history: string[]
  onPick: (query: string) => void
  onClear: () => void
}

/** Recent-search list rendered in the empty state. Hidden when empty. */
export function KnowledgeHistory({ history, onPick, onClear }: KnowledgeHistoryProps) {
  const t = useT()
  if (history.length === 0) return null

  return (
    <section className="glass rounded-2xl p-5 sm:p-6">
      <header className="mb-3 flex items-center gap-2">
        <History size={15} className="text-primary" aria-hidden />
        <h3 className="font-display text-base font-semibold text-foreground">
          {t.knowledge.history.title}
        </h3>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {t.knowledge.history.clear}
        </button>
      </header>

      <ul className="flex flex-wrap gap-2">
        {history.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Clock size={12} className="shrink-0" aria-hidden />
              <span className="truncate">{q}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
