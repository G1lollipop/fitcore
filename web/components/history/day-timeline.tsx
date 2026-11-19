// web/components/history/day-timeline.tsx
'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { Dumbbell, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useT } from '@/lib/i18n/provider'
import { useHistoryActions } from '@/lib/queries/history'
import { minutesOfDay } from '@/lib/utils/date'
import { EmptyState } from '@/components/ui/empty-state'
import { DietLogEditDialog } from '@/components/log-form/diet-log-edit-dialog'
import { WorkoutLogEditDialog } from '@/components/log-form/workout-log-edit-dialog'
import { deleteDietLog } from '@/app/actions/logFood'
import { deleteWorkoutLog } from '@/app/actions/logWorkout'
import { tError } from '@/lib/i18n'
import { useToast } from '@/hooks/use-toast'
import type { NutritionDayData } from '@/app/actions/history'
import type { DietLogItem, WorkoutLogItem } from '@/app/actions/types'

interface DayTimelineProps {
  /** The day shown, as the `YYYY-MM-DD` the logs are stored under. */
  dateStr: string
  userId?: string
  dietData?: NutritionDayData
  workoutLogs?: WorkoutLogItem[]
  onChange?: () => void
}

type TimelineItem =
  | { kind: 'diet'; data: DietLogItem; slot: string }
  | { kind: 'workout'; data: WorkoutLogItem }

const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner', 'lateNight'] as const

/**
 * Meal slot by the hour in the app's time zone (not the browser's), matching
 * the zone the entry's day and any back-dated noon timestamp were written in.
 */
export function bucketByLoggedAt(iso: string): string {
  const h = Math.floor(minutesOfDay(iso) / 60)
  if (h < 10) return 'breakfast'
  if (h < 13) return 'lunch'
  if (h < 16) return 'snack'
  if (h < 21) return 'dinner'
  return 'lateNight'
}

const SLOT_LABELS: Record<string, string> = {
  breakfast: '🥣 Breakfast',
  lunch: '🥗 Lunch',
  snack: '🍪 Snack',
  dinner: '🍽️ Dinner',
  lateNight: '🌙 Late Night',
}

