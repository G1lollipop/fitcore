'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import { toLocalDateStr } from '@/lib/utils/date'
import { DietDaySection } from './diet-day-section'
import { WorkoutDaySection } from './workout-day-section'

interface HistoryCenterProps {
  userId?: string
  onLogSuccess?: () => void
}

const toDateStr = toLocalDateStr

/**
 * Combined history: one shared date selector with the day's nutrition and
 * training stacked together (replaces the separate Nutrition + Training-history
 * tabs). Logging the current day still happens primarily via the home Quick Log;
 * here you review past days and back-fill / correct entries.
 */
export function HistoryCenter({ userId, onLogSuccess }: HistoryCenterProps) {
  const t = useT()
  const [selectedDate, setSelectedDate] = useState(new Date())

  // Compare by the same local (Asia/Shanghai) calendar day the write path and
  // the day sections use, so "today" and "future" agree with the logged rows
  // near midnight instead of drifting via UTC.
  const todayStr = toDateStr(new Date())
  const selectedStr = toDateStr(selectedDate)
  const isToday = selectedStr === todayStr
  const isFuture = selectedStr > todayStr

  const shiftDay = (delta: number) => {
    setSelectedDate((cur) => {
      const next = new Date(cur)
      next.setDate(cur.getDate() + delta)
      return next
    })
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Slim shared date navigator — a single compact row instead of a full
          glass card, so it barely costs any vertical space on mobile. */}
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => shiftDay(-1)}
          aria-label={t.nutrition.prevDay}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft size={16} />
        </button>

        <label className="relative cursor-pointer rounded-lg px-2.5 py-1 text-center transition-colors hover:bg-secondary/60">
          <span className="text-sm font-medium text-foreground tabular-nums">
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
              // Anchor at local noon so formatting the picked day back to a
              // date string can't slip to an adjacent day across time zones.
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
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>

        {!isToday && (
          <button
            type="button"
            onClick={() => setSelectedDate(new Date())}
            className="ml-1 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:underline"
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
