'use client'

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getDashboardData } from '@/app/actions/dashboard'
import type {
  DashboardData,
  DietLogItem,
  WorkoutLogItem,
} from '@/app/actions/types'
import type { QuickLogResult } from '@/app/actions/quickLog'

/**
 * Single cache key for the home dashboard payload (always "today" scoped).
 * Mutations elsewhere patch this entry directly so the rings/totals update
 * instantly without a 6-query server round-trip.
 */
export const DASHBOARD_KEY = ['dashboard', 'today'] as const

export function useDashboardData(initialData: DashboardData | null) {
  return useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: async () => {
      const data = await getDashboardData()
      return data
    },
    // Seed first paint from the server component; never refetch on mount.
    initialData,
  })
}

type TodayPatch = (today: DashboardData['today']) => DashboardData['today']

function applyTodayPatch(
  prev: DashboardData | null | undefined,
  patch: TodayPatch
): DashboardData | null {
  if (!prev) return prev ?? null
  return { ...prev, today: patch(prev.today) }
}

/**
 * Optimistic cache mutators for the dashboard. Every logging surface uses
 * these instead of refetching, which is the core of the "instant" feel.
 */
export function useDashboardActions() {
  const qc = useQueryClient()

  const patchToday = useCallback(
    (patch: TodayPatch) => {
      qc.setQueryData<DashboardData | null>(DASHBOARD_KEY, (prev) =>
        applyTodayPatch(prev, patch)
      )
    },
    [qc]
  )

  /** Apply parsed quick-log items (food + workout) to today's totals + logs. */
  const applyQuickLogItems = useCallback(
    (items: QuickLogResult[]) => {
      patchToday((today) => {
        const next = { ...today }
        const dietLogs = [...next.diet_logs]
        const workoutLogs = [...next.workout_logs]
        const foodIds = new Set(dietLogs.map((log) => log.id))
        const workoutIds = new Set(workoutLogs.map((log) => log.id))
        const nowIso = new Date().toISOString()
        for (const item of items) {
          if (item.kind === 'food') {
            if (foodIds.has(item.id)) continue
            foodIds.add(item.id)
            dietLogs.push({
              id: item.id,
              food_name: item.name,
              calories: item.calories,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fat,
              logged_at: nowIso,
            })
            next.total_calories += item.calories
            next.total_protein += item.protein
            next.total_carbs += item.carbs
            next.total_fat += item.fat
          } else {
            if (workoutIds.has(item.id)) continue
            workoutIds.add(item.id)
            workoutLogs.push({
              id: item.id,
              workout_name: item.name,
              sets: item.sets,
              duration_minutes: item.durationMinutes,
              calories_burned: item.caloriesBurned,
              logged_at: nowIso,
            })
            next.calories_burned += item.caloriesBurned
            next.workout_duration += item.durationMinutes
          }
        }
        next.diet_logs = dietLogs
        next.workout_logs = workoutLogs
        return next
      })
    },
    [patchToday]
  )

  const applyDietLog = useCallback(
    (item: DietLogItem) => {
      patchToday((today) => ({
        ...today,
        total_calories: today.total_calories + item.calories,
        total_protein: today.total_protein + item.protein,
        total_carbs: today.total_carbs + item.carbs,
        total_fat: today.total_fat + item.fat,
        diet_logs: [...today.diet_logs, item],
      }))
    },
    [patchToday]
  )

  const applyWorkoutLog = useCallback(
    (item: WorkoutLogItem) => {
      patchToday((today) => ({
        ...today,
        calories_burned: today.calories_burned + item.calories_burned,
        workout_duration: today.workout_duration + item.duration_minutes,
        workout_logs: [...today.workout_logs, item],
      }))
    },
    [patchToday]
  )

  /** Background refetch — used when we don't have the delta locally. */
  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: DASHBOARD_KEY })
  }, [qc])

  return {
    patchToday,
    applyQuickLogItems,
    applyDietLog,
    applyWorkoutLog,
    invalidate,
  }
}
