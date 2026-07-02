'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Pencil, UtensilsCrossed } from 'lucide-react'
import { useState } from 'react'
import { TodayHero } from '@/components/dashboard/today-hero'
import { TodayMetrics } from '@/components/dashboard/today-metrics'
import { TodayDietDetails } from '@/components/dashboard/today-diet-details'
import { NutritionTargetsDialog } from '@/components/dashboard/nutrition-targets-dialog'
import { useT } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'

interface TodayOverviewProps {
  userId?: string
  kcalIntake?: number
  kcalBurn?: number
  kcalGoal?: number
  workoutMinutes?: number
  protein?: number
  proteinGoal?: number
  carbs?: number
  carbsGoal?: number
  fat?: number
  fatGoal?: number
  waterMl?: number
  waterGoalMl?: number
  onWaterLogged?: () => void
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
  kcalBurn,
  kcalGoal,
  workoutMinutes,
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
  const [dietOpen, setDietOpen] = useState(false)
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

      <TodayHero
        embedded
        kcalIntake={kcalIntake}
        kcalBurn={kcalBurn}
        kcalGoal={kcalGoal}
        workoutMinutes={workoutMinutes}
      />

      {/* Macros continue the same stat-row language as the energy stats above,
          so the ring + all six stats read as one list. Targets are editable
          inline right where the goals are shown. */}
      <div className="relative mt-2 border-t border-border/50 pt-2 md:mt-3 md:pt-3">
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

      {/* Tap-to-expand: reveals today's full meal list without leaving home. */}
      <button
        type="button"
        onClick={() => setDietOpen((v) => !v)}
        aria-expanded={dietOpen}
        aria-label={dietOpen ? t.dashboard.overview.collapse : t.dashboard.overview.expand}
        className="relative mt-3 flex w-full items-center justify-between rounded-xl border border-border/50 bg-card/40 px-3 py-2 text-left transition-colors hover:border-primary/40 md:py-2.5"
      >
        <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
          <UtensilsCrossed size={14} className="text-primary" aria-hidden />
          {t.dashboard.overview.todaysMeals}
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={cn(
            'text-muted-foreground transition-transform duration-300',
            dietOpen && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {dietOpen && (
          <motion.div
            key="today-diet"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden"
          >
            <div className="pt-4">
              <TodayDietDetails userId={userId} onDietChanged={onDietChanged} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <NutritionTargetsDialog
        open={targetsOpen}
        onOpenChange={setTargetsOpen}
        onSaved={onTargetsSaved}
      />
    </motion.section>
  )
}
