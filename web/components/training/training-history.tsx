"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from "@/lib/supabaseClient"
import {
  summarizeMonth,
  topMuscleGroups,
} from "@/lib/training/calendar"
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

      const { data, error } = await supabase
        .from('daily_stats')
        .select('date, workout_logs, workout_duration, calories_burned')
        .eq('user_id', userId)
        .gte('date', startStr)
        .lte('date', endStr)
        .gt('workout_duration', 0)

      if (error) {
        console.error('加载训练数据失败:', error)
        return
      }

      const grouped: Record<string, WorkoutLogItem[]> = {}
      data?.forEach((row: any) => {
        const logs = (row.workout_logs as WorkoutLogItem[] | null) ?? []
        if (logs.length > 0) {
          grouped[row.date] = logs
        }
      })
      setWorkoutData(grouped)
    } catch (error) {
      console.error('加载训练数据失败:', error)
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

  const drawerLogs = selectedDate ? workoutData[selectedDate] ?? [] : []

  return (
    <div className="space-y-5 md:space-y-6">
      {loading ? (
        <TrainingSkeleton />
      ) : (
        <>
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
            今日记录 →
            <span className="ml-2 text-xs text-muted-foreground">
              点击打开右侧抽屉，添加或查看今日训练
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

function TrainingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-6">
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
      <div className="rounded-2xl border border-border bg-card p-5">
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
