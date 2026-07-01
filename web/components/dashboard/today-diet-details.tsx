'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getNutritionByDate } from '@/app/actions/history'
import { MealTimeline } from '@/components/nutrition/meal-timeline'
import { Skeleton } from '@/components/ui/skeleton'
import { getTodayDate } from '@/lib/utils/date'

interface TodayDietDetailsProps {
  userId?: string
  /** Reconcile the dashboard (rings/macros) after an edit in the meal list. */
  onDietChanged?: () => void
}

/**
 * Inline "today's detailed diet" list shown when the home overview card is
 * expanded. Reuses the History nutrition query (`['nutrition', today]` +
 * `getNutritionByDate`) so the cache stays in sync with the History tab, and
 * renders the editable <MealTimeline>. On any edit/delete it invalidates that
 * key and lets the parent reconcile the dashboard rings.
 */
export function TodayDietDetails({ userId, onDietChanged }: TodayDietDetailsProps) {
  const qc = useQueryClient()
  const today = getTodayDate()
  const nutritionKey = ['nutrition', today] as const

  const { data, isLoading } = useQuery({
    queryKey: nutritionKey,
    queryFn: () => getNutritionByDate(today),
    enabled: !!userId,
  })

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="max-h-[44vh] overflow-y-auto overflow-x-hidden rounded-xl pr-1">
      <MealTimeline
        logs={data?.dietLogs ?? []}
        userId={userId}
        onChange={() => {
          void qc.invalidateQueries({ queryKey: nutritionKey })
          onDietChanged?.()
        }}
      />
    </div>
  )
}
