'use client'

import { motion } from 'framer-motion'
import { CalendarDays, Sparkles, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { useCoach } from '@/components/ai-chat/coach-context'
import { useT } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'

interface GettingStartedCardProps {
  /** Jump to the Nutrition tab. */
  onGoNutrition: () => void
  /** Jump to the Training tab. */
  onGoTraining: () => void
  className?: string
}

/**
 * First-run nudge shown on the home tab while the user has no logs and no
 * active plan. Replaces an empty dashboard with three one-tap next steps that
 * map to the app's three core jobs: eat, train, ask.
 */
export function GettingStartedCard({ onGoNutrition, onGoTraining, className }: GettingStartedCardProps) {
  const t = useT()
  const coach = useCoach()

  const steps: { icon: LucideIcon; label: string; hint: string; onClick: () => void }[] = [
    {
      icon: UtensilsCrossed,
      label: t.dashboard.gettingStarted.logMeal,
      hint: t.dashboard.gettingStarted.logMealHint,
      onClick: onGoNutrition,
    },
    {
      icon: CalendarDays,
      label: t.dashboard.gettingStarted.pickPlan,
      hint: t.dashboard.gettingStarted.pickPlanHint,
      onClick: onGoTraining,
    },
    {
      icon: Sparkles,
      label: t.dashboard.gettingStarted.askCoach,
      hint: t.dashboard.gettingStarted.askCoachHint,
      onClick: () => coach.open(),
    },
  ]

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn('glass glass-highlight rounded-2xl p-4', className)}
    >
      <header className="mb-3">
        <h3 className="font-display text-sm font-semibold text-foreground">
          {t.dashboard.gettingStarted.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {t.dashboard.gettingStarted.subtitle}
        </p>
      </header>

      <div className="grid gap-2">
        {steps.map((step) => {
          const Icon = step.icon
          return (
            <button
              key={step.label}
              type="button"
              onClick={step.onClick}
              className="group flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Icon size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-tight text-foreground">{step.label}</span>
                <span className="block text-[11px] text-muted-foreground">{step.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
    </motion.section>
  )
}
