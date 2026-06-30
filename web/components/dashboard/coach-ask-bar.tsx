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
        'glass glass-highlight group relative flex items-center gap-3 overflow-hidden rounded-2xl border-primary/30 bg-primary/[0.05] px-4 py-3 text-left transition-colors hover:bg-primary/[0.08]',
        className
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <Sparkles size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight text-foreground">{t.aiChat.home.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{t.aiChat.home.subtitle}</p>
      </div>
      <ArrowRight
        size={16}
        className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </button>
  )
}
