'use client'

import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Flame, UtensilsCrossed, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/provider'

interface TodayHeroProps {
  kcalIntake?: number
  kcalBurn?: number
  kcalGoal?: number
  workoutMinutes?: number
  className?: string
  /** Render without the outer glass card (for embedding in a combined card). */
  embedded?: boolean
}

const RADIUS_OUTER = 56
const RADIUS_INNER = 43
const STROKE = 10
const SVG_SIZE = 132
const CENTER = SVG_SIZE / 2

const CIRC_OUTER = 2 * Math.PI * RADIUS_OUTER
const CIRC_INNER = 2 * Math.PI * RADIUS_INNER

function clamp01(v: number) {
  if (!isFinite(v) || v <= 0) return 0
  return v >= 1 ? 1 : v
}

function formatDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { month: 'long', day: 'numeric', weekday: 'long' })
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
  kcalBurn = 0,
  kcalGoal = 2500,
  workoutMinutes = 0,
  className,
  embedded = false,
}: TodayHeroProps) {
  const t = useT()
  const intakePct = clamp01(kcalIntake / Math.max(1, kcalGoal))
  // Burn ring is sized against half of intake goal — keeps a 500 kcal burn from
  // looking trivial next to a 2500 kcal intake target.
  const burnPct = clamp01(kcalBurn / Math.max(1, kcalGoal * 0.4))

  const net = kcalIntake - kcalBurn
  const remaining = Math.max(0, kcalGoal - net)
  const overBudget = net > kcalGoal

  const displayNet = useTickUp(net)
  const displayIntake = useTickUp(kcalIntake)
  const displayBurn = useTickUp(kcalBurn)
  const displayMinutes = useTickUp(workoutMinutes)

  const offsetOuter = CIRC_OUTER * (1 - intakePct)
  const offsetInner = CIRC_INNER * (1 - burnPct)

  const body = (
    <>
      <header className="relative flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-foreground">
          {formatDate(new Date(), t.common.locale)}
        </h2>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-[10px] font-medium',
            overBudget
              ? 'bg-destructive/10 text-destructive'
              : remaining < kcalGoal * 0.1
                ? 'bg-accent/20 text-accent-foreground'
                : 'bg-primary/10 text-primary'
          )}
        >
          {overBudget
            ? t.dashboard.hero.statusOver
            : remaining < kcalGoal * 0.1
              ? t.dashboard.hero.statusClose
              : t.dashboard.hero.statusOk}
        </span>
      </header>

      <div className="relative flex flex-row items-center gap-4">
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
              r={RADIUS_OUTER}
              fill="none"
              stroke="var(--color-secondary)"
              strokeWidth={STROKE}
            />
            <motion.circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS_OUTER}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRC_OUTER}
              initial={{ strokeDashoffset: CIRC_OUTER }}
              animate={{ strokeDashoffset: offsetOuter }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            />

            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS_INNER}
              fill="none"
              stroke="var(--color-muted)"
              strokeWidth={STROKE - 4}
            />
            <motion.circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS_INNER}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={STROKE - 4}
              strokeLinecap="round"
              strokeDasharray={CIRC_INNER}
              initial={{ strokeDashoffset: CIRC_INNER }}
              animate={{ strokeDashoffset: offsetInner }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center px-1 text-center">
            <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              {t.dashboard.hero.netIntake}
            </span>
            <span
              className={cn(
                'font-display text-[34px] font-semibold leading-none tabular-nums',
                overBudget ? 'text-destructive' : 'text-foreground'
              )}
            >
              {displayNet}
            </span>
            <span className="mt-1 text-[10px] leading-tight text-muted-foreground">
              {overBudget
                ? t.dashboard.hero.over(displayNet - kcalGoal)
                : t.dashboard.hero.remaining(Math.max(0, kcalGoal - displayNet))}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <Stat
            tone="primary"
            icon={<UtensilsCrossed size={14} />}
            label={t.dashboard.hero.todayIntake}
            value={displayIntake}
            unit="kcal"
          />
          <Stat
            tone="accent"
            icon={<Flame size={14} />}
            label={t.dashboard.hero.todayBurn}
            value={displayBurn}
            unit="kcal"
          />
          <Stat
            tone="muted"
            icon={<Timer size={14} />}
            label={t.dashboard.hero.workoutDuration}
            value={displayMinutes}
            unit={t.common.minutes}
          />
        </div>
      </div>
    </>
  )

  if (embedded) {
    return <div className="flex flex-col gap-2.5">{body}</div>
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

export interface StatProps {
  tone: 'primary' | 'accent' | 'muted'
  icon: React.ReactNode
  label: string
  value: number
  /** When set, renders "value / goal unit" (e.g. macros). Omit for plain stats. */
  goal?: number
  unit: string
}

/**
 * Shared stat row used across the today overview: an icon chip + label + a big
 * value with a small unit. Exported so the macro rows (TodayMetrics) match the
 * energy rows exactly, keeping the whole card as one coherent stat list.
 */
export function Stat({ tone, icon, label, value, goal, unit }: StatProps) {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary/10 text-primary'
      : tone === 'accent'
        ? 'bg-accent/20 text-accent-foreground'
        : 'bg-secondary text-muted-foreground'

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md', toneClass)}>
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-1">
        <p className="truncate text-[11px] leading-tight text-muted-foreground">{label}</p>
        <p className="font-display text-[13px] font-semibold tabular-nums leading-tight text-foreground">
          {value}
          <span className="ml-0.5 whitespace-nowrap text-[10px] font-normal text-muted-foreground">
            {goal != null && goal > 0 ? `/ ${goal} ${unit}` : unit}
          </span>
        </p>
      </div>
    </div>
  )
}
