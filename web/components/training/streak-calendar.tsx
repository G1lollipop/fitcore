'use client'

import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Flame } from 'lucide-react'
import { useMemo } from 'react'
import {
  generateCalendarDays,
  computeStreaks,
  type CalendarDay,
  type StreakInfo,
  type WorkoutLogLike,
} from '@/lib/training/calendar'
import { cn } from '@/lib/utils'

interface StreakCalendarProps {
  month: Date
  workoutData: Record<string, WorkoutLogLike[]>
  selectedDate: string | null
  onSelectDate: (dateStr: string) => void
  onMonthChange: (delta: -1 | 1) => void
  className?: string
}

const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'] as const
const MONTH_NAMES = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月',
] as const

const TODAY_ISO = new Date().toISOString().split('T')[0]

/**
 * Map a streak length to a visual intensity tier 0..3.
 * Larger streaks get bolder fill + more pronounced glow.
 */
function streakTier(length: number): 0 | 1 | 2 | 3 {
  if (length <= 1) return 0
  if (length <= 3) return 1
  if (length <= 6) return 2
  return 3
}

const TIER_BG = ['bg-primary/35', 'bg-primary/55', 'bg-primary/75', 'bg-primary'] as const
const TIER_TEXT = [
  'text-primary-foreground/85',
  'text-primary-foreground/90',
  'text-primary-foreground',
  'text-primary-foreground',
] as const
// Outer glow gets stronger as the streak lengthens; tier 3 picks up the
// accent (lime) for that "you're on a roll" payoff.
const TIER_SHADOW = [
  'shadow-none',
  'shadow-[0_0_0_2px_color-mix(in_oklch,var(--color-primary)_22%,transparent)]',
  'shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-primary)_32%,transparent)]',
  'shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-accent)_55%,transparent)]',
] as const

/**
 * Calendar grid with consecutive-day "streak coloring". Workout days are
 * filled with the primary color, intensified by streak length, and adjacent
 * cells in the same row visually merge by dropping the inner rounded corners
 * — so a Mon-Tue-Wed run reads as a single "bar" rather than three pills.
 *
 * Tapping any day calls `onSelectDate`, leaving the rest of the page intact;
 * the parent uses that to open the side drawer.
 */
export function StreakCalendar({
  month,
  workoutData,
  selectedDate,
  onSelectDate,
  onMonthChange,
  className,
}: StreakCalendarProps) {
  const calendarDays = useMemo(
    () => generateCalendarDays(month, workoutData),
    [month, workoutData]
  )
  const streaks = useMemo(() => computeStreaks(workoutData), [workoutData])
  const longestStreak = useMemo(
    () => Object.values(streaks).reduce((m, s) => Math.max(m, s.length), 0),
    [streaks]
  )

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-card shadow-sm',
        className
      )}
    >
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarIcon size={16} />
          </span>
          <div>
            <h3 className="font-display text-base font-semibold text-foreground">
              训练日历
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {longestStreak > 1 ? (
                <>
                  本月最长连击{' '}
                  <span className="font-medium text-primary">{longestStreak} 天</span>
                </>
              ) : (
                '点击日期查看当日训练'
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMonthChange(-1)}
            aria-label="上个月"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[5rem] text-center text-sm font-medium tabular-nums">
            {month.getFullYear()} {MONTH_NAMES[month.getMonth()]}
          </span>
          <button
            type="button"
            onClick={() => onMonthChange(1)}
            aria-label="下个月"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      <div className="px-3 pb-4 pt-3 sm:px-4">
        <div className="mb-1 grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEK_DAYS.map((d) => (
            <div
              key={d}
              className="py-1.5 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {calendarDays.map((dayData, index) => (
            <DayCell
              key={index}
              day={dayData}
              streak={dayData.dateStr ? streaks[dayData.dateStr] : undefined}
              prevStreak={
                index > 0 && index % 7 !== 0
                  ? streaks[calendarDays[index - 1]?.dateStr]
                  : undefined
              }
              nextStreak={
                index < calendarDays.length - 1 && (index + 1) % 7 !== 0
                  ? streaks[calendarDays[index + 1]?.dateStr]
                  : undefined
              }
              isSelected={dayData.dateStr === selectedDate}
              onSelect={() => dayData.dateStr && onSelectDate(dayData.dateStr)}
            />
          ))}
        </div>

        <Legend />
      </div>
    </section>
  )
}

interface DayCellProps {
  day: CalendarDay
  streak?: StreakInfo
  prevStreak?: StreakInfo
  nextStreak?: StreakInfo
  isSelected: boolean
  onSelect: () => void
}

function DayCell({ day, streak, prevStreak, nextStreak, isSelected, onSelect }: DayCellProps) {
  if (day.day === null) {
    return <div className="aspect-square" aria-hidden />
  }

  const isToday = day.dateStr === TODAY_ISO
  const hasWorkout = day.hasWorkout && streak !== undefined
  const tier = hasWorkout ? streakTier(streak!.length) : 0

  // Inner edges of a streak (where the previous or next day in the same week
  // is part of the same run) lose their rounding so adjacent cells visually
  // merge into a single bar.
  const sameStreakLeft = !!(streak && prevStreak && prevStreak.length === streak.length && prevStreak.index === streak.index - 1)
  const sameStreakRight = !!(streak && nextStreak && nextStreak.length === streak.length && nextStreak.index === streak.index + 1)

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      aria-label={`${day.dateStr}${hasWorkout ? ` · ${day.workoutCount} 次训练` : ''}`}
      className={cn(
        'group relative flex aspect-square items-center justify-center text-sm font-medium tabular-nums transition-colors',
        // Rounding logic. When merging, keep only the outer corners.
        sameStreakLeft && sameStreakRight && 'rounded-none',
        sameStreakLeft && !sameStreakRight && 'rounded-l-none rounded-r-xl',
        !sameStreakLeft && sameStreakRight && 'rounded-l-xl rounded-r-none',
        !sameStreakLeft && !sameStreakRight && 'rounded-xl',
        // Background by tier when there's a workout, else hover only.
        hasWorkout && [TIER_BG[tier], TIER_TEXT[tier], TIER_SHADOW[tier]],
        !hasWorkout && 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        // Today + selected ring layered above the fill.
        (isToday || isSelected) &&
          'outline outline-offset-[-2px] outline-2 outline-primary z-10'
      )}
    >
      <span className="relative z-10">{day.day}</span>
      {hasWorkout && day.workoutCount > 1 && (
        <span
          className="absolute right-1 top-1 flex items-center text-[9px] font-semibold opacity-80"
          aria-hidden
        >
          ×{day.workoutCount}
        </span>
      )}
      {isToday && (
        <span
          className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent"
          aria-hidden
        />
      )}
    </motion.button>
  )
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>连击强度</span>
        <div className="flex items-center gap-1">
          {([0, 1, 2, 3] as const).map((tier) => (
            <span
              key={tier}
              className={cn('h-3 w-3 rounded', TIER_BG[tier], TIER_SHADOW[tier])}
              aria-hidden
            />
          ))}
        </div>
        <span className="tabular-nums">1 → 7+ 天</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Flame size={12} className="text-accent" />
        <span>越长越亮</span>
      </div>
    </div>
  )
}
