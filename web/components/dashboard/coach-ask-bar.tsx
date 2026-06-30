'use client'

import { ArrowRight, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useCoach } from '@/components/ai-chat/coach-context'
import { useT } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'

interface CoachAskBarProps {
  className?: string
}

/**
 * Prominent AI coach entry for the home tab. Promoted from a slim bar to a
 * primary-tinted card (header + input + quick chips) so the coach reads as a
 * first-class action, while the floating action dock stays the global entry.
 * Designed to anchor the bottom of the single-screen home layout, in the
 * mobile thumb zone.
 */
export function CoachAskBar({ className }: CoachAskBarProps) {
  const t = useT()
  const coach = useCoach()
  const [text, setText] = useState('')

  const submit = (value: string) => {
    const trimmed = value.trim()
    coach.open(trimmed || undefined)
    setText('')
  }

  return (
    <section
      className={cn(
        'glass glass-highlight relative flex flex-col justify-center gap-3 overflow-hidden rounded-2xl border-primary/30 bg-primary/[0.05] p-4',
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary/10 blur-2xl"
      />

      <header className="relative flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold leading-tight text-foreground">
            {t.aiChat.home.title}
          </h2>
          <p className="truncate text-[11px] text-muted-foreground">{t.aiChat.home.subtitle}</p>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit(text)
        }}
        className="relative flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 transition-shadow focus-within:border-primary/60"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.aiChat.home.placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        <button
          type="submit"
          aria-label={t.aiChat.home.cta}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <ArrowRight size={14} />
        </button>
      </form>

      <div className="relative flex flex-wrap gap-1.5">
        {t.aiChat.home.chips.slice(0, 2).map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => submit(chip)}
            className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {chip}
          </button>
        ))}
      </div>
    </section>
  )
}
