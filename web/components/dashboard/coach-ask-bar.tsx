'use client'

import { ArrowRight, Bot } from 'lucide-react'
import { useCoach } from '@/components/ai-chat/coach-context'
import { useT } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'

interface CoachAskBarProps {
  className?: string
}

/**
 * Slim AI coach entry for the home tab. The coach is the *secondary* surface
 * (logging is the protagonist), so this is a single tappable row that opens the
 * coach rather than a full input card. The floating action dock + the coach
 * widget own the actual conversation UI.
 */
export function CoachAskBar({ className }: CoachAskBarProps) {
  const t = useT()
  const coach = useCoach()

  return (
    <button
      type="button"
      onClick={() => coach.open()}
      className={cn(
        // Secondary to the Quick Log bar: a slim, glassy card with a subtle
        // aurora tint so it feels like part of the home screen family without
        // competing with logging for attention.
        'group relative flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-2xl',
        'border border-border/60 bg-card/50 px-3 py-2.5 text-left text-foreground',
        'backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-card/70 hover:shadow-sm',
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/5 blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-5 -left-5 h-20 w-20 rounded-full bg-accent/5 blur-2xl"
      />

      <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/15 shadow-sm">
        <Bot size={14} className="text-primary" />
      </div>

      <span className="relative min-w-0 flex-1 truncate text-xs font-semibold">{t.aiChat.home.title}</span>
      <ArrowRight
        size={14}
        className="relative shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
      />
    </button>
  )
}
