// web/components/history/day-timeline.tsx
'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { Dumbbell, Pencil, Trash2, UtensilsCrossed } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '@/lib/i18n/provider'
import { toLocalDateStr } from '@/lib/utils/date'
import { EmptyState } from '@/components/ui/empty-state'
import { DietLogEditDialog } from '@/components/log-form/diet-log-edit-dialog'
import { WorkoutLogEditDialog } from '@/components/log-form/workout-log-edit-dialog'
import { deleteDietLog } from '@/app/actions/logFood'
import { deleteWorkoutLog } from '@/app/actions/logWorkout'
import { tError } from '@/lib/i18n'
import { useToast } from '@/hooks/use-toast'
import type { NutritionDayData } from '@/app/actions/history'
import type { DietLogItem, WorkoutLogItem } from '@/app/actions/types'

const toDateStr = toLocalDateStr

interface DayTimelineProps {
  date: Date
  userId?: string
  dietData?: NutritionDayData
  workoutLogs?: WorkoutLogItem[]
  onChange?: () => void
}

type TimelineItem =
  | { kind: 'diet'; data: DietLogItem; slot: string }
  | { kind: 'workout'; data: WorkoutLogItem }

const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner', 'lateNight'] as const

function bucketByLoggedAt(iso: string): string {
  const h = new Date(iso).getHours()
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

export function DayTimeline({ date, userId, dietData, workoutLogs, onChange }: DayTimelineProps) {
  const t = useT()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [isPending, startTransition] = useTransition()
  const [editingDiet, setEditingDiet] = useState<DietLogItem | null>(null)
  const [editingWorkout, setEditingWorkout] = useState<WorkoutLogItem | null>(null)
  const dateStr = toDateStr(date)

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
      void qc.invalidateQueries({ queryKey: ['nutrition', dateStr] })
      onChange?.()
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
      void qc.invalidateQueries({ queryKey: ['workouts', dateStr] })
      onChange?.()
    })
  }

  if (timelineItems.length === 0) {
    return (
      <EmptyState
        icon={UtensilsCrossed}
        title="No meals or workouts yet"
        description="Tap + to start logging"
        size="inset"
      />
    )
  }

  let lastSlot = ''

  return (
    <>
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
                          {item.data.calories} kcal
                          {item.data.protein != null ? ` · P${item.data.protein}` : ''}
                          {item.data.carbs != null ? ` · C${item.data.carbs}` : ''}
                          {item.data.fat != null ? ` · F${item.data.fat}` : ''}
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
                  {userId && (
                    <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
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

      <DietLogEditDialog log={editingDiet} onClose={() => setEditingDiet(null)} onSuccess={onChange} />
      <WorkoutLogEditDialog log={editingWorkout} onClose={() => setEditingWorkout(null)} onSuccess={onChange} />
    </>
  )
}
