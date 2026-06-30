'use client'

import { CalendarDays, ListChecks } from 'lucide-react'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { getCurrentPlanLight } from '@/app/actions/plans'
import { batchLogWorkouts } from '@/app/actions/logWorkout'
import { calculateTodayWorkout, type TodayWorkoutResult } from '@/lib/plans/today-workout'
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { MyPlans } from '@/components/plans/my-plans'
import { TodayBanner } from '@/components/plans/today-banner'
import { TrainingHistory } from './training-history'

type Segment = 'records' | 'plans'

/** Loose shape for the current-plan row (the body lives in `structure`). */
interface CurrentPlanRow {
  id: string
  name: string
  structure?: unknown
}

interface TrainingCenterProps {
  userId?: string
  onLogSuccess?: () => void
}

/**
 * Unified Training tab.
 *
 * Merges the former separate "Training" (history calendar) and "Plans" tabs
 * into one surface, switched with a segmented control. The today-workout
 * banner is lifted here so it stays visible under both segments, and starting
 * today's workout logs straight from the banner.
 *
 * Both segments stay mounted (toggled via `hidden`) so switching is instant
 * and each keeps its own state (selected month, plan list, etc.).
 */
export function TrainingCenter({ userId, onLogSuccess }: TrainingCenterProps) {
  const t = useT()
  const { toast } = useToast()
  const [segment, setSegment] = useState<Segment>('records')
  const [currentPlan, setCurrentPlan] = useState<CurrentPlanRow | null>(null)
  const [todayResult, setTodayResult] = useState<TodayWorkoutResult | null>(null)
  const [isLogging, startLogging] = useTransition()

  const loadToday = useCallback(async () => {
    if (!userId) return
    try {
      const res = await getCurrentPlanLight()
      if (res.success && res.data) {
        const plan = res.data.plan as CurrentPlanRow
        setCurrentPlan(plan)
        setTodayResult(calculateTodayWorkout(plan.structure))
      } else {
        setCurrentPlan(null)
        setTodayResult(null)
      }
    } catch (error) {
      console.error('Failed to load today workout:', error)
    }
  }, [userId])

  useEffect(() => {
    if (userId) loadToday()
  }, [userId, loadToday])

  const handleStartWorkout = useCallback(() => {
    if (!userId || !todayResult || todayResult.exercises.length === 0) return
    startLogging(async () => {
      const workouts = todayResult.exercises.map((e) => ({
        name: e.exerciseName || t.plans.list.workoutDefaultName,
        sets: e.sets ?? undefined,
        duration_minutes: 15,
        calories_burned: Math.round((e.sets ?? 3) * 8),
      }))
      const result = await batchLogWorkouts(workouts)
      if (result.success) {
        toast({
          title: t.plans.list.workoutStarted,
          description: t.plans.list.workoutStartedDesc(workouts.length),
        })
        onLogSuccess?.()
      } else {
        toast({
          variant: 'destructive',
          title: t.plans.list.logFailed,
          description: typeof result.error === 'string' ? tError(t, result.error) : t.plans.list.tryLater,
        })
      }
    })
  }, [userId, todayResult, toast, t, onLogSuccess])

  return (
    <div className="flex h-[calc(100dvh_-_12rem)] flex-col gap-3 md:h-auto md:gap-6">
      {currentPlan && todayResult && (
        <TodayBanner
          planName={currentPlan.name}
          result={todayResult}
          isLogging={isLogging}
          onStart={handleStartWorkout}
          className="shrink-0"
        />
      )}

      <div className="shrink-0">
        <SegmentedControl segment={segment} onChange={setSegment} />
      </div>

      <div
        hidden={segment !== 'records'}
        className="min-h-0 flex-1 overflow-y-auto pr-1 md:overflow-visible"
      >
        <TrainingHistory userId={userId} onLogSuccess={onLogSuccess} />
      </div>
      <div
        hidden={segment !== 'plans'}
        className="min-h-0 flex-1 overflow-y-auto pr-1 md:overflow-visible"
      >
        <MyPlans userId={userId} hideTodayBanner onCurrentPlanChange={loadToday} />
      </div>
    </div>
  )
}

function SegmentedControl({
  segment,
  onChange,
}: {
  segment: Segment
  onChange: (s: Segment) => void
}) {
  const t = useT()
  const items: { id: Segment; label: string; icon: typeof ListChecks }[] = [
    { id: 'records', label: t.training.segments.records, icon: ListChecks },
    { id: 'plans', label: t.training.segments.plans, icon: CalendarDays },
  ]

  return (
    <div
      role="tablist"
      aria-label={t.training.segments.aria}
      className="glass inline-flex rounded-full p-1"
    >
      {items.map((item) => {
        const Icon = item.icon
        const active = segment === item.id
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon size={15} strokeWidth={active ? 2.25 : 2} />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
