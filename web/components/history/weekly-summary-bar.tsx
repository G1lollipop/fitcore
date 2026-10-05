// web/components/history/weekly-summary-bar.tsx
'use client'

import { TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { toLocalDateStr } from '@/lib/utils/date'
import type { NutritionDayData } from '@/app/actions/history'
import type { WorkoutLogItem } from '@/app/actions/types'

interface WeeklySummaryBarProps {
  dietWeekData?: Record<string, NutritionDayData>
  workoutWeekData?: Record<string, WorkoutLogItem[]>
  todayStr: string
  onOpenTrends?: () => void
}

function computeStreak(
  dietWeekData: Record<string, NutritionDayData> | undefined,
  workoutWeekData: Record<string, WorkoutLogItem[]> | undefined,
  todayStr: string
): number {
  let streak = 0
  for (let i = 0; i < 7; i++) {
    const date = new Date(`${todayStr}T12:00:00`)
    date.setDate(date.getDate() - i)
    const dateStr = toLocalDateStr(date)
    const hasDiet = (dietWeekData?.[dateStr]?.dietLogs?.length ?? 0) > 0
    const hasWorkout = (workoutWeekData?.[dateStr]?.length ?? 0) > 0
    if (hasDiet || hasWorkout) {
      streak++
    } else {
      break
    }
  }
  return streak
}

export function WeeklySummaryBar({
  dietWeekData,
  workoutWeekData,
  todayStr,
  onOpenTrends,
}: WeeklySummaryBarProps) {
  const totals = useMemo(() => {
    let kcal = 0
    let workouts = 0
    let minutes = 0
    for (const day of Object.values(dietWeekData ?? {})) {
      for (const log of day.dietLogs ?? []) {
        kcal += log.calories ?? 0
      }
    }
    for (const logs of Object.values(workoutWeekData ?? {})) {
      workouts += logs.length
      for (const l of logs) {
        minutes += l.duration_minutes ?? 0
      }
    }
    const streak = computeStreak(dietWeekData, workoutWeekData, todayStr)
    return { kcal, workouts, minutes, streak }
  }, [dietWeekData, workoutWeekData, todayStr])

  return (
    <div className="glass glass-highlight rounded-2xl p-2.5">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">This week</span>
          <span>{totals.kcal.toLocaleString()} kcal</span>
          <span>{totals.workouts} workouts</span>
          <span>{totals.minutes} min</span>
          {totals.streak > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              🔥 {totals.streak}d streak
            </span>
          )}
        </div>
        {onOpenTrends && (
          <button
            type="button"
            onClick={onOpenTrends}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <TrendingUp size={13} />
            Trends
          </button>
        )}
      </div>
    </div>
  )
}
