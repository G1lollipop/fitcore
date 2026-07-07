'use client'

import { motion } from 'framer-motion'
import { useT } from '@/lib/i18n/provider'

interface TodayMetricsProps {
  userId?: string
  protein?: number
  proteinGoal?: number
  carbs?: number
  carbsGoal?: number
  fat?: number
  fatGoal?: number
  /** Render without its own glass card (for the combined overview). */
  embedded?: boolean
}

const MACRO_COLORS = {
  protein: 'var(--chart-1)',
  carbs: 'var(--chart-2)',
  fat: 'var(--chart-3)',
} as const

/**
 * Home-card macro summary: protein / carbs / fat rendered as three
 * horizontal progress bars showing label | fill bar | value / goal.
 * Compact enough to fit a single phone viewport without scrolling.
 */
export function TodayMetrics({
  protein = 0,
  proteinGoal = 0,
  carbs = 0,
  carbsGoal = 0,
  fat = 0,
  fatGoal = 0,
}: TodayMetricsProps) {
  const t = useT()

  const macros = [
    { label: t.nutrition.rings.protein, value: protein, goal: proteinGoal, color: MACRO_COLORS.protein },
    { label: t.nutrition.rings.carbs, value: carbs, goal: carbsGoal, color: MACRO_COLORS.carbs },
    { label: t.nutrition.rings.fat, value: fat, goal: fatGoal, color: MACRO_COLORS.fat },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
      className="flex flex-col gap-1.5"
    >
      {macros.map(({ label, value, goal, color }) => {
        const pct = goal && goal > 0 ? Math.min((value / goal) * 100, 100) : 0
        return (
          <div key={label} className="flex items-center gap-2">
            <span className="w-14 text-[10px] font-medium text-muted-foreground">
              {label}
            </span>
            <div
              className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground w-16 text-right">
              {value} / {goal ?? '—'}g
            </span>
          </div>
        )
      })}
    </motion.div>
  )
}
