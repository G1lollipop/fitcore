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
      className="flex flex-col gap-2"
    >
      {macros.map(({ label, value, goal, color }) => {
        const pct = goal && goal > 0 ? Math.min((value / goal) * 100, 100) : 0
        const overGoal = goal > 0 && value > goal
        return (
          <div key={label} className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-[10px] font-semibold tracking-wide uppercase text-muted-foreground/80">
              {label.slice(0, 1)}
            </span>
            <div className="relative flex-1 h-2 rounded-full bg-secondary/60 overflow-hidden shadow-inner">
              <div
                className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent to-transparent"
                style={{
                  background: `linear-gradient(to right, ${color}, ${color}88)`,
                  width: `${Math.min(pct, 100)}%`,
                  boxShadow: `0 0 6px ${color}40`,
                }}
              />
              {overGoal && (
                <div
                  className="absolute inset-y-0 right-0 rounded-r-full bg-destructive/60"
                  style={{ left: `${(goal / value) * 100}%` }}
                />
              )}
            </div>
            <span
              className={`text-[10px] tabular-nums w-14 text-right font-medium ${
                overGoal ? 'text-destructive' : 'text-muted-foreground'
              }`}
            >
              {value}
              <span className="text-[9px] font-normal text-muted-foreground/60">
                /{goal ?? '—'}g
              </span>
            </span>
          </div>
        )
      })}
    </motion.div>
  )
}
