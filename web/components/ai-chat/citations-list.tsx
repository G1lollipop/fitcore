'use client'

import type { Citation } from '@/lib/ai/types'
import { isHttpUrl } from './utils'

/** Renders the small "引用" card under an assistant message. Returns null when empty. */
export function CitationsList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null
  return (
    <div className="mt-1 w-full max-w-[320px] rounded-lg border border-border/70 bg-muted/25 px-2 py-1.5 space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground tracking-wide">引用</p>
      <ul className="space-y-1.5">
        {citations.map((c, i) => (
          <li
            key={c.id ?? `${c.source}-${i}`}
            className="text-[10px] leading-snug text-foreground/90"
          >
            <span className="font-medium text-foreground">
              {i + 1}. {c.title}
            </span>
            {c.source ? (
              <div className="mt-0.5 text-muted-foreground break-all">
                {isHttpUrl(c.source) ? (
                  <a
                    href={c.source.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-primary"
                  >
                    {c.source}
                  </a>
                ) : (
                  <span>{c.source}</span>
                )}
              </div>
            ) : null}
            {c.snippet ? (
              <p className="mt-0.5 text-muted-foreground line-clamp-2">{c.snippet}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
