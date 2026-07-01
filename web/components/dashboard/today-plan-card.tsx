'use client'

import { motion } from 'framer-motion'
import { Check, ChevronRight, Coffee, Dumbbell, Loader2, Plus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { createWorkoutLog } from '@/app/actions/logWorkout'
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import type { TodayWorkoutInfo } from '@/app/actions/types'
import { cn } from '@/lib/utils'

type Exercise = NonNullable<TodayWorkoutInfo>['exercises'][number]

interface TodayPlanCardProps {
  info: TodayWorkoutInfo
  userId?: string
  /** Refresh dashboard after a successful per-exercise log. */
  onLogged?: () => void
  /** Expand the active plan into the full-week detail sheet. */
  onExpand?: () => void
  /** Start the create-a-plan flow when there's no active plan. */
  onCreate?: () => void
  className?: string
}

/**
 * "Today's plan" card for the home tab.
 *
 * Surfaces the daily slice of the active plan (already present on the dashboard
 * payload) so users don't have to dig into a separate Plans tab. On a workout
 * day it lists today's exercises with a per-exercise "log" control; tapping the
 * header expands to the full week (`onExpand`), and the no-plan branch kicks off
 * plan creation (`onCreate`).
 */
export function TodayPlanCard({
  info,
  userId,
  onLogged,
  onExpand,
  onCreate,
  className,
}: TodayPlanCardProps) {
  const t = useT()
  const { toast } = useToast()
  // Optimistic per-exercise state: which rows are done, and which is in-flight.
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set())
  const [loggingId, setLoggingId] = useState<string | null>(null)

  const exercises = useMemo(() => info?.exercises ?? [], [info])
  const isRest = info?.todayDay?.isRestDay ?? false

  const logExercise = useCallback(
    async (e: Exercise) => {
      if (!userId || loggingId || loggedIds.has(e.id)) return
      setLoggingId(e.id)
      const sets = e.sets ?? null
      // Persist the clean movement name (sets/reps live in their own fields),
      // so History doesn't show "Bench Press 3 sets 8-12 reps".
      const name = displayName(e, Boolean(formatSummary(t, e))) || t.plans.list.workoutDefaultName
      const res = await createWorkoutLog({
        workout_name: name,
        sets,
        // Rough per-exercise estimates; users can correct in History.
        duration_minutes: 5,
        calories_burned: Math.round((sets ?? 3) * 8),
      })
      setLoggingId(null)
      if (res.success) {
        setLoggedIds((prev) => new Set(prev).add(e.id))
        toast({
          title: t.dashboard.todayPlan.exerciseLogged,
          description: t.dashboard.todayPlan.exerciseLoggedDesc(name),
        })
        onLogged?.()
      } else {
        toast({
          variant: 'destructive',
          title: t.plans.list.logFailed,
          description: typeof res.error === 'string' ? tError(t, res.error) : t.plans.list.tryLater,
        })
      }
    },
    [userId, loggingId, loggedIds, toast, t, onLogged]
  )

  // ── No active plan ──────────────────────────────────────────────────────
  if (!info) {
    return (
      <Shell className={className}>
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center gap-3 text-left"
        >
          <Badge tone="muted">
            <Dumbbell size={14} />
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{t.dashboard.todayPlan.noPlanTitle}</p>
            <p className="truncate text-[11px] text-muted-foreground">{t.dashboard.todayPlan.noPlanCta}</p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
        </button>
      </Shell>
    )
  }

  // ── Rest day ────────────────────────────────────────────────────────────
  if (isRest) {
    return (
      <Shell className={className}>
        <button
          type="button"
          onClick={onExpand}
          className="flex w-full items-center gap-3 text-left"
        >
          <Badge tone="accent">
            <Coffee size={14} />
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <span className="shrink-0">{t.dashboard.todayPlan.restTitle}</span>
              {info.plan?.name && (
                <span className="truncate text-[11px] font-normal text-muted-foreground">
                  · {info.plan.name}
                </span>
              )}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{t.dashboard.todayPlan.restCopy}</p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
        </button>
      </Shell>
    )
  }

  // ── Workout day ─────────────────────────────────────────────────────────
  const dayName = info.todayDay?.name || t.dashboard.todayPlan.trainToday

  return (
    <Shell className={className}>
      <button
        type="button"
        onClick={onExpand}
        className="flex w-full items-center gap-3 text-left"
      >
        <Badge tone="primary">
          <Dumbbell size={14} />
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <span className="truncate">{dayName}</span>
            <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
              · {t.dashboard.todayPlan.exercisesN(exercises.length)}
            </span>
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-muted-foreground">
          {t.dashboard.todayPlan.viewWeek}
          <ChevronRight size={14} />
        </span>
      </button>

      {exercises.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {exercises.map((e) => (
            <ExerciseRow
              key={e.id}
              exercise={e}
              done={loggedIds.has(e.id)}
              logging={loggingId === e.id}
              disabled={!userId || (loggingId !== null && loggingId !== e.id)}
              onLog={() => logExercise(e)}
            />
          ))}
        </ul>
      )}
    </Shell>
  )
}