export function DayTimeline({ dateStr, userId, dietData, workoutLogs, onChange }: DayTimelineProps) {
  const t = useT()
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const history = useHistoryActions()
  const [editingDiet, setEditingDiet] = useState<DietLogItem | null>(null)
  const [editingWorkout, setEditingWorkout] = useState<WorkoutLogItem | null>(null)
  const [adding, setAdding] = useState<'diet' | 'workout' | null>(null)

  // Any change to this day: refetch the Record ranges (and the dashboard).
  // The parent's `onChange` already does both; invalidating here as well would
  // queue every refetch twice, and server actions run one at a time.
  const handleChanged = () => {
    if (onChange) onChange()
    else history.invalidateDate(dateStr)
  }

  const timelineItems = useMemo((): TimelineItem[] => {
    const items: TimelineItem[] = []

    const dietLogs = dietData?.dietLogs ?? []
    const grouped = new Map<string, DietLogItem[]>()
    for (const log of dietLogs) {
      const slot = bucketByLoggedAt(log.logged_at)
      const arr = grouped.get(slot) || []
      arr.push(log)
      grouped.set(slot, arr)
    }

    for (const slot of MEAL_ORDER) {
      for (const log of grouped.get(slot) ?? []) {
        items.push({ kind: 'diet', data: log, slot })
      }
    }

    for (const log of workoutLogs ?? []) {
      items.push({ kind: 'workout', data: log })
    }

    items.sort((a, b) => {
      const aTime = new Date(a.kind === 'diet' ? a.data.logged_at : a.data.logged_at).getTime()
      const bTime = new Date(b.kind === 'diet' ? b.data.logged_at : b.data.logged_at).getTime()
      return aTime - bTime
    })

    return items
  }, [dietData, workoutLogs])

  const handleDeleteDiet = (log: DietLogItem) => {
    if (!userId || isPending) return
    startTransition(async () => {
      const result = await deleteDietLog(log.id)
      if (!result.success) {
        toast({ variant: 'destructive', title: 'Delete failed', description: tError(t, result.error) })
        return
      }
      history.removeFood(dateStr, log.id)
      handleChanged()
    })
  }

  const handleDeleteWorkout = (log: WorkoutLogItem) => {
    if (!userId || isPending) return
    startTransition(async () => {
      const result = await deleteWorkoutLog(log.id)
      if (!result.success) {
        toast({ variant: 'destructive', title: 'Delete failed', description: tError(t, result.error) })
        return
      }
      history.removeWorkout(dateStr, log.id)
      handleChanged()
    })
  }

  // Manual entry for the day being viewed — the only way to back-date an
  // entry or to log a workout by hand (Quick Log always logs to today).
  const addBar = userId ? (
    <div className="mb-2 flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => setAdding('diet')}
        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Plus size={11} />
        Food
      </button>
      <button
        type="button"
        onClick={() => setAdding('workout')}
        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Plus size={11} />
        Workout
      </button>
    </div>
  ) : null

  const dialogs = (
    <>
      <DietLogEditDialog log={editingDiet} onClose={() => setEditingDiet(null)} onSuccess={handleChanged} />
      <WorkoutLogEditDialog log={editingWorkout} onClose={() => setEditingWorkout(null)} onSuccess={handleChanged} />
      <DietLogEditDialog
        mode="create"
        open={adding === 'diet'}
        dateStr={dateStr}
        onClose={() => setAdding(null)}
        onSuccess={(created) => {
          if (created) history.addPendingFood(dateStr, created)
          handleChanged()
        }}
      />
      <WorkoutLogEditDialog
        mode="create"
        open={adding === 'workout'}
        dateStr={dateStr}
        onClose={() => setAdding(null)}
        onSuccess={(created) => {
          if (created) history.addPendingWorkout(dateStr, created)
          handleChanged()
        }}
      />
    </>
  )

  if (timelineItems.length === 0) {
    return (
      <>
        {addBar}
        <EmptyState
          icon={UtensilsCrossed}
          title="No meals or workouts yet"
          description="Tap + to start logging"
          size="inset"
        />
        {dialogs}
      </>
    )
  }

  let lastSlot = ''

  return (
    <>
      {addBar}
      <div className="space-y-1">
        <AnimatePresence initial={false}>
          {timelineItems.map((item) => {
            const isNewSlot = item.kind === 'diet' && item.slot !== lastSlot
            if (isNewSlot) lastSlot = item.slot

            return (
              <React.Fragment key={item.kind === 'diet' ? `d-${item.data.id}` : `w-${item.data.id}`}>
                {isNewSlot && (
                  <div className="flex items-center gap-2 pb-1 pt-2 first:pt-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {SLOT_LABELS[item.slot] ?? item.slot}
                    </span>
                  </div>
                )}
                <motion.div
                  layout
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="group flex items-center gap-2 rounded-lg border border-border/50 bg-card/60 px-2 py-2"
                >
                  {item.kind === 'diet' ? (
                    <>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <UtensilsCrossed size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{item.data.food_name}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {item.data.pending ? t.logForm.quick.homeSubmitting : `${item.data.calories} kcal`}
                          {!item.data.pending && item.data.protein != null ? ` · P${item.data.protein}` : ''}
                          {!item.data.pending && item.data.carbs != null ? ` · C${item.data.carbs}` : ''}
                          {!item.data.pending && item.data.fat != null ? ` · F${item.data.fat}` : ''}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1">
                        <Dumbbell size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{item.data.workout_name}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {item.data.duration_minutes ? `${item.data.duration_minutes} min` : ''}
                          {item.data.calories_burned ? ` · ${item.data.calories_burned} kcal` : ''}
                          {item.data.sets ? ` · ${item.data.sets} sets` : ''}
                        </p>
                      </div>
                    </>
                  )}
                  {/* A Quick Log entry still being parsed has no row to edit yet. */}
                  {userId && !(item.kind === 'diet' && item.data.pending) && (
                    // Always visible on touch screens, which have no hover.
                    <div className="flex shrink-0 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => item.kind === 'diet' ? setEditingDiet(item.data) : setEditingWorkout(item.data)}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"
                        aria-label="Edit"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => item.kind === 'diet' ? handleDeleteDiet(item.data) : handleDeleteWorkout(item.data)}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </motion.div>
              </React.Fragment>
            )
          })}
        </AnimatePresence>
      </div>

      {dialogs}
    </>
  )
}
