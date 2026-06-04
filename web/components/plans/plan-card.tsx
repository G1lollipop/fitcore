'use client'

import { motion } from 'framer-motion'
import { Calendar, Check, Clock, Sparkles, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { goalLabels, levelLabels } from '@/lib/labels'
import {
  buildWeekStrip,
  findTodayCell,
  type WeekStripCell,
  type WeekStripPlanInput,
} from '@/lib/plans/week-strip'
import { cn } from '@/lib/utils'

export interface PlanCardData extends WeekStripPlanInput {
  id: string
  name: string
  description?: string | null
  goal?: string | null
  experience_level?: string | null
  duration_weeks?: number | null
}

interface PlanCardProps {
  plan: PlanCardData
  isCurrent: boolean
  isPending?: boolean
  onSetCurrent: () => void
  onDelete: () => void
  className?: string
}

/**
 * Visual plan card with a Mon-Sun week strip across the bottom. The card
 * is enlarged to `min-h-[14rem]` so the strip has room to breathe; an
 * "Today" pill highlights the current weekday's session.
 */
export function PlanCard({
  plan,
  isCurrent,
  isPending = false,
  onSetCurrent,
  onDelete,
  className,
}: PlanCardProps) {
  const cells = useMemo(() => buildWeekStrip(plan), [plan])
  const todayCell = useMemo(() => findTodayCell(cells), [cells])

  const goalLabel = plan.goal ? goalLabels[plan.goal] ?? plan.goal : null
  const levelLabel = plan.experience_level
    ? levelLabels[plan.experience_level] ?? plan.experience_level
    : null

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
                当前
              </span>
            )}
          </div>
          {plan.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {plan.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          aria-label={`删除 ${plan.name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={14} />
        </button>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {goalLabel && <Pill>{goalLabel}</Pill>}
        {levelLabel && <Pill>{levelLabel}</Pill>}
        <Pill icon={<Calendar size={10} />}>
          {plan.frequency_per_week ?? '—'} 次/周
        </Pill>
        {plan.duration_weeks ? (
          <Pill icon={<Clock size={10} />}>{plan.duration_weeks} 周</Pill>
        ) : null}
      </div>

      <div className="mt-auto pt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            本周节奏
          </span>
          {todayCell?.workoutDay && (
            <span className="text-[11px] text-muted-foreground">
              今日 ·{' '}
              <span className="font-medium text-primary">
                {todayCell.workoutDay.name ?? '训练日'}
              </span>
            </span>
          )}
        </div>
        <WeekStrip cells={cells} />
      </div>

      {!isCurrent && (
        <button
          type="button"
          onClick={onSetCurrent}
          disabled={isPending}
          className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check size={12} />
          {isPending ? '设置中…' : '设为当前计划'}
        </button>
      )}
    </motion.article>
  )
}

interface WeekStripProps {
  cells: WeekStripCell[]
}

/**
 * Mon-Sun strip: each cell shows its weekday letter, marks rest/off vs.
 * workout, and pops a pill on today's slot. Workout cells preview the day
 * label (or first focus muscle) under the letter when there's room.
 */
export function WeekStrip({ cells }: WeekStripProps) {
  return (
    <ol className="grid grid-cols-7 gap-1.5">
      {cells.map((cell) => (
        <WeekCell key={cell.position} cell={cell} />
      ))}
    </ol>
  )
}

function WeekCell({ cell }: { cell: WeekStripCell }) {
  const isWorkout = cell.kind === 'workout'
  const isRest = cell.kind === 'rest'

  const subLabel = useMemo(() => {
    if (!isWorkout || !cell.workoutDay) return null
    const muscles = cell.workoutDay.focus_muscles ?? []
    if (muscles.length > 0) return abbreviateMuscle(muscles[0]!)
    if (cell.workoutDay.name) return abbreviateName(cell.workoutDay.name)
    return null
  }, [cell.workoutDay, isWorkout])

  return (
    <li
      className={cn(
        'relative flex aspect-[3/4] flex-col items-center justify-center rounded-xl px-1 py-1.5 text-center transition-colors',
        isWorkout && 'bg-primary/15 text-primary',
        isRest && 'bg-secondary/60 text-muted-foreground',
        cell.kind === 'off' && 'bg-secondary/30 text-muted-foreground/60',
        cell.isToday && 'outline outline-2 outline-offset-[-2px] outline-primary'
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-wider">
        {cell.shortLabel}
      </span>
      <span
        className={cn(
          'mt-0.5 text-[10px] tabular-nums',
          isWorkout ? 'font-semibold' : 'font-normal opacity-70'
        )}
      >
        {isRest ? '休' : isWorkout ? subLabel ?? '✓' : '·'}
      </span>
      {cell.isToday && (
        <span
          aria-hidden
          className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider text-primary-foreground shadow-sm"
        >
          今
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

/**
 * Squeeze a long muscle name down to a 1-2 char hint for the cell. Falls
 * back to the first character when no rule matches.
 */
function abbreviateMuscle(name: string): string {
  const lc = name.toLowerCase()
  if (lc.includes('chest') || lc.includes('胸')) return '胸'
  if (lc.includes('back') || lc.includes('背')) return '背'
  if (lc.includes('leg') || lc.includes('腿') || lc.includes('quad') || lc.includes('hamstring'))
    return '腿'
  if (lc.includes('shoulder') || lc.includes('肩') || lc.includes('delt')) return '肩'
  if (lc.includes('arm') || lc.includes('臂') || lc.includes('bicep') || lc.includes('tricep'))
    return '臂'
  if (lc.includes('core') || lc.includes('abs') || lc.includes('腹') || lc.includes('核心'))
    return '核'
  if (lc.includes('cardio') || lc.includes('有氧')) return '氧'
  return name.slice(0, 1)
}

function abbreviateName(name: string): string {
  // Keep first 2 chars (CJK) or first letter (latin).
  const stripped = name.trim()
  if (!stripped) return '✓'
  return /[一-鿿]/.test(stripped) ? stripped.slice(0, 2) : stripped[0]!.toUpperCase()
}
