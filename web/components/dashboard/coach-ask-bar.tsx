'use client'

import { ArrowRight, Sparkles } from 'lucide-react'
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
        // Intentionally lighter than the Quick Log bar: a slim, single-line
        // secondary entry (no glass card, no filled tint) so logging stays the
        // visual protagonist in the thumb zone.
        'group flex min-h-11 w-full items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground',
        className
      )}
    >
      <Sparkles size={15} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{t.aiChat.home.title}</span>
      <ArrowRight
        size={14}
        className="shrink-0 transition-transform group-hover:translate-x-0.5"
      />
    </button>
  )
}