function ExerciseRow({
  exercise,
  done,
  logging,
  disabled,
  onLog,
}: {
  exercise: Exercise
  done: boolean
  logging: boolean
  disabled: boolean
  onLog: () => void
}) {
  const t = useT()
  const summary = formatSummary(t, exercise)
  const name = displayName(exercise, Boolean(summary)) || t.plans.list.workoutDefaultName

  return (
    <li className="flex items-center gap-2 rounded-xl bg-secondary/40 px-2.5 py-1">
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <p className={cn('truncate text-[13px] font-medium text-foreground', done && 'text-muted-foreground line-through')}>
          {name}
        </p>
        {summary && (
          <span className="shrink-0 text-[11px] text-muted-foreground">{summary}</span>
        )}
      </div>
      <motion.button
        type="button"
        onClick={onLog}
        disabled={disabled || done || logging}
        whileTap={disabled || done || logging ? undefined : { scale: 0.92 }}
        aria-label={done ? t.dashboard.todayPlan.done : t.dashboard.todayPlan.logExerciseAria(name)}
        className={cn(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed',
          done
            ? 'bg-primary/15 text-primary'
            : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
        )}
      >
        {logging ? (
          <Loader2 size={14} className="animate-spin" />
        ) : done ? (
          <Check size={14} />
        ) : (
          <Plus size={14} />
        )}
      </motion.button>
    </li>
  )
}

/**
 * Movement name for a row. When the row already renders a structured
 * sets/reps summary, `exercise.text` (e.g. "Barbell Bench Press 3 sets
 * 8-12 reps") duplicates that info, so strip the trailing sets/reps clause
 * to show just the movement. Falls back to the full text when stripping
 * would empty it or there's no structured summary.
 */
function displayName(e: Exercise, hasSummary: boolean): string {
  const text = e.text ?? ''
  if (!hasSummary) return text
  const stripped = text.replace(/\s*[·\-–]?\s*\d+\s*sets?\b.*$/i, '').trim()
  return stripped || text
}

/** "3 × 8-12 · 20kg" style summary from the plan slice. */
function formatSummary(t: ReturnType<typeof useT>, e: Exercise): string {
  const parts: string[] = []
  if (e.sets != null && e.repsMin != null) {
    const reps = t.dashboard.todayPlan.repsRange(e.repsMin, e.repsMax ?? e.repsMin)
    parts.push(t.dashboard.todayPlan.setsReps(e.sets, reps))
  } else if (e.sets != null) {
    parts.push(t.dashboard.todayPlan.setsN(e.sets))
  }
  if (e.weight != null) parts.push(`${e.weight}kg`)
  return parts.join(' · ')
}

function Shell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'glass glass-highlight relative overflow-hidden rounded-2xl p-3.5',
        className
      )}
    >
      {children}
    </section>
  )
}

function Badge({ tone, children }: { tone: 'primary' | 'accent' | 'muted'; children: React.ReactNode }) {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary/15 text-primary'
      : tone === 'accent'
        ? 'bg-accent/20 text-accent-foreground'
        : 'bg-secondary text-muted-foreground'
  return (
    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', toneClass)}>
      {children}
    </span>
  )
}
