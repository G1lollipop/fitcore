'use client'

import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '@/lib/i18n/provider'
import { toLocalDateStr } from '@/lib/utils/date'
import { getNutritionRange } from '@/app/actions/history'
import { getWorkoutHistory } from '@/app/actions/history'
import { DietDaySection } from './diet-day-section'
import { WorkoutDaySection } from './workout-day-section'

interface HistoryCenterProps {
  userId?: string
  onLogSuccess?: () => void
}

const toDateStr = toLocalDateStr

function subDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() - days)
  return toDateStr(date)
}

/**
 * Combined history: one shared date selector with compact, expandable cards
 * for the day's nutrition and training. The last 7 days are batch-fetched up
 * front so trend charts and day switching feel instant.
 */
export function HistoryCenter({ userId, onLogSuccess }: HistoryCenterProps) {
  const t = useT()
  const qc = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(new Date())

  const todayStr = toDateStr(new Date())
  const selectedStr = toDateStr(selectedDate)
  const isToday = selectedStr === todayStr
  const isFuture = selectedStr > todayStr
  const weekStart = useMemo(() => subDaysStr(todayStr, 6), [todayStr])

  const shiftDay = (delta: number) => {
    setSelectedDate((cur) => {
      const next = new Date(cur)
      next.setDate(cur.getDate() + delta)
      return next
    })
  }

  const nutritionQuery = useQuery({
    queryKey: ['nutrition', 'range', weekStart, todayStr],
    queryFn: () => getNutritionRange(weekStart, todayStr),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  })

  const workoutQuery = useQuery({
    queryKey: ['workouts', 'range', weekStart, todayStr],
    queryFn: () => getWorkoutHistory(weekStart, todayStr),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  })

  // Seed the per-day caches so any downstream consumers (and the sections on
  // first paint) read from React Query instead of firing individual requests.
  useEffect(() => {
    if (nutritionQuery.data) {
      for (const [date, data] of Object.entries(nutritionQuery.data)) {
        qc.setQueryData(['nutrition', date], data)
      }
    }
  }, [nutritionQuery.data, qc])

  useEffect(() => {
    if (workoutQuery.data) {
      for (const [date, logs] of Object.entries(workoutQuery.data)) {
        qc.setQueryData(['workouts', date], logs)
      }
    }
  }, [workoutQuery.data, qc])

  const loadingWeek = nutritionQuery.isLoading || workoutQuery.isLoading

  return (
    <div className="space-y-2">
      {/* Compact date pill — minimal vertical footprint so both cards fit on one
          mobile screen without scrolling. */}
      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => shiftDay(-1)}
          aria-label={t.nutrition.prevDay}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft size={14} />
        </button>

        <label className="relative cursor-pointer rounded-full border border-border/60 bg-secondary/50 px-3 py-1 text-center transition-colors hover:bg-secondary">
          <span className="text-xs font-medium text-foreground tabular-nums">
            {selectedDate.toLocaleDateString(t.common.locale, {
              month: 'short',
              day: 'numeric',
              weekday: 'short',
            })}
          </span>
          <input
            type="date"
            value={toDateStr(selectedDate)}
            max={toDateStr(new Date())}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(new Date(`${e.target.value}T12:00:00`))
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={t.history.title}
          />
        </label>

        <button
          type="button"
          onClick={() => shiftDay(1)}
          disabled={isFuture}
          aria-label={t.nutrition.nextDay}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          <ChevronRight size={14} />
        </button>

        {!isToday && (
          <button
            type="button"
            onClick={() => setSelectedDate(new Date())}
            aria-label={t.nutrition.backToToday}
            className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
          >
            <CalendarDays size={14} />
          </button>
        )}
      </div>

      <DietDaySection
        date={selectedDate}
        userId={userId}
        onChange={onLogSuccess}
        weekData={nutritionQuery.data}
        isLoadingWeek={loadingWeek}
      />
      <WorkoutDaySection
        date={selectedDate}
        userId={userId}
        onChange={onLogSuccess}
        weekData={workoutQuery.data}
        isLoadingWeek={loadingWeek}
      />
    </div>
  )
}
