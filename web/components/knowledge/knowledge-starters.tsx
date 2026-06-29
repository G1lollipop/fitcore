'use client'

import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useT } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'
import { KNOWLEDGE_TOPICS } from './starters'

interface KnowledgeStartersProps {
  onPick: (question: string) => void
}

/** Empty-state explorer: topic chips that reveal one-tap starter questions. */
export function KnowledgeStarters({ onPick }: KnowledgeStartersProps) {
  const t = useT()
  const [activeTopic, setActiveTopic] = useState<string>(KNOWLEDGE_TOPICS[0].id)
  const topic =
    KNOWLEDGE_TOPICS.find((tp) => tp.id === activeTopic) ?? KNOWLEDGE_TOPICS[0]

  return (
    <section className="glass glass-highlight rounded-2xl p-5 sm:p-6">
      <header className="mb-4">
        <h3 className="font-display text-base font-semibold text-foreground">
          {t.knowledge.starters.title}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t.knowledge.starters.subtitle}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {KNOWLEDGE_TOPICS.map((tp) => {
          const Icon = tp.icon
          const active = tp.id === activeTopic
          return (
            <button
              key={tp.id}
              type="button"
              onClick={() => setActiveTopic(tp.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon size={13} aria-hidden />
              {tp.label}
            </button>
          )
        })}
      </div>

      <ul className="mt-4 space-y-2">
        {topic.questions.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="group flex w-full items-center gap-2 rounded-xl border border-border/70 bg-secondary/30 px-3 py-2.5 text-left text-[13px] text-foreground/90 transition-colors hover:border-primary/40 hover:bg-card"
            >
              <span className="flex-1">{q}</span>
              <ArrowUpRight
                size={15}
                className="shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
