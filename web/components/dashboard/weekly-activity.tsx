'use client'

import { motion } from 'framer-motion'
import { Flame, UtensilsCrossed } from 'lucide-react'
import type { WeeklyTrendData, WeeklyTrendDay } from '@/app/actions/types'
import { cn } from '@/lib/utils'

interface WeeklyActivityProps {
  data?: WeeklyTrendData
}

const FALLBACK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
}

const cellVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } },
}

/**
 * Weekly trend heat-row: each cell shows the day's intake (primary) and burn
 * (accent) as stacked mini-bars, with a backing tint that scales with the
 * higher of the two. Today is outlined and pulses softly.
 */
export function WeeklyActivity({ data }: WeeklyActivityProps) {
  const days: WeeklyTrendDay[] =
    data?.days ??
    FALLBACK_LABELS.map((label, i) => ({
      dateIso: '',
      dayLabel: label,
      kcalIntake: 0,
      kcalBurn: 0,
      workoutMinutes: 0,
      isToday: false,
      // Force a today on the first cell only when rendering empty fallback so
      // skeleton states stay visually centered.
      ...(i === 0 ? { isToday: true } : {}),
    }))
  const weekLabel = data?.weekLabel ?? ''
  // The peak number we scale bars against — guard against zero so the empty
  // state doesn't divide by zero.
  const max = Math.max(1, data?.maxKcal ?? 0)

  const totalIntake = days.reduce((acc, d) => acc + d.kcalIntake, 0)
  const totalBurn = days.reduce((acc, d) => acc + d.kcalBurn, 0)

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <header className="mb-5 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Weekly Trend
          </p>
          <h2 className="font-display mt-1 text-base font-semibold text-foreground">本周趋势</h2>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <Legend swatchClass="bg-primary" icon={<UtensilsCrossed size={11} />} label="摄入" />
          <Legend swatchClass="bg-accent" icon={<Flame size={11} />} label="消耗" />
          {weekLabel && <span className="ml-1">{weekLabel}</span>}
        </div>
      </header>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-7 gap-2"
      >
        {days.map((day, i) => {
          const intakeH = Math.round((day.kcalIntake / max) * 100)
          const burnH = Math.round((day.kcalBurn / max) * 100)
          const tint = Math.max(intakeH, burnH) / 100
          const empty = day.kcalIntake === 0 && day.kcalBurn === 0
          return (
            <motion.div
              key={day.dateIso || `${day.dayLabel}-${i}`}
              variants={cellVariants}
              className="flex flex-col items-center gap-2"
            >
              <div
                className={cn(
                  'relative flex h-24 w-full items-end justify-center overflow-hidden rounded-xl border transition-colors',
                  day.isToday
                    ? 'border-primary/60 bg-primary/[0.04] shadow-[0_0_0_3px_var(--color-primary)/10]'
                    : 'border-border/60'
                )}
                style={
                  empty
                    ? undefined
                    : {
                        backgroundColor: `oklch(from var(--color-primary) l c h / ${0.04 + tint * 0.08})`,
                      }
                }
              >
                <div className="flex h-full w-full items-end justify-center gap-1 px-2 pb-2">
                  <motion.div
                    className="w-2.5 rounded-t-sm bg-primary"
                    initial={{ height: 0 }}
                    animate={{ height: `${intakeH}%` }}
                    transition={{
                      duration: 0.7,
                      ease: [0.16, 1, 0.3, 1],
                      delay: 0.25 + i * 0.04,
                    }}
                  />
                  <motion.div
                    className="w-2.5 rounded-t-sm bg-accent"
                    initial={{ height: 0 }}
                    animate={{ height: `${burnH}%` }}
                    transition={{
                      duration: 0.7,
                      ease: [0.16, 1, 0.3, 1],
                      delay: 0.3 + i * 0.04,
                    }}
                  />
                </div>
                {day.isToday && (
                  <motion.span
                    aria-hidden
                    className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-primary"
                    animate={{ scale: [1, 1.25, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </div>
              <span
                className={cn(
                  'text-[11px] tabular-nums',
                  day.isToday ? 'font-semibold text-primary' : 'text-muted-foreground'
                )}
              >
                {day.dayLabel}
              </span>
            </motion.div>
          )
        })}
      </motion.div>

      <footer className="mt-5 flex items-center justify-between border-t border-border/60 pt-4 text-[11px] text-muted-foreground">
        <span>
          本周累计摄入{' '}
          <span className="font-semibold tabular-nums text-foreground">{totalIntake.toLocaleString()}</span> kcal
        </span>
        <span>
          消耗{' '}
          <span className="font-semibold tabular-nums text-foreground">{totalBurn.toLocaleString()}</span> kcal
        </span>
      </footer>
    </motion.section>
  )
}

function Legend({
  swatchClass,
  icon,
  label,
}: {
  swatchClass: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-sm', swatchClass)} />
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </span>
    </span>
  )
}
