'use client'

import { motion } from 'framer-motion'
import { ChevronRight, Coffee, Dumbbell, Play } from 'lucide-react'
import { useCallback, useMemo, useTransition } from 'react'
import { batchLogWorkouts } from '@/app/actions/logWorkout'
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import type { TodayWorkoutInfo } from '@/app/actions/types'
import { cn } from '@/lib/utils'

interface TodayPlanCardProps {
  info: TodayWorkoutInfo
  userId?: string
  /** Refresh dashboard after a successful batch log. */
  onLogged?: () => void
  /** Jump to the Training tab to view/manage the full plan. */
  onManage: () => void
  className?: string
}

/**
 * Compact "today's plan" card for the home tab.
 *
 * Surfaces the daily slice of the active plan (already present on the dashboard
 * payload) so users don't have to dig into Training → Plans. Keeps it to one or
 * two rows to respect the single-screen home; full details live in Training.
 */
export function TodayPlanCard({
  info,
  userId,
  onLogged,
  onManage,
  className,
}: TodayPlanCardProps) {
  const t = useT()
  const { toast } = useToast()
  const [isLogging, startLogging] = useTransition()

  const exercises = useMemo(() => info?.exercises ?? [], [info])
  const isRest = info?.todayDay?.isRestDay ?? false

  const handleStart = useCallback(() => {
    if (!userId || exercises.length === 0 || isLogging) return
    startLogging(async () => {
      const workouts = exercises.map((e) => ({
        name: e.text || t.plans.list.workoutDefaultName,
        sets: e.sets ?? undefined,
        duration_minutes: 15,
        calories_burned: Math.round((e.sets ?? 3) * 8),
      }))
      const res = await batchLogWorkouts(workouts)
      if (res.success) {
        toast({
          title: t.plans.list.workoutStarted,
          description: t.plans.list.workoutStartedDesc(workouts.length),
        })
        onLogged?.()
      } else {
        toast({
          variant: 'destructive',
          title: t.plans.list.logFailed,
          description: typeof res.error === 'string' ? tError(t, res.error) : t.plans.list.tryLater,
        })
      }
    })
  }, [userId, exercises, isLogging, toast, t, onLogged])

  // ── No active plan ──────────────────────────────────────────────────────
  if (!info) {
    return (
      <Shell className={className}>
        <button
          type="button"
          onClick={onManage}
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
          onClick={onManage}
          className="flex w-full items-center gap-3 text-left"
        >
          <Badge tone="accent">
            <Coffee size={14} />
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{t.dashboard.todayPlan.restTitle}</p>
            <p className="truncate text-[11px] text-muted-foreground">{t.dashboard.todayPlan.restCopy}</p>
          </div>
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
        </button>
      </Shell>
    )
  }

  // ── Workout day ─────────────────────────────────────────────────────────
  const dayName = info.todayDay?.name || t.dashboard.todayPlan.trainToday
  const preview = exercises
    .slice(0, 2)
    .map((e) => e.text)
    .filter(Boolean)
    .join(' · ')

  return (
    <Shell className={className}>
      <div className="flex items-center gap-3">
        <Badge tone="primary">
          <Dumbbell size={14} />
        </Badge>
        <button type="button" onClick={onManage} className="min-w-0 flex-1 text-left">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <span className="truncate">{dayName}</span>
            <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
              · {t.dashboard.todayPlan.exercisesN(exercises.length)}
            </span>
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {preview || t.dashboard.todayPlan.viewAll}
          </p>
        </button>

        {exercises.length > 0 && (
          <motion.button
            type="button"
            onClick={handleStart}
            disabled={isLogging || !userId}
            whileTap={isLogging ? undefined : { scale: 0.96 }}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play size={12} className={cn(isLogging && 'animate-pulse')} />
            {isLogging ? t.plans.banner.logging : t.dashboard.todayPlan.start}
          </motion.button>
        )}
      </div>
    </Shell>
  )
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
