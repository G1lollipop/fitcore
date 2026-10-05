'use client'

import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useT } from '@/lib/i18n/provider'
import { toLocalDateStr } from '@/lib/utils/date'
import { getNutritionRange, getWorkoutHistory } from '@/app/actions/history'
import { WeeklySummaryBar } from './weekly-summary-bar'
import { DayTimeline } from './day-timeline'
import { TrendCharts } from './trend-charts'
// REMOVED: DietDaySection, WorkoutDaySection imports

const toDateStr = toLocalDateStr

function subDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() - days)
  return toDateStr(date)
}

interface HistoryCenterProps {
  userId?: string
  onLogSuccess?: () => void
}

export function HistoryCenter({ userId, onLogSuccess }: HistoryCenterProps) {
  const t = useT()
  const qc = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [trendsOpen, setTrendsOpen] = useState(false)

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

  const dietData = nutritionQuery.data?.[selectedStr]
  const workoutLogs = workoutQuery.data?.[selectedStr]

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

      {/* Day timeline card */}
      <div className="glass glass-highlight max-h-[calc(100dvh-18rem)] overflow-y-auto rounded-2xl p-3">
        <DayTimeline
          date={selectedDate}
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
              date={selectedDate}
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
