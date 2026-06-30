'use client'

import { motion } from 'framer-motion'
import { TodayHero } from '@/components/dashboard/today-hero'
import { TodayMetrics } from '@/components/dashboard/today-metrics'
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
  waterMl,
  waterGoalMl,
  onWaterLogged,
  className,
}: TodayOverviewProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'glass glass-highlight relative overflow-hidden rounded-2xl p-4',
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

      <div className="relative my-3 h-px bg-border/60" />

      <TodayMetrics
        embedded
        userId={userId}
        protein={protein}
        proteinGoal={proteinGoal}
        carbs={carbs}
        carbsGoal={carbsGoal}
        fat={fat}
        fatGoal={fatGoal}
        waterMl={waterMl}
        waterGoalMl={waterGoalMl}
        onWaterLogged={onWaterLogged}
      />
    </motion.section>
  )
}
