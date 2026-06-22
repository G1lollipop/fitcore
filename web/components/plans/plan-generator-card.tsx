'use client'

import { motion } from 'framer-motion'
import { Loader2, Sparkles, Wand2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { generateWorkoutPlan } from '@/app/actions/generatePlan'
import { setCurrentPlan } from '@/app/actions/plans'
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'

interface PlanGeneratorCardProps {
  /** Called after a plan is generated (and set current) so the list refreshes. */
  onGenerated: () => void
  /** Secondary affordance: open the manual wizard. */
  onManual: () => void
}

/**
 * Primary CTA for the Plans tab: an AI-first plan builder. The user describes
 * their goal in one line and the coach produces a full structured plan
 * (`generateWorkoutPlan`), which is then set as the current plan. The manual
 * wizard is demoted to a secondary text link.
 */
export function PlanGeneratorCard({ onGenerated, onManual }: PlanGeneratorCardProps) {
  const t = useT()
  const { toast } = useToast()
  const [goal, setGoal] = useState('')
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    const goalText = goal.trim()
    if (!goalText || isPending) return
    startTransition(async () => {
      const res = await generateWorkoutPlan({ goalText })
      if (!res.success || !('data' in res) || !res.data) {
        const err = (res as { error?: unknown }).error
        toast({
          variant: 'destructive',
          title: t.plans.ai.failed,
          description: typeof err === 'string' ? tError(t, err) : t.plans.ai.tryLater,
        })
        return
      }
      const plan = res.data as { id: string; name: string; frequency_per_week?: number }
      // Make the freshly generated plan the active one so "today's workout"
      // immediately reflects it.
      await setCurrentPlan(plan.id)
      setGoal('')
      toast({
        title: t.plans.ai.generated,
        description: t.plans.ai.generatedDesc(plan.name, plan.frequency_per_week ?? 0),
      })
      onGenerated()
    })
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="glass glass-highlight relative overflow-hidden rounded-2xl p-5 sm:p-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
      />

      <header className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Wand2 size={18} />
        </span>
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">
            {t.plans.ai.title}
          </h3>
          <p className="text-xs text-muted-foreground">{t.plans.ai.subtitle}</p>
        </div>
      </header>

      <div className="relative mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 transition-shadow focus-within:border-primary/60">
          <Sparkles size={16} className="shrink-0 text-primary" aria-hidden />
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            disabled={isPending}
            placeholder={t.plans.ai.placeholder}
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !goal.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              {t.plans.ai.generating}
            </>
          ) : (
            <>
              <Wand2 size={15} />
              {t.plans.ai.generate}
            </>
          )}
        </button>
      </div>

      <button
        type="button"
        onClick={onManual}
        className="relative mt-3 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        {t.plans.ai.orManual}
      </button>
    </motion.section>
  )
}
