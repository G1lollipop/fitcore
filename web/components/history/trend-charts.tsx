// web/components/history/trend-charts.tsx
'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import { useT } from '@/lib/i18n/provider'
import type { WorkoutLogItem } from '@/app/actions/types'
import type { NutritionDayData } from '@/app/actions/history'
import { toLocalDateStr } from '@/lib/utils/date'
import { sumMacros } from '@/lib/metrics/macros'

const toDateStr = toLocalDateStr

interface TrendChartsProps {
  date: Date
  dietWeekData?: Record<string, NutritionDayData>
  workoutWeekData?: Record<string, WorkoutLogItem[]>
  todayStr: string
}

function buildDietChartData(
  todayStr: string,
  weekData: Record<string, NutritionDayData> | undefined
) {
  const data: Array<{
    date: string
    label: string
    calories: number
    protein: number
    carbs: number
    fat: number
    goal: number
  }> = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(`${todayStr}T12:00:00`)
    date.setDate(date.getDate() - i)
    const dateStr = toLocalDateStr(date)
    const day = weekData?.[dateStr]
    const totals = sumMacros(day?.dietLogs ?? [])
    data.push({
      date: dateStr,
      label: date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
      calories: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      goal: day?.goals.calories ?? 0,
    })
  }
  return data
}

function buildWorkoutChartData(
  todayStr: string,
  weekData: Record<string, WorkoutLogItem[]> | undefined
) {
  const data: Array<{
    date: string
    label: string
    sessions: number
    minutes: number
    kcal: number
  }> = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(`${todayStr}T12:00:00`)
    date.setDate(date.getDate() - i)
    const dateStr = toLocalDateStr(date)
    const logs = weekData?.[dateStr] ?? []
    const totals = logs.reduce(
      (acc, l) => ({
        sessions: acc.sessions + 1,
        minutes: acc.minutes + (l.duration_minutes ?? 0),
        kcal: acc.kcal + (l.calories_burned ?? 0),
      }),
      { sessions: 0, minutes: 0, kcal: 0 }
    )
    data.push({
      date: dateStr,
      label: date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
      ...totals,
    })
  }
  return data
}

export function TrendCharts({ date: _date, dietWeekData, workoutWeekData, todayStr }: TrendChartsProps) {
  const t = useT()
  const dietData = buildDietChartData(todayStr, dietWeekData)
  const workoutData = buildWorkoutChartData(todayStr, workoutWeekData)

  return (
    <div className="space-y-4">
      {/* Calories trend */}
      <div className="rounded-2xl border border-border/50 bg-card/40 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t.history.last7Days} · {t.history.caloriesTrend}
        </p>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dietData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'var(--foreground)' }}
              />
              <ReferenceLine y={dietData[0]?.goal} stroke="var(--chart-5)" strokeDasharray="5 5" strokeWidth={1} />
              <Bar dataKey="calories" name={t.common.kcal} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Macros trend */}
      <div className="rounded-2xl border border-border/50 bg-card/40 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t.history.last7Days} · {t.history.macroTrend}
        </p>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dietData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'var(--foreground)' }}
              />
              <Bar dataKey="protein" name={t.nutrition.rings.protein} fill="var(--chart-1)" stackId="macros" radius={[4, 4, 0, 0]} />
              <Bar dataKey="carbs" name={t.nutrition.rings.carbs} fill="var(--chart-2)" stackId="macros" />
              <Bar dataKey="fat" name={t.nutrition.rings.fat} fill="var(--chart-3)" stackId="macros" radius={[0, 0, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Workout trend */}
      <div className="rounded-2xl border border-border/50 bg-card/40 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t.history.last7Days} · {t.history.workoutTrend}
        </p>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={workoutData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'var(--foreground)' }}
              />
              <Bar yAxisId="left" dataKey="minutes" name={t.history.durationTrend} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="kcal" name={t.common.kcal} fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
