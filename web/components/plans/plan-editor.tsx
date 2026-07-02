'use client'

import { useState } from 'react'
import { Dumbbell, GripVertical, Loader2, Plus, Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { createCustomPlan, setCurrentPlan, type CustomPlanDay } from '@/app/actions/plans'

interface ExerciseRow {
  name: string
  sets: string
  repsMin: string
  repsMax: string
}

interface DayRow {
  name: string
  rest: boolean
  exercises: ExerciseRow[]
}

function blankExercise(): ExerciseRow {
  return { name: '', sets: '3', repsMin: '8', repsMax: '12' }
}

function initialDays(): DayRow[] {
  // Default: Mon/Wed/Fri training, rest otherwise — a sensible starting point.
  return Array.from({ length: 7 }, (_, i) => {
    const training = i === 0 || i === 2 || i === 4
    return {
      name: training ? `Day ${Math.floor(i / 2) + 1}` : 'Rest',
      rest: !training,
      exercises: training ? [blankExercise()] : [],
    }
  })
}

interface PlanEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

/**
 * Free-text plan editor (AI-first app, no exercise library): the user names the
 * plan, marks rest days, and types exercise names with optional sets/reps.
 * Exercises inside each day can be reordered by dragging the grip handle.
 * Saved as a single JSON `structure` via `createCustomPlan`.
 */
export function PlanEditor({ open, onOpenChange, onCreated }: PlanEditorProps) {
  const t = useT()
  const { toast } = useToast()
  const weekdays = t.training.calendar.weekDaysMonFirst

  const [name, setName] = useState('')
  const [days, setDays] = useState<DayRow[]>(initialDays)
  const [saving, setSaving] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<{ dayIdx: number; exIdx: number } | null>(null)

  const patchDay = (idx: number, patch: Partial<DayRow>) =>
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)))

  const toggleRest = (idx: number) =>
    setDays((prev) =>
      prev.map((d, i) => {
        if (i !== idx) return d
        const rest = !d.rest
        return {
          ...d,
          rest,
          exercises: rest ? [] : d.exercises.length ? d.exercises : [blankExercise()],
        }
      })
    )

  const patchExercise = (dayIdx: number, exIdx: number, patch: Partial<ExerciseRow>) =>
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIdx
          ? { ...d, exercises: d.exercises.map((e, j) => (j === exIdx ? { ...e, ...patch } : e)) }
          : d
      )
    )

  const addExercise = (dayIdx: number) =>
    setDays((prev) =>
      prev.map((d, i) => (i === dayIdx ? { ...d, exercises: [...d.exercises, blankExercise()] } : d))
    )

  const removeExercise = (dayIdx: number, exIdx: number) =>
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIdx ? { ...d, exercises: d.exercises.filter((_, j) => j !== exIdx) } : d
      )
    )

  const moveExercise = (dayIdx: number, from: number, to: number) => {
    if (from === to) return
    setDays((prev) =>
      prev.map((d, i) => {
        if (i !== dayIdx) return d
        const exercises = [...d.exercises]
        const [moved] = exercises.splice(from, 1)
        exercises.splice(to, 0, moved!)
        return { ...d, exercises }
      })
    )
  }

  const reset = () => {
    setName('')
    setDays(initialDays())
    setDragOverIdx(null)
  }

  const handleSave = async () => {
    const planDays: CustomPlanDay[] = days.map((d, i) => {
      if (d.rest) return { name: d.name.trim() || 'Rest', rest_day: true, exercises: [] }
      const exercises = d.exercises
        .filter((e) => e.name.trim())
        .map((e) => ({
          name: e.name.trim(),
          sets: Number(e.sets) || 3,
          reps_min: Number(e.repsMin) || 8,
          reps_max: Number(e.repsMax) || 12,
        }))
      return {
        name: d.name.trim() || `Day ${i + 1}`,
        rest_day: exercises.length === 0,
        exercises,
      }
    })

    const trainingDays = planDays.filter((d) => !d.rest_day)
    if (trainingDays.length === 0) {
      toast({ variant: 'destructive', title: t.plans.editor.needTraining })
      return
    }

    setSaving(true)
    try {
      const res = await createCustomPlan({
        name: name.trim() || t.plans.list.workoutDefaultName,
        frequency_per_week: trainingDays.length,
        days: planDays,
      })
      if (res.success) {
        // Activate the newly created plan so the home "Today" card reflects it
        // right away; onCreated() then refreshes both the plans + dashboard caches.
        if ('data' in res && res.data?.id) {
          await setCurrentPlan(res.data.id)
        }
        toast({ title: t.plans.editor.created, description: t.plans.editor.createdDesc })
        reset()
        onCreated()
        onOpenChange(false)
      } else {
        const err = (res as { error?: unknown }).error
        toast({
          variant: 'destructive',
          title: t.plans.editor.createFailed,
          description: typeof err === 'string' ? tError(t, err) : t.plans.list.tryLater,
        })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <SheetContent side="right" className="w-full overflow-y-auto bg-background p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border bg-card px-5 py-4">
          <SheetTitle className="font-display text-base">{t.plans.editor.title}</SheetTitle>
          <SheetDescription className="text-[11px]">{t.plans.editor.subtitle}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="plan-editor-name">{t.plans.editor.nameLabel}</Label>
            <Input
              id="plan-editor-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.plans.editor.namePlaceholder}
            />
          </div>

          <div className="space-y-3">
            {days.map((day, dayIdx) => (
              <div
                key={dayIdx}
                className={cn(
                  'rounded-xl border p-3',
                  day.rest ? 'border-border bg-secondary/30' : 'border-border bg-card'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {weekdays[dayIdx]}
                  </span>
                  <Input
                    value={day.name}
                    onChange={(e) => patchDay(dayIdx, { name: e.target.value })}
                    placeholder={t.plans.editor.dayNamePlaceholder}
                    disabled={day.rest}
                    className="h-8 flex-1"
                  />
                  <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={day.rest}
                      onChange={() => toggleRest(dayIdx)}
                      className="accent-primary"
                    />
                    {t.plans.editor.restDay}
                  </label>
                </div>

                {!day.rest && (
                  <div className="mt-2 space-y-2">
                    {day.exercises.map((ex, exIdx) => (
                      <div
                        key={exIdx}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(exIdx))
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setDragOverIdx({ dayIdx, exIdx })
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          const from = Number(e.dataTransfer.getData('text/plain'))
                          moveExercise(dayIdx, from, exIdx)
                          setDragOverIdx(null)
                        }}
                        onDragEnd={() => setDragOverIdx(null)}
                        onDragLeave={() => setDragOverIdx(null)}
                        className={cn(
                          'flex items-center gap-1 rounded-lg border border-transparent p-1 transition-colors',
                          dragOverIdx?.dayIdx === dayIdx && dragOverIdx?.exIdx === exIdx
                            ? 'border-primary/60 bg-primary/5'
                            : 'bg-transparent'
                        )}
                      >
                        <button
                          type="button"
                          aria-label={t.plans.editor.dragToReorder}
                          className="flex shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground active:cursor-grabbing"
                        >
                          <GripVertical size={14} />
                        </button>
                        <Input
                          value={ex.name}
                          onChange={(e) => patchExercise(dayIdx, exIdx, { name: e.target.value })}
                          placeholder={t.plans.editor.exercisePlaceholder}
                          className="h-8 flex-1"
                        />
                        <Input
                          value={ex.sets}
                          onChange={(e) => patchExercise(dayIdx, exIdx, { sets: e.target.value })}
                          type="number"
                          inputMode="numeric"
                          aria-label={t.plans.editor.setsShort}
                          className="h-8 w-11 px-1 text-center"
                        />
                        <span className="text-[10px] text-muted-foreground">×</span>
                        <Input
                          value={ex.repsMin}
                          onChange={(e) => patchExercise(dayIdx, exIdx, { repsMin: e.target.value })}
                          type="number"
                          inputMode="numeric"
                          aria-label={t.plans.editor.repsShort}
                          className="h-8 w-11 px-1 text-center"
                        />
                        <span className="text-[10px] text-muted-foreground">-</span>
                        <Input
                          value={ex.repsMax}
                          onChange={(e) => patchExercise(dayIdx, exIdx, { repsMax: e.target.value })}
                          type="number"
                          inputMode="numeric"
                          aria-label={t.plans.editor.repsShort}
                          className="h-8 w-11 px-1 text-center"
                        />
                        <button
                          type="button"
                          onClick={() => removeExercise(dayIdx, exIdx)}
                          aria-label={t.common.delete}
                          className="flex h-8 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addExercise(dayIdx)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      <Plus size={12} />
                      {t.plans.editor.addExercise}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Dumbbell size={15} />}
            {saving ? t.plans.editor.creating : t.plans.editor.create}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
