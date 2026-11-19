'use client'

import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useT } from '@/lib/i18n/provider'
import { addDays, formatCalendarDate, getTodayDate, isDateStr } from '@/lib/utils/date'
import { getNutritionRange, getWorkoutHistory } from '@/app/actions/history'
import { WeeklySummaryBar } from './weekly-summary-bar'
import { DayTimeline } from './day-timeline'
import { TrendCharts } from './trend-charts'
// REMOVED: DietDaySection, WorkoutDaySection imports

interface HistoryCenterProps {
  userId?: string
  onLogSuccess?: () => void
}

export function HistoryCenter({ userId, onLogSuccess }: HistoryCenterProps) {
  const t = useT()
  const qc = useQueryClient()
  // The selected day is a calendar date in the app time zone, kept as a
  // `YYYY-MM-DD` string. Not a `Date`: stepping a `Date` by a day, or building
  // one from the picker's value, follows the browser's zone and can land on a
  // different day than the one the logs are stored under.
  const todayStr = getTodayDate()
  const [selectedStr, setSelectedStr] = useState(todayStr)
  const [trendsOpen, setTrendsOpen] = useState(false)

  const isToday = selectedStr === todayStr
  const isFuture = selectedStr > todayStr
  const weekStart = useMemo(() => addDays(todayStr, -6), [todayStr])

  const shiftDay = (delta: number) => {
    setSelectedStr((cur) => addDays(cur, delta))
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

  // The week queries only cover the last 7 days; the date picker reaches any
  // earlier day, which is loaded on its own (under the same `range` prefix,
  // so the logging surfaces' invalidation refreshes it too).
  const outsideWeek = selectedStr < weekStart
  const dayNutritionQuery = useQuery({
    queryKey: ['nutrition', 'range', selectedStr, selectedStr],
    queryFn: () => getNutritionRange(selectedStr, selectedStr),
    enabled: !!userId && outsideWeek,
    staleTime: 5 * 60 * 1000,
  })
  const dayWorkoutQuery = useQuery({
    queryKey: ['workouts', 'range', selectedStr, selectedStr],
    queryFn: () => getWorkoutHistory(selectedStr, selectedStr),
    enabled: !!userId && outsideWeek,
    staleTime: 5 * 60 * 1000,
  })

  const dietData = (outsideWeek ? dayNutritionQuery.data : nutritionQuery.data)?.[selectedStr]
  const workoutLogs = (outsideWeek ? dayWorkoutQuery.data : workoutQuery.data)?.[selectedStr]

  return (
    <div className="flex flex-col gap-2">
      {/* Weekly summary bar */}
      <WeeklySummaryBar
        dietWeekData={nutritionQuery.data}
        workoutWeekData={workoutQuery.data}
        todayStr={todayStr}
        onOpenTrends={() => setTrendsOpen(true)}
      />

      {/* Date selector */}
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
            {formatCalendarDate(selectedStr, t.common.locale, {
              month: 'short',
              day: 'numeric',
              weekday: 'short',
            })}
          </span>
          <input
            type="date"
            value={selectedStr}
            max={todayStr}
            onChange={(e) => {
              if (isDateStr(e.target.value)) setSelectedStr(e.target.value)
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
            onClick={() => setSelectedStr(getTodayDate())}
            aria-label={t.nutrition.backToToday}
            className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
          >
            <CalendarDays size={14} />
          </button>
        )}
      </div>

      {/* Day timeline card */}
      <div className="glass glass-highlight max-h-[calc(100dvh-18rem)] overflow-y-auto rounded-2xl p-3">
        <DayTimeline
          dateStr={selectedStr}
          userId={userId}
          dietData={dietData}
          workoutLogs={workoutLogs}
          onChange={onLogSuccess}
        />
      </div>

      {/* Trend charts sheet */}
      <Sheet open={trendsOpen} onOpenChange={setTrendsOpen}>
        <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl p-0">
          <SheetHeader className="px-4 pt-5 pb-2">
            <SheetTitle className="font-display text-lg">7-Day Trends</SheetTitle>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
            <TrendCharts
              dietWeekData={nutritionQuery.data}
              workoutWeekData={workoutQuery.data}
              todayStr={todayStr}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
