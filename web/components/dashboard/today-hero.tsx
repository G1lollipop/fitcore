'use client'

import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Flame, UtensilsCrossed, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface TodayHeroProps {
  kcalIntake: number
  kcalBurn: number
  kcalGoal: number
  workoutMinutes: number
  className?: string
}

const RADIUS_OUTER = 92
const RADIUS_INNER = 72
const STROKE = 14
const SVG_SIZE = 224
const CENTER = SVG_SIZE / 2

const CIRC_OUTER = 2 * Math.PI * RADIUS_OUTER
const CIRC_INNER = 2 * Math.PI * RADIUS_INNER

function clamp01(v: number) {
  if (!isFinite(v) || v <= 0) return 0
  return v >= 1 ? 1 : v
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
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
  kcalIntake,
  kcalBurn,
  kcalGoal,
  workoutMinutes,
  className,
}: TodayHeroProps) {
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

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm',
        'flex flex-col gap-6',
        className
      )}
    >
      <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-primary/5 blur-3xl" aria-hidden />
      <div className="absolute -bottom-24 -left-12 h-48 w-48 rounded-full bg-accent/10 blur-3xl" aria-hidden />

      <header className="relative flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Today
          </p>
          <h2 className="font-display mt-1 text-lg font-semibold text-foreground">
            {formatDate(new Date())}
          </h2>
        </div>
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
          {overBudget ? '已超出目标' : remaining < kcalGoal * 0.1 ? '即将达成' : '能量充裕'}
        </span>
      </header>

      <div className="relative grid items-center gap-6 sm:grid-cols-[auto_1fr]">
        <div className="relative mx-auto sm:mx-0" style={{ width: SVG_SIZE, height: SVG_SIZE }}>
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

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              净摄入
            </span>
            <span
              className={cn(
                'font-display mt-0.5 text-[44px] font-semibold leading-none tabular-nums',
                overBudget ? 'text-destructive' : 'text-foreground'
              )}
            >
              {displayNet}
            </span>
            <span className="mt-1 text-[11px] text-muted-foreground">
              {overBudget ? `超 ${displayNet - kcalGoal} kcal` : `还剩 ${Math.max(0, kcalGoal - displayNet)} kcal`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Stat
            tone="primary"
            icon={<UtensilsCrossed size={14} />}
            label="今日摄入"
            value={displayIntake}
            unit="kcal"
            sub={`目标 ${kcalGoal} kcal`}
          />
          <Stat
            tone="accent"
            icon={<Flame size={14} />}
            label="今日消耗"
            value={displayBurn}
            unit="kcal"
            sub="运动 + 基础代谢"
          />
          <Stat
            tone="muted"
            icon={<Timer size={14} />}
            label="训练时长"
            value={displayMinutes}
            unit="分钟"
            sub={workoutMinutes > 0 ? '已完成今日训练' : '尚未开始'}
          />
        </div>
      </div>
    </motion.section>
  )
}

interface StatProps {
  tone: 'primary' | 'accent' | 'muted'
  icon: React.ReactNode
  label: string
  value: number
  unit: string
  sub: string
}

function Stat({ tone, icon, label, value, unit, sub }: StatProps) {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary/10 text-primary'
      : tone === 'accent'
        ? 'bg-accent/20 text-accent-foreground'
        : 'bg-secondary text-muted-foreground'

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
      <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneClass)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="font-display text-lg font-semibold tabular-nums leading-tight text-foreground">
          {value}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
        </p>
        <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  )
}
