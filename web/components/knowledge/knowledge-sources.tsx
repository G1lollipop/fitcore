'use client'

import { BookText, ExternalLink } from 'lucide-react'
import type { Citation } from '@/lib/ai/types'
import { useT } from '@/lib/i18n/provider'
import { isHttpUrl } from '@/components/ai-chat/utils'

interface KnowledgeSourcesProps {
  sources: Citation[]
}

/** Richer source-card list than the chat's compact CitationsList. */
export function KnowledgeSources({ sources }: KnowledgeSourcesProps) {
  const t = useT()
  if (sources.length === 0) return null

  return (
    <section className="glass glass-highlight rounded-2xl p-5 sm:p-6">
      <header className="mb-4 flex items-center gap-2">
        <BookText size={15} className="text-primary" aria-hidden />
        <h3 className="font-display text-base font-semibold text-foreground">
          {t.knowledge.sourcesTitle}
        </h3>
        <span className="ml-auto text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {sources.length}
        </span>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {sources.map((c, i) => {
          const linkable = isHttpUrl(c.source)
          return (
            <li
              key={c.id ?? `${c.source}-${i}`}
              className="rounded-xl border border-border/70 bg-secondary/30 p-3"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-[11px] font-semibold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium leading-snug text-foreground">
                    {c.title}
                  </p>
                  {c.source && (
                    <div className="mt-0.5 break-all text-[11px] text-muted-foreground">
                      {linkable ? (
                        <a
                          href={c.source.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-primary"
                        >
                          <ExternalLink size={11} className="shrink-0" />
                          <span className="truncate">{c.source}</span>
                        </a>
                      ) : (
                        <span>{c.source}</span>
                      )}
                    </div>
                  )}
                  {c.snippet && (
                    <p className="mt-1.5 line-clamp-3 text-[12px] leading-snug text-muted-foreground">
                      {c.snippet}
                    </p>
                  )}
                  {typeof c.score === 'number' && (
                    <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                      {t.knowledge.transparency.topScore}: {c.score.toFixed(3)}
                    </p>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
