"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/lib/i18n/provider"
import { getWorkoutHistory } from "@/app/actions/history"
import {
  summarizeMonth,
  toDateString,
  topMuscleGroups,
} from "@/lib/training/calendar"
import { cn } from "@/lib/utils"
import { DailyLogDrawer } from "./daily-log-drawer"
import { MonthlySummary } from "./monthly-summary"
import { StreakCalendar } from "./streak-calendar"
import type { WorkoutLogItem } from "@/app/actions/types"

interface TrainingHistoryProps {
  userId?: string
  onLogSuccess?: () => void
}

const TODAY_ISO = new Date().toISOString().split('T')[0]

export function TrainingHistory({ userId, onLogSuccess }: TrainingHistoryProps) {
  const t = useT()
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [workoutData, setWorkoutData] = useState<Record<string, WorkoutLogItem[]>>({})
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const loadWorkoutData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const year = selectedMonth.getFullYear()
      const month = selectedMonth.getMonth()
      const startDate = new Date(year, month, 1)
      const endDate = new Date(year, month + 1, 0)
      const startStr = startDate.toISOString().split('T')[0]
      const endStr = endDate.toISOString().split('T')[0]

      const grouped = await getWorkoutHistory(startStr, endStr)
      setWorkoutData(grouped)
    } catch (error) {
      console.error('Failed to load workout data:', error)
    } finally {
      setLoading(false)
    }
  }, [userId, selectedMonth])

  useEffect(() => {
    if (userId) loadWorkoutData()
  }, [userId, loadWorkoutData])

  const handleMonthChange = useCallback((delta: -1 | 1) => {
    setSelectedMonth((cur) => {
      const next = new Date(cur)
      next.setMonth(cur.getMonth() + delta)
      return next
    })
  }, [])

  const handleSelectDate = useCallback((dateStr: string) => {
    setSelectedDate(dateStr)
    setDrawerOpen(true)
  }, [])

  const handleDrawerChange = useCallback(() => {
    loadWorkoutData()
    onLogSuccess?.()
  }, [loadWorkoutData, onLogSuccess])

  const summary = useMemo(() => summarizeMonth(workoutData), [workoutData])
  const muscleGroups = useMemo(() => topMuscleGroups(workoutData, 3), [workoutData])
  const trainingDays = Object.keys(workoutData).length

  const now = new Date()
  const isCurrentMonth =
    selectedMonth.getFullYear() === now.getFullYear() &&
    selectedMonth.getMonth() === now.getMonth()

  // This-week rollup (Mon→Sun) from the already-loaded month data. A different
  // timeframe than the monthly summary, so it adds glanceable recency without
  // duplicating it. Only meaningful while viewing the current month.
  const week = useMemo(() => {
    const weekDates = currentWeekDateStrings()
    let sessions = 0
    let minutes = 0
    let calories = 0
    let days = 0
    for (const dateStr of weekDates) {
      const logs = workoutData[dateStr]
      if (!logs || logs.length === 0) continue
      days += 1
      sessions += logs.length
      minutes += logs.reduce((s, w) => s + (w.duration_minutes ?? 0), 0)
      calories += logs.reduce((s, w) => s + (w.calories_burned ?? 0), 0)
    }
    return { sessions, minutes, calories, days }
  }, [workoutData])

  const drawerLogs = selectedDate ? workoutData[selectedDate] ?? [] : []

  return (
    <div className="space-y-5 md:space-y-6">
      {loading ? (
        <TrainingSkeleton />
      ) : (
        <>
          {isCurrentMonth && (
            <WeekSummary
              label={t.training.thisWeek.title}
              days={week.days}
              daysLabel={t.training.thisWeek.activeDays}
              minutes={week.minutes}
              minutesLabel={t.training.summary.totalDuration}
              calories={week.calories}
              caloriesLabel={t.training.summary.totalCalories}
            />
          )}

          <MonthlySummary
            month={selectedMonth}
            totalMinutes={summary.totalDuration}
            totalCalories={summary.totalCalories}
            trainingDays={trainingDays}
            topGroups={muscleGroups}
          />

          <StreakCalendar
            month={selectedMonth}
            workoutData={workoutData}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            onMonthChange={handleMonthChange}
          />

          {/* Quick affordance: open today's drawer without scanning the grid. */}
          <button
            type="button"
            onClick={() => handleSelectDate(TODAY_ISO)}
            className="w-full rounded-2xl border border-dashed border-border bg-card/40 px-5 py-4 text-left text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-card hover:text-foreground"
          >
            {t.training.todayRecord}
            <span className="ml-2 text-xs text-muted-foreground">
              {t.training.todayRecordHint}
            </span>
          </button>
        </>
      )}

      <DailyLogDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) setSelectedDate(null)
        }}
        dateStr={selectedDate}
        logs={drawerLogs}
        userId={userId}
        onChange={handleDrawerChange}
      />
    </div>
  )
}

/** ISO date strings for the current Monday→Sunday week, in local time. */
function currentWeekDateStrings(): string[] {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toDateString(d.getFullYear(), d.getMonth(), d.getDate())
  })
}

interface WeekSummaryProps {
  label: string
  days: number
  daysLabel: string
  minutes: number
  minutesLabel: string
  calories: number
  caloriesLabel: string
}

/** Compact this-week strip: active days / total minutes / calories burned. */
function WeekSummary({
  label,
  days,
  daysLabel,
  minutes,
  minutesLabel,
  calories,
  caloriesLabel,
}: WeekSummaryProps) {
  const t = useT()
  const cells: { value: string; label: string }[] = [
    { value: String(days), label: daysLabel },
    { value: `${minutes}`, label: minutesLabel },
    { value: calories.toLocaleString(), label: caloriesLabel },
  ]
  return (
    <section className="glass glass-highlight rounded-2xl p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            className={cn('text-center', i < cells.length - 1 && 'border-r border-border/50')}
          >
            <p className="font-display text-xl font-semibold tabular-nums leading-none text-foreground">
              {cell.value}
              {i === 1 && (
                <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">
                  {t.common.minutes}
                </span>
              )}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{cell.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function TrainingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="glass rounded-2xl p-6">
        <Skeleton className="mb-4 h-5 w-40" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        <Skeleton className="mt-5 h-2 w-full rounded-full" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      </div>
      <div className="glass rounded-2xl p-5">
        <Skeleton className="mb-4 h-5 w-32" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
