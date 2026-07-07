'use client'

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { NutritionDayData } from '@/app/actions/history'
import type { DietLogItem, WorkoutLogItem } from '@/app/actions/types'
import type { QuickLogFoodResult } from '@/app/actions/quickLog'

/**
 * React Query keys for the History page, matched to the queries in
 * `diet-day-section.tsx` (`['nutrition', dateStr]`) and
 * `workout-day-section.tsx` (`['workouts', dateStr]`). Centralised here so the
 * logging surfaces (home Quick Log, add-food, add-workout) can patch and
 * invalidate the same day the History tab reads without stringly-typed drift.
 */
export const nutritionKey = (dateStr: string) => ['nutrition', dateStr] as const
export const workoutsKey = (dateStr: string) => ['workouts', dateStr] as const

const FALLBACK_GOALS = { calories: 2500, protein: 150, carbs: 300, fat: 80 } as const

/**
 * Optimistic cache mutators + invalidation for the History day caches.
 *
 * These mirror `useDashboardActions` (which owns the home "today" cache): the
 * logging surfaces patch the visible day instantly (a `pending: true`
 * placeholder while the model runs, then the resolved rows) and reconcile
 * against the server via `invalidateDate`.
 */
export function useHistoryActions() {
  const qc = useQueryClient()

  const patchNutrition = useCallback(
    (dateStr: string, fn: (logs: DietLogItem[]) => DietLogItem[]) => {
      qc.setQueryData<NutritionDayData>(nutritionKey(dateStr), (old) => ({
        goals: old?.goals ?? { ...FALLBACK_GOALS },
        dietLogs: fn(old?.dietLogs ?? []),
      }))
    },
    [qc]
  )

  const patchWorkouts = useCallback(
    (dateStr: string, fn: (logs: WorkoutLogItem[]) => WorkoutLogItem[]) => {
      qc.setQueryData<WorkoutLogItem[]>(workoutsKey(dateStr), (old) => fn(old ?? []))
    },
    [qc]
  )

  /** Insert a pending food placeholder into a day's nutrition cache. */
  const addPendingFood = useCallback(
    (dateStr: string, item: DietLogItem) => {
      patchNutrition(dateStr, (logs) => [...logs, item])
    },
    [patchNutrition]
  )

  /** Remove a food row (used to drop a failed placeholder). */
  const removeFood = useCallback(
    (dateStr: string, id: string) => {
      patchNutrition(dateStr, (logs) => logs.filter((d) => d.id !== id))
    },
    [patchNutrition]
  )

  /** Insert a pending workout placeholder into a day's workout cache. */
  const addPendingWorkout = useCallback(
    (dateStr: string, item: WorkoutLogItem) => {
      patchWorkouts(dateStr, (logs) => [...logs, item])
    },
    [patchWorkouts]
  )

  const removeWorkout = useCallback(
    (dateStr: string, id: string) => {
      patchWorkouts(dateStr, (logs) => logs.filter((w) => w.id !== id))
    },
    [patchWorkouts]
  )

  /**
   * Swap a resolved food row into place (matched by its temp placeholder id).
   * `next === null` removes the placeholder.
   */
  const replaceFood = useCallback(
    (dateStr: string, tempId: string, next: DietLogItem | null) => {
      patchNutrition(dateStr, (logs) => {
        const filtered = logs.filter((d) => d.id !== tempId)
        return next ? [...filtered, next] : filtered
      })
    },
    [patchNutrition]
  )

  const replaceWorkout = useCallback(
    (dateStr: string, tempId: string, next: WorkoutLogItem | null) => {
      patchWorkouts(dateStr, (logs) => {
        const filtered = logs.filter((w) => w.id !== tempId)
        return next ? [...filtered, next] : filtered
      })
    },
    [patchWorkouts]
  )

  /**
   * Reconcile a resolved quick-log against a day: drop the generic pending
   * placeholder, then splice the parsed foods/workouts into their caches so the
   * items are visible (and editable) the instant the user opens History.
   */
  const applyResolvedQuickLog = useCallback(
    (dateStr: string, tempId: string, items: QuickLogFoodResult[]) => {
      const nowIso = new Date().toISOString()
      const foods: DietLogItem[] = []
      for (const item of items) {
        foods.push({
          id: item.id,
          food_name: item.name,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          logged_at: nowIso,
        })
      }
      patchNutrition(dateStr, (logs) => [...logs.filter((d) => d.id !== tempId), ...foods])
    },
    [patchNutrition]
  )

  /** Background refetch of both day caches to reconcile against the server. */
  const invalidateDate = useCallback(
    (dateStr: string) => {
      void qc.invalidateQueries({ queryKey: nutritionKey(dateStr) })
      void qc.invalidateQueries({ queryKey: workoutsKey(dateStr) })
    },
    [qc]
  )

  return {
    patchNutrition,
    patchWorkouts,
    addPendingFood,
    removeFood,
    addPendingWorkout,
    removeWorkout,
    replaceFood,
    replaceWorkout,
    applyResolvedQuickLog,
    invalidateDate,
  }
}
