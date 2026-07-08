'use client'

import { motion } from 'framer-motion'
import { ChevronRight, Pencil, UtensilsCrossed } from 'lucide-react'
import { useState } from 'react'
import { TodayHero } from '@/components/dashboard/today-hero'
import { TodayMetrics } from '@/components/dashboard/today-metrics'
import { TodayDietDetails } from '@/components/dashboard/today-diet-details'
import { NutritionTargetsDialog } from '@/components/dashboard/nutrition-targets-dialog'
import { useT } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useQuery } from '@tanstack/react-query'
import { getNutritionByDate } from '@/app/actions/history'
import { getTodayDate } from '@/lib/utils/date'

interface TodayOverviewProps {
  userId?: string
  kcalIntake?: number
  kcalGoal?: number
  protein?: number
  proteinGoal?: number
  carbs?: number
  carbsGoal?: number
  fat?: number
  fatGoal?: number
  /** Refresh dashboard goals/rings after the user edits nutrition targets. */
  onTargetsSaved?: () => void
  /**
   * Reconcile the dashboard rings/macros after the user edits or deletes a
   * meal from the expanded "today's diet" list. Optional so the card stays
   * backward-compatible with existing callers (defaults to a no-op).
   */
  onDietChanged?: () => void
  className?: string
}

/**
 * Combined "today overview" card: the calorie ring + intake/burn/minutes stats
 * and the macro/water progress bars share a single glass card (instead of two
 * stacked cards). Merging them removes a card's worth of vertical chrome so the
 * home tab stays closer to one phone screen.
 */
export function TodayOverview({
  userId,
  kcalIntake,
  kcalGoal,
  protein,
  proteinGoal,
  carbs,
  carbsGoal,
  fat,
  fatGoal,
  onTargetsSaved,
  onDietChanged,
  className,
}: TodayOverviewProps) {
  const t = useT()
  const [targetsOpen, setTargetsOpen] = useState(false)
  const { data: dietSummary } = useQuery({
    queryKey: ['nutrition', getTodayDate()],
    queryFn: () => getNutritionByDate(getTodayDate()),
    enabled: !!userId,
    staleTime: 60_000,
  })
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'glass glass-highlight relative overflow-hidden rounded-2xl p-3 md:p-4',
        className
      )}
    >
      <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-primary/5 blur-3xl" aria-hidden />
      <div className="absolute -bottom-24 -left-12 h-48 w-48 rounded-full bg-accent/10 blur-3xl" aria-hidden />

      <div className="flex items-stretch gap-3 md:gap-4">
        {/* Left: calorie ring */}
        <div className="shrink-0">
          <TodayHero
            embedded
            kcalIntake={kcalIntake}
            kcalGoal={kcalGoal}
          />
        </div>

        {/* Right: macro targets */}
        <div className="min-w-0 flex-1 self-stretch flex flex-col">
          <div className="mb-1.5 flex items-center justify-between md:mb-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              {t.dashboard.targets.label}
            </span>
            <button
              type="button"
              onClick={() => setTargetsOpen(true)}
              aria-label={t.dashboard.targets.edit}
              className="-my-2 -mr-1.5 inline-flex h-10 items-center gap-1 rounded-lg px-1.5 text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
            >
              <Pencil size={12} />
              {t.dashboard.targets.edit}
            </button>
          </div>

          <TodayMetrics
            embedded
            protein={protein}
            proteinGoal={proteinGoal}
            carbs={carbs}
            carbsGoal={carbsGoal}
            fat={fat}
            fatGoal={fatGoal}
          />
        </div>
      </div>

      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className="relative mt-3 flex w-full items-center justify-between rounded-xl border border-border/50 bg-card/40 px-3 py-2 text-left transition-colors hover:border-primary/40 md:py-2.5"
          >
            <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
              <UtensilsCrossed size={14} className="text-primary" aria-hidden />
              {t.dashboard.overview.todaysMeals}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {(() => {
                const dietLogs = dietSummary?.dietLogs ?? []
                const count = dietLogs.length
                const kcal = dietLogs.reduce((sum, log) => sum + (log.calories ?? 0), 0)
                if (count === 0) return 'No meals yet'
                return `${count} ${count === 1 ? 'item' : 'items'} · ${kcal.toLocaleString()} ${t.common.kcal}`
              })()}
              <ChevronRight size={14} />
            </span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl p-0">
          <SheetHeader className="px-4 pt-5 pb-2">
            <SheetTitle className="font-display text-lg">{t.dashboard.overview.todaysMeals}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            <TodayDietDetails userId={userId} onDietChanged={onDietChanged} />
          </div>
        </SheetContent>
      </Sheet>

      <NutritionTargetsDialog
        open={targetsOpen}
        onOpenChange={setTargetsOpen}
        onSaved={onTargetsSaved}
      />
    </motion.section>
  )
}
