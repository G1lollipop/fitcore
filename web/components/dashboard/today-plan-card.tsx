'use client'

import { ChevronRight, Coffee, Dumbbell, Play } from 'lucide-react'
import { useT } from '@/lib/i18n/provider'
import type { TodayWorkoutInfo } from '@/app/actions/types'
import { cn } from '@/lib/utils'

interface TodayPlanCardProps {
  info: TodayWorkoutInfo
  userId?: string
  /** Kept for API compatibility; workout logging now happens inside the full-week detail sheet. */
  onLogged?: () => void
  /** Expand the active plan into the full-week detail sheet. */
  onExpand?: () => void
  /** Launch the full-screen training mode for today's workout. */
  onStartTraining?: () => void
  /** Start the create-a-plan flow when there's no active plan. */
  onCreate?: () => void
  className?: string
}

const VISIBLE_EXERCISE_COUNT = 4

/**
 * "Today's plan" card for the home tab.
 *
 * Surfaces the daily slice of the active plan as a compact card with a
 * glanceable exercise list. Tapping anywhere expands the full week;
 * per-exercise logging lives inside that detail sheet so the home tab stays
 * single-screen on mobile.
 */
export function TodayPlanCard({
  info,
  userId: _userId,
  onLogged: _onLogged,
  onExpand,
  onStartTraining,
  onCreate,
  className,
}: TodayPlanCardProps) {
  const t = useT()
  const exercises = info?.exercises ?? []
  const isRest = info?.todayDay?.isRestDay ?? false

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
  const visibleExercises = exercises.slice(0, VISIBLE_EXERCISE_COUNT)
  const overflowCount = Math.max(0, exercises.length - VISIBLE_EXERCISE_COUNT)

  function formatSetsReps(exercise: (typeof exercises)[number]) {
    const reps =
      exercise.repsMin != null || exercise.repsMax != null
        ? t.dashboard.todayPlan.repsRange(
            exercise.repsMin ?? exercise.repsMax ?? 0,
            exercise.repsMax ?? exercise.repsMin ?? 0
          )
        : null

    if (exercise.sets != null && reps != null) {
      return t.dashboard.todayPlan.setsReps(exercise.sets, reps)
    }
    if (exercise.sets != null) {
      return t.dashboard.todayPlan.setsN(exercise.sets)
    }
    if (reps != null) {
      return `${reps} reps`
    }
    return null
  }

  return (
    <Shell className={className}>
      <button
        type="button"
        onClick={onExpand}
        className="flex w-full items-start gap-3 text-left"
      >
        <Badge tone="primary">
          <Dumbbell size={14} />
        </Badge>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
              <span className="truncate">{dayName}</span>
              <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
                · {t.dashboard.todayPlan.exercisesN(exercises.length)}
              </span>
            </p>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-muted-foreground">
              {t.dashboard.todayPlan.viewWeek}
              <ChevronRight size={14} />
            </span>
          </div>

          {exercises.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {visibleExercises.map((exercise) => {
                const setsReps = formatSetsReps(exercise)
                return (
                  <li key={exercise.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-muted-foreground">
                      {exercise.text}
                    </span>
                    {setsReps && (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/80">
                        {setsReps}
                      </span>
                    )}
                  </li>
                )
              })}
              {overflowCount > 0 && (
                <li className="text-[11px] font-medium text-primary">
                  {t.dashboard.todayPlan.moreExercises(overflowCount)}
                </li>
              )}
            </ul>
          )}

          {onStartTraining && (
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onStartTraining()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  onStartTraining()
                }
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <Play size={16} />
              Start Training
            </div>
          )}
        </div>
      </button>
    </Shell>
  )
}

function Shell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'glass glass-highlight relative overflow-hidden rounded-2xl p-3',
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
