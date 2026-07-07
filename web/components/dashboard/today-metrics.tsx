'use client'

import { motion } from 'framer-motion'
import { Beef, Wheat, Droplet } from 'lucide-react'
import { cn } from '@/lib/utils'
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

/**
 * Home-card macro summary: protein / carbs / fat rendered as three compact
 * vertical cells that share a single row even on a 320px phone — a tight
 * icon + label on top and "value / goal g" below. Keeps the overview short
 * (mobile-first) while staying visually consistent with the energy stats.
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
      className="grid grid-cols-3 gap-1.5"
    >
      <MacroCell
        tone="primary"
        icon={<Beef size={13} />}
        label={t.nutrition.rings.protein}
        value={protein}
        goal={proteinGoal}
        unit={t.common.grams}
      />
      <MacroCell
        tone="accent"
        icon={<Wheat size={13} />}
        label={t.nutrition.rings.carbs}
        value={carbs}
        goal={carbsGoal}
        unit={t.common.grams}
      />
      <MacroCell
        tone="muted"
        icon={<Droplet size={13} />}
        label={t.nutrition.rings.fat}
        value={fat}
        goal={fatGoal}
        unit={t.common.grams}
      />
    </motion.div>
  )
}

interface MacroCellProps {
  tone: 'primary' | 'accent' | 'muted'
  icon: React.ReactNode
  label: string
  value: number
  goal: number
  unit: string
}

/**
 * Compact 3-up macro cell: fits three across at 320px without overflow.
 */
function MacroCell({ tone, icon, label, value, goal, unit }: MacroCellProps) {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary/10 text-primary'
      : tone === 'accent'
        ? 'bg-accent/20 text-accent-foreground'
        : 'bg-secondary text-muted-foreground'

  return (
    <div className="flex min-w-0 flex-col items-center gap-1 rounded-lg border border-border/50 bg-card/50 px-1 py-2 text-center">
      <span className="flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
        <span className={cn('flex h-4 w-4 items-center justify-center rounded', toneClass)}>{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <p className="font-display text-sm font-semibold leading-tight tabular-nums text-foreground">
        {value}
        <span className="ml-0.5 whitespace-nowrap text-[10px] font-normal text-muted-foreground">
          {goal > 0 ? `/${goal} ${unit}` : unit}
        </span>
      </p>
    </div>
  )
}
