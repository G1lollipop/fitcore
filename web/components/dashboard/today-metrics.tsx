'use client'

import { motion } from 'framer-motion'
import { Droplets, Plus } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { logWater } from '@/app/actions/dashboard'
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { DEFAULT_WATER_GOAL_ML } from '@/lib/metrics/water'

interface TodayMetricsProps {
  userId?: string
  protein?: number
  proteinGoal?: number
  carbs?: number
  carbsGoal?: number
  fat?: number
  fatGoal?: number
  waterMl?: number
  waterGoalMl?: number
  onWaterLogged?: () => void
  /** Render slim pills without their own glass card (for the combined overview). */
  embedded?: boolean
}

const WATER_INCREMENT = 250

/**
 * Compact "today metrics" strip for the home tab: protein / carbs / fat and
 * water as four small progress pills. Replaces the oversized water hero so the
 * first screen carries glanceable macro data instead of one decorative glass.
 * The water pill keeps a one-tap quick-add.
 */
export function TodayMetrics({
  userId,
  protein = 0,
  proteinGoal = 0,
  carbs = 0,
  carbsGoal = 0,
  fat = 0,
  fatGoal = 0,
  waterMl = 0,
  waterGoalMl = DEFAULT_WATER_GOAL_ML,
  onWaterLogged,
  embedded = false,
}: TodayMetricsProps) {
  const t = useT()
  const { toast } = useToast()
  const [ml, setMl] = useState(waterMl)
  const [isPending, startTransition] = useTransition()
  const lastInitialRef = useRef(waterMl)

  // Adopt server value on refetch unless an optimistic add is in flight.
  useEffect(() => {
    if (waterMl !== lastInitialRef.current && !isPending) {
      setMl(waterMl)
      lastInitialRef.current = waterMl
    }
  }, [waterMl, isPending])

  const handleAddWater = () => {
    if (!userId || isPending) return
    const previous = ml
    setMl(previous + WATER_INCREMENT)
    startTransition(async () => {
      const result = await logWater(WATER_INCREMENT)
      if (!result.success) {
        setMl(previous)
        toast({
          variant: 'destructive',
          title: t.dashboard.water.logFailed,
          description: result.error ? tError(t, result.error) : t.dashboard.water.tryLater,
        })
        return
      }
      if (typeof result.newAmount === 'number') {
        setMl(result.newAmount)
        lastInitialRef.current = result.newAmount
      }
      onWaterLogged?.()
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      <MetricPill
        label={t.nutrition.rings.protein}
        value={protein}
        goal={proteinGoal}
        unit={t.common.grams}
        embedded={embedded}
      />
      <MetricPill
        label={t.nutrition.rings.carbs}
        value={carbs}
        goal={carbsGoal}
        unit={t.common.grams}
        embedded={embedded}
      />
      <MetricPill
        label={t.nutrition.rings.fat}
        value={fat}
        goal={fatGoal}
        unit={t.common.grams}
        embedded={embedded}
      />
      <MetricPill
        label={t.dashboard.water.title}
        value={Number((ml / 1000).toFixed(1))}
        goal={Number((waterGoalMl / 1000).toFixed(1))}
        unit="L"
        embedded={embedded}
        icon={<Droplets size={12} />}
        action={
          <button
            type="button"
            onClick={handleAddWater}
            disabled={!userId || isPending}
            aria-label={t.dashboard.water.add(WATER_INCREMENT)}
            className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={13} className={cn(isPending && 'animate-pulse')} />
          </button>
        }
      />
    </motion.div>
  )
}

interface MetricPillProps {
  label: string
  value: number
  goal: number
  unit: string
  icon?: React.ReactNode
  action?: React.ReactNode
  embedded?: boolean
}

function MetricPill({ label, value, goal, unit, icon, action, embedded = false }: MetricPillProps) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-2xl p-3',
        embedded ? 'rounded-xl border border-border/50 bg-card/40 p-2.5' : 'glass glass-highlight'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          {icon}
          {label}
        </span>
        {action}
      </div>
      <p className="font-display text-lg font-semibold leading-none tabular-nums text-foreground">
        {value}
        <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">
          {unit}
          {goal > 0 && ` / ${goal}`}
        </span>
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  )
}
