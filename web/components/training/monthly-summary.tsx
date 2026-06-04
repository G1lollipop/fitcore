'use client'

import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Clock, Flame, Calendar as CalendarIcon, Activity } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { type MuscleGroupStat, type MuscleGroup } from '@/lib/training/calendar'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'

interface MonthlySummaryProps {
  month: Date
  totalMinutes: number
  totalCalories: number
  trainingDays: number
  topGroups: MuscleGroupStat[]
  className?: string
}

const MUSCLE_COLOR: Record<MuscleGroup, string> = {
  chest: 'var(--color-chart-3)',
  back: 'var(--color-chart-2)',
  legs: 'var(--color-primary)',
  shoulders: 'var(--color-chart-5)',
  arms: 'var(--color-chart-1)',
  core: 'var(--color-chart-4)',
  cardio: 'var(--color-accent)',
  other: 'var(--color-muted-foreground)',
}

const MONTH_NAMES = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月',
] as const

/**
 * Editorial header card for the training history page. Headline reads as
 * a sentence ("本月共训练 X 小时, 燃烧 Y kcal"), with a per-muscle stacked
 * bar underneath showing the top groups.
 */
export function MonthlySummary({
  month,
  totalMinutes,
  totalCalories,
  trainingDays,
  topGroups,
  className,
}: MonthlySummaryProps) {
  const totalHoursLabel = useMemo(() => {
    const hours = totalMinutes / 60
    return hours >= 10 ? hours.toFixed(0) : hours.toFixed(1)
  }, [totalMinutes])

  const monthLabel = `${month.getFullYear()} ${MONTH_NAMES[month.getMonth()]}`

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6',
        className
      )}
    >
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Monthly Summary
          </p>
          <h2 className="font-display mt-1 text-xl font-semibold text-foreground sm:text-2xl">
            {monthLabel} 训练总览
          </h2>
        </div>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">
          数据按本地时区聚合
        </span>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat
          icon={<Clock size={14} />}
          label="累计时长"
          value={totalHoursLabel}
          unit="h"
          accent="var(--color-primary)"
          numeric={Number.parseFloat(totalHoursLabel)}
        />
        <Stat
          icon={<Flame size={14} />}
          label="消耗热量"
          value={totalCalories.toLocaleString()}
          unit="kcal"
          accent="var(--color-chart-5)"
          numeric={totalCalories}
        />
        <Stat
          icon={<CalendarIcon size={14} />}
          label="训练日数"
          value={`${trainingDays}`}
          unit="天"
          accent="var(--color-accent)"
          numeric={trainingDays}
        />
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            重点肌群
          </h3>
          {topGroups.length > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {topGroups.reduce((s, g) => s + g.minutes, 0)} 分钟 / {topGroups.length} 个部位
            </span>
          )}
        </div>

        {topGroups.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="本月还没有训练记录"
            description="点击日历某一天，或用 ⌘K 快速记录今天的训练"
            size="inset"
          />
        ) : (
          <>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
              {topGroups.map((g, i) => (
                <motion.span
                  key={g.group}
                  initial={{ width: 0 }}
                  animate={{ width: `${g.share * 100}%` }}
                  transition={{
                    duration: 0.7,
                    ease: [0.16, 1, 0.3, 1],
                    delay: i * 0.08,
                  }}
                  style={{ backgroundColor: MUSCLE_COLOR[g.group] }}
                  aria-hidden
                />
              ))}
            </div>

            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {topGroups.map((g, i) => (
                <motion.li
                  key={g.group}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.05 + i * 0.05 }}
                  className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: MUSCLE_COLOR[g.group] }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {g.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {g.minutes} 分 · {g.sessions} 次 · {Math.round(g.share * 100)}%
                    </p>
                  </div>
                </motion.li>
              ))}
            </ul>
          </>
        )}
      </div>
    </motion.section>
  )
}

interface StatProps {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
  accent: string
  numeric: number
}

/**
 * One statistic block in the summary grid. Counter tweens on mount/value
 * change using the same easing curve as the rest of the redesign.
 */
function Stat({ icon, label, value, unit, accent, numeric }: StatProps) {
  return (
    <div
      className="rounded-xl border border-border bg-secondary/30 p-3"
      style={{ borderTopColor: accent, borderTopWidth: 2 }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <p className="font-display mt-1 text-2xl font-semibold tabular-nums text-foreground">
        <AnimatedNumeric value={numeric} fallback={value} />
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          {unit}
        </span>
      </p>
    </div>
  )
}

interface AnimatedNumericProps {
  value: number
  /** Pre-formatted string (e.g. "1,234"); used only after the tween settles. */
  fallback: string
}

function AnimatedNumeric({ value, fallback }: AnimatedNumericProps) {
  const mv = useMotionValue(0)
  const rounded = useTransform(mv, (v) => v)
  const [display, setDisplay] = useState(0)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    setSettled(false)
    const ctrl = animate(mv, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onComplete: () => setSettled(true),
    })
    const unsub = rounded.on('change', (v) => setDisplay(v))
    return () => {
      ctrl.stop()
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  if (settled) return <>{fallback}</>
  // Use one decimal for sub-10 values so "1.5h" doesn't snap to "2h" mid-tween.
  const isFractional = value < 10 && !Number.isInteger(value)
  return <>{isFractional ? display.toFixed(1) : Math.round(display).toLocaleString()}</>
}
