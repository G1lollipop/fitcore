'use client'

import type { Citation } from '@/lib/ai/types'
import { useT } from '@/lib/i18n/provider'
import { isHttpUrl } from './utils'

export function CitationsList({ citations }: { citations: Citation[] }) {
  const t = useT()
  if (citations.length === 0) return null
  return (
    <div className="mt-1.5 w-full max-w-[320px] rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm px-3 py-2 space-y-1.5 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {t.aiChat.citations}
      </p>
      <ul className="space-y-2">
        {citations.map((c, i) => (
          <li
            key={c.id ?? `${c.source}-${i}`}
            className="text-[11px] leading-snug text-foreground/85"
          >
            <span className="font-medium text-foreground">
              {i + 1}. {c.title}
            </span>
            {c.source ? (
              <div className="mt-0.5 text-muted-foreground/70 break-all">
                {isHttpUrl(c.source) ? (
                  <a
                    href={c.source.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-primary transition-colors"
                  >
                    {c.source}
                  </a>
                ) : (
                  <span>{c.source}</span>
                )}
              </div>
            ) : null}
            {c.snippet ? (
              <p className="mt-0.5 text-muted-foreground/70 line-clamp-2">{c.snippet}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
