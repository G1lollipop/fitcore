'use client'

import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import {
  macroProgressBundle,
  type MacroGoals,
  type MacroProgress,
  type MacroTotals,
} from '@/lib/metrics/macros'
import { cn } from '@/lib/utils'

interface RadialMacroChartProps {
  totals: MacroTotals
  goals: MacroGoals
  className?: string
}

type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat'

interface RingSpec {
  key: MacroKey
  label: string
  unit: string
  /** SVG radius in viewBox units (viewBox is 200×200, center 100,100). */
  radius: number
}

// Outermost → innermost. Stroke width is 9 → leaves ~3 unit gap between rings.
const RINGS: readonly RingSpec[] = [
  { key: 'calories', label: '热量', unit: 'kcal', radius: 88 },
  { key: 'protein', label: '蛋白质', unit: 'g', radius: 72 },
  { key: 'carbs', label: '碳水', unit: 'g', radius: 56 },
  { key: 'fat', label: '脂肪', unit: 'g', radius: 40 },
] as const

/**
 * Returns CSS color tokens for the ring stroke and the inline value text,
 * driven by the macro's `status`. Calories/carbs/fat treat overshoot as a
 * warning (destructive), while protein treats it as a positive (accent).
 */
function ringColor(macro: MacroKey, status: MacroProgress['status']): string {
  if (status === 'on-track') return 'var(--color-primary)'
  if (status === 'under') return 'var(--color-muted-foreground)'
  // status === 'over'
  return macro === 'protein' ? 'var(--color-accent)' : 'var(--color-destructive)'
}

function statusLabel(status: MacroProgress['status']): string {
  if (status === 'on-track') return '达标'
  if (status === 'under') return '未达'
  return '已超'
}

/**
 * Concentric ring chart for the four macros. Each ring's arc length encodes
 * progress to goal; its color encodes under/on-track/over. The center reads
 * out the calorie progress as the headline number, with a compact legend
 * underneath listing each macro's current/target.
 */
export function RadialMacroChart({ totals, goals, className }: RadialMacroChartProps) {
  const progress = useMemo(() => macroProgressBundle(totals, goals), [totals, goals])

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="relative h-56 w-56 sm:h-64 sm:w-64">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
          {RINGS.map((ring) => (
            <circle
              key={`${ring.key}-track`}
              cx={100}
              cy={100}
              r={ring.radius}
              fill="none"
              stroke="var(--color-border)"
              strokeOpacity={0.45}
              strokeWidth={9}
            />
          ))}
          {RINGS.map((ring) => {
            const p = progress[ring.key]
            return (
              <RingArc
                key={ring.key}
                radius={ring.radius}
                pct={p.pct}
                color={ringColor(ring.key, p.status)}
              />
            )
          })}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            今日热量
          </span>
          <AnimatedNumber
            value={progress.calories.current}
            className="font-display mt-0.5 text-3xl font-semibold tabular-nums leading-none text-foreground sm:text-4xl"
          />
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            目标 {progress.calories.target} kcal · {progress.calories.pct}%
          </p>
        </div>
      </div>

      <div className="grid w-full max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
        {RINGS.map((ring) => {
          const p = progress[ring.key]
          const color = ringColor(ring.key, p.status)
          return (
            <div
              key={ring.key}
              className="flex flex-col gap-1 rounded-xl border border-border bg-secondary/30 px-3 py-2.5"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="text-[11px] font-medium text-muted-foreground">
                  {ring.label}
                </span>
              </div>
              <p className="font-display text-sm font-semibold tabular-nums text-foreground">
                {p.current}
                <span className="text-muted-foreground"> / {p.target}</span>
                <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
                  {ring.unit}
                </span>
              </p>
              <span
                className="self-start rounded-full px-1.5 py-px text-[10px] font-medium"
                style={{
                  backgroundColor: `color-mix(in oklch, ${color} 18%, transparent)`,
                  color,
                }}
              >
                {statusLabel(p.status)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface RingArcProps {
  radius: number
  pct: number
  color: string
}

/**
 * A circle stroked from 0..pct% of its circumference, animated with a
 * stroke-dashoffset spring. We rotate the parent <svg> by -90° so 0% sits
 * at 12 o'clock visually.
 */
function RingArc({ radius, pct, color }: RingArcProps) {
  const circumference = 2 * Math.PI * radius
  const targetOffset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100)

  const motionOffset = useMotionValue(circumference)

  useEffect(() => {
    const ctrl = animate(motionOffset, targetOffset, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
    })
    return () => ctrl.stop()
  }, [targetOffset, motionOffset])

  return (
    <motion.circle
      cx={100}
      cy={100}
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={9}
      strokeLinecap="round"
      strokeDasharray={circumference}
      style={{ strokeDashoffset: motionOffset }}
    />
  )
}

interface AnimatedNumberProps {
  value: number
  className?: string
}

/**
 * Tweens an integer readout when `value` changes — same easing curve as the
 * water tracker for visual consistency.
 */
function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const mv = useMotionValue(value)
  const rounded = useTransform(mv, (v) => Math.round(v))
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    const ctrl = animate(mv, value, { duration: 0.6, ease: [0.16, 1, 0.3, 1] })
    const unsub = rounded.on('change', (v) => setDisplay(v))
    return () => {
      ctrl.stop()
      unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <p className={className}>{display}</p>
}
