'use client'

import { motion } from 'framer-motion'
import { Calendar, Check, Clock, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useT } from '@/lib/i18n/provider'
import { tLabel } from '@/lib/i18n'
import type { Dictionary } from '@/lib/i18n'
import { buildWeekStrip, findTodayCell, type WeekStripCell } from '@/lib/plans/week-strip'
import { cn } from '@/lib/utils'

export interface PlanCardData {
  id: string
  name: string
  description?: string | null
  goal?: string | null
  experience_level?: string | null
  duration_weeks?: number | null
  frequency_per_week?: number | null
  /** JSON plan body (`workout_plans.structure`). */
  structure?: unknown
}

interface PlanCardProps {
  plan: PlanCardData
  isCurrent: boolean
  isPending?: boolean
  onSetCurrent: () => void
  onDelete: () => void
  onEdit?: () => void
  className?: string
}

/**
 * Visual plan card with a Mon-Sun week strip across the bottom, driven by the
 * plan's JSON structure. An "Today" pill highlights the current weekday.
 */
export function PlanCard({
  plan,
  isCurrent,
  isPending = false,
  onSetCurrent,
  onDelete,
  onEdit,
  className,
}: PlanCardProps) {
  const t = useT()
  const cells = useMemo(() => buildWeekStrip(plan.structure), [plan.structure])
  const todayCell = useMemo(() => findTodayCell(cells), [cells])

  const goalLabel = tLabel(t.labels.goals, plan.goal)
  const levelLabel = tLabel(t.labels.levels, plan.experience_level)

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'group relative flex min-h-[14rem] flex-col overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-shadow',
        isCurrent
          ? 'border-primary/50 shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-primary)_18%,transparent)]'
          : 'border-border hover:shadow-md',
        className
      )}
    >
      {isCurrent && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 h-24 w-24 -translate-y-1/3 translate-x-1/3 rounded-full bg-primary/15 blur-2xl"
        />
      )}

      <header className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display truncate text-lg font-semibold text-foreground">
              {plan.name}
            </h3>
            {isCurrent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                <Sparkles size={10} />
                {t.plans.card.current}
              </span>
            )}
          </div>
          {plan.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {plan.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              disabled={isPending}
              aria-label={t.plans.edit.editAria(plan.name)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/70 opacity-0 transition-all hover:bg-secondary hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            aria-label={t.plans.card.deleteAria(plan.name)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/70 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {goalLabel && <Pill>{goalLabel}</Pill>}
        {levelLabel && <Pill>{levelLabel}</Pill>}
        <Pill icon={<Calendar size={10} />}>
          {t.plans.card.freqPerWeek(plan.frequency_per_week ?? '—')}
        </Pill>
        {plan.duration_weeks ? (
          <Pill icon={<Clock size={10} />}>{t.plans.card.weeks(plan.duration_weeks)}</Pill>
        ) : null}
      </div>

      <div className="mt-auto pt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t.plans.card.weekRhythm}
          </span>
          {todayCell && (
            <span className="text-[11px] text-muted-foreground">
              {t.plans.card.todayPrefix} ·{' '}
              <span className="font-medium text-primary">
                {todayCell.day.name || t.plans.card.trainingDayDefault}
              </span>
            </span>
          )}
        </div>
        <WeekStrip cells={cells} t={t} />
      </div>

      {!isCurrent && (
        <button
          type="button"
          onClick={onSetCurrent}
          disabled={isPending}
          className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check size={12} />
          {isPending ? t.plans.card.setting : t.plans.card.setCurrent}
        </button>
      )}
    </motion.article>
  )
}

interface WeekStripProps {
  cells: WeekStripCell[]
  t: Dictionary
}

/** Mon-Sun strip: each cell shows its weekday letter and marks rest vs workout. */
export function WeekStrip({ cells, t }: WeekStripProps) {
  return (
    <ol className="grid grid-cols-7 gap-1.5">
      {cells.map((cell) => (
        <WeekCell key={cell.position} cell={cell} t={t} />
      ))}
    </ol>
  )
}

function WeekCell({ cell, t }: { cell: WeekStripCell; t: Dictionary }) {
  const isWorkout = cell.kind === 'workout'
  const isRest = cell.kind === 'rest'

  const subLabel = useMemo(() => {
    if (!isWorkout) return null
    return cell.day.name ? abbreviateName(cell.day.name) : null
  }, [cell.day.name, isWorkout])

  return (
    <li
      className={cn(
        'relative flex aspect-[3/4] flex-col items-center justify-center rounded-xl px-1 py-1.5 text-center transition-colors',
        isWorkout && 'bg-primary/15 text-primary',
        isRest && 'bg-secondary/60 text-muted-foreground',
        cell.isToday && 'outline outline-2 outline-offset-[-2px] outline-primary'
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-wider">
        {t.training.calendar.weekDaysMonFirst[cell.position - 1]}
      </span>
      <span
        className={cn(
          'mt-0.5 text-[10px] tabular-nums',
          isWorkout ? 'font-semibold' : 'font-normal opacity-70'
        )}
      >
        {isRest ? t.plans.card.rest : subLabel ?? '✓'}
      </span>
      {cell.isToday && (
        <span
          aria-hidden
          className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider text-primary-foreground shadow-sm"
        >
          {t.plans.card.today}
        </span>
      )}
    </li>
  )
}

function Pill({
  children,
  icon,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {icon}
      {children}
    </span>
  )
}

function abbreviateName(name: string): string {
  const stripped = name.trim()
  if (!stripped) return '✓'
  return /[一-鿿]/.test(stripped) ? stripped.slice(0, 2) : stripped[0]!.toUpperCase()
}
