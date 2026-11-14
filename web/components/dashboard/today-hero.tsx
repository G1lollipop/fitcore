'use client'

import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/provider'
import { formatCalendarDate, getTodayDate } from '@/lib/utils/date'

interface TodayHeroProps {
  kcalIntake?: number
  kcalGoal?: number
  className?: string
  /** Render without the outer glass card (for embedding in a combined card). */
  embedded?: boolean
}

const RADIUS = 56
const STROKE = 10
const SVG_SIZE = 132
const CENTER = SVG_SIZE / 2

const CIRC = 2 * Math.PI * RADIUS

function clamp01(v: number) {
  if (!isFinite(v) || v <= 0) return 0
  return v >= 1 ? 1 : v
}

/** Today's heading, for the app's calendar day rather than the browser's. */
function formatToday(locale: string): string {
  return formatCalendarDate(getTodayDate(), locale, {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

/**
 * Animates a numeric counter from 0 → target on mount.
 * Decoupled hook so each ticker has its own MotionValue.
 */
function useTickUp(target: number, duration = 1.1) {
  const mv = useMotionValue(0)
  const rounded = useTransform(mv, (v) => Math.round(v))
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const controls = animate(mv, target, { duration, ease: [0.16, 1, 0.3, 1] })
    const unsub = rounded.on('change', (v) => setDisplay(v))
    return () => {
      controls.stop()
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return display
}

export function TodayHero({
  kcalIntake = 0,
  kcalGoal = 2500,
  className,
  embedded = false,
}: TodayHeroProps) {
  const t = useT()
  const intakeRatio = kcalIntake / Math.max(1, kcalGoal)
  // The ring itself can only fill to 100%, so its arc uses the clamped value.
  const intakePct = clamp01(intakeRatio)

  const displayIntake = useTickUp(kcalIntake)

  const offset = CIRC * (1 - intakePct)

  // Color shifts green → orange → red as intake approaches / exceeds goal.
  // Compare the unclamped ratio: the clamped one never exceeds 1, which left
  // the over-goal red unreachable.
  const ringColor =
    intakeRatio > 1
      ? 'var(--chart-5)'
      : intakeRatio >= 0.7
        ? 'var(--chart-3)'
        : 'var(--chart-2)'

  const body = (
    <>
      <header className="relative flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-foreground">
          {formatToday(t.common.locale)}
        </h2>
      </header>

      <div className="relative flex items-center justify-center">
        <div className="relative shrink-0" style={{ width: SVG_SIZE, height: SVG_SIZE }}>
          <svg
            width={SVG_SIZE}
            height={SVG_SIZE}
            viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
            className="rotate-[-90deg]"
            aria-hidden
          >
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="var(--color-secondary)"
              strokeWidth={STROKE}
            />
            <motion.circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={ringColor}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              initial={{ strokeDashoffset: CIRC }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {displayIntake.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-foreground">
              / {kcalGoal.toLocaleString()} kcal
            </span>
          </div>
        </div>
      </div>
    </>
  )

  if (embedded) {
    return <div className="flex flex-col gap-2">{body}</div>
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'glass glass-highlight relative overflow-hidden rounded-2xl p-4',
        'flex flex-col gap-3',
        className
      )}
    >
      <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-primary/5 blur-3xl" aria-hidden />
      <div className="absolute -bottom-24 -left-12 h-48 w-48 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      {body}
    </motion.section>
  )
}
