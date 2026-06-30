'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import { DietDaySection } from './diet-day-section'
import { WorkoutDaySection } from './workout-day-section'

interface HistoryCenterProps {
  userId?: string
  onLogSuccess?: () => void
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

/**
 * Combined history: one shared date selector with the day's nutrition and
 * training stacked together (replaces the separate Nutrition + Training-history
 * tabs). Logging the current day still happens primarily via the home Quick Log;
 * here you review past days and back-fill / correct entries.
 */
export function HistoryCenter({ userId, onLogSuccess }: HistoryCenterProps) {
  const t = useT()
  const [selectedDate, setSelectedDate] = useState(new Date())

  const isToday = selectedDate.toDateString() === new Date().toDateString()
  const isFuture = selectedDate > new Date() && !isToday

  const shiftDay = (delta: number) => {
    setSelectedDate((cur) => {
      const next = new Date(cur)
      next.setDate(cur.getDate() + delta)
      return next
    })
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Shared date navigator */}
      <div className="glass glass-highlight flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            aria-label={t.nutrition.prevDay}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft size={18} />
          </button>

          <label className="relative min-w-[10rem] cursor-pointer rounded-xl bg-secondary/60 px-4 py-2 text-center">
            <span className="text-sm font-medium text-foreground tabular-nums">
              {selectedDate.toLocaleDateString(t.common.locale, {
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              })}
            </span>
            <input
              type="date"
              value={toDateStr(selectedDate)}
              max={toDateStr(new Date())}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(new Date(`${e.target.value}T00:00:00`))
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
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {!isToday && (
          <button
            type="button"
            onClick={() => setSelectedDate(new Date())}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t.nutrition.backToToday}
          </button>
        )}
      </div>

      <DietDaySection date={selectedDate} userId={userId} onChange={onLogSuccess} />
      <WorkoutDaySection date={selectedDate} userId={userId} onChange={onLogSuccess} />
    </div>
  )
}
