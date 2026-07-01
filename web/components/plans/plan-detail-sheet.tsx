'use client'

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Moon,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { updatePlanStructure } from '@/app/actions/plans'
import { adjustWorkoutPlan } from '@/app/actions/generatePlan'
import { normalizePlanStructure, type PlanStructure } from '@/lib/plans/types'

/** Minimal shape needed to open the detail sheet for a plan. */
export interface DetailPlan {
  id: string
  name: string
  description?: string | null
  structure?: unknown
}

interface ExerciseRow {
  name: string
  sets: string
  repsMin: string
  repsMax: string
  weight: string
}

interface DayRow {
  name: string
  rest: boolean
  exercises: ExerciseRow[]
}

function structureToDays(structure: unknown): DayRow[] {
  const norm = normalizePlanStructure(structure)
  return norm.days.map((d) => ({
    name: d.name,
    rest: d.rest_day,
    exercises: d.exercises.map((e) => ({
      name: e.name,
      sets: e.sets != null ? String(e.sets) : '',
      repsMin: e.reps_min != null ? String(e.reps_min) : '',
      repsMax: e.reps_max != null ? String(e.reps_max) : '',
      weight: e.weight != null ? String(e.weight) : '',
    })),
  }))
}

function daysToStructure(days: DayRow[]): PlanStructure {
  return {
    days: days.map((d, i) => {
      if (d.rest) return { name: d.name.trim() || 'Rest', rest_day: true, exercises: [] }
      const exercises = d.exercises
        .filter((e) => e.name.trim())
        .map((e) => ({
          name: e.name.trim(),
          sets: e.sets ? Number(e.sets) : null,
          reps_min: e.repsMin ? Number(e.repsMin) : null,
          reps_max: e.repsMax ? Number(e.repsMax) : null,
          weight: e.weight ? Number(e.weight) : null,
        }))
      return {
        name: d.name.trim() || `Day ${i + 1}`,
        rest_day: exercises.length === 0,
        exercises,
      }
    }),
  }
}

function blankExercise(): ExerciseRow {
  return { name: '', sets: '3', repsMin: '8', repsMax: '12', weight: '' }
}

interface PlanDetailSheetProps {
  plan: DetailPlan | null
  onOpenChange: (open: boolean) => void
  /** Fired after the plan structure is saved or AI-adjusted. */
  onSaved: () => void
  /** Optional delete/replace affordance — when provided, a delete button shows. */
  onDelete?: () => void
  /** Whether a delete is in flight (disables the sheet + shows a spinner). */
  deleting?: boolean
}

/**
 * Full-plan detail sheet with a two-level master → detail flow:
 *
 * - Level 1 (week overview): a tidy, glanceable list of the 7 days (Mon→Sun)
 *   with the AI-adjust box on top and Save/Delete at the bottom. Tapping a day
 *   drills into it.
 * - Level 2 (single-day editor): a focused, spacious editor for the selected
 *   day only (rename, toggle rest, add/remove/reorder + edit exercises).
 *
 * Both levels edit the same shared `days` state, so navigating between them
 * never loses unsaved edits. Saving writes `workout_plans.structure` and lets
 * the caller refresh both the plans list and the dashboard "today" card.
 */
export function PlanDetailSheet({ plan, onOpenChange, onSaved, onDelete, deleting = false }: PlanDetailSheetProps) {
  const t = useT()
  const { toast } = useToast()
  const weekdays = t.training.calendar.weekDaysMonFirst

  const [days, setDays] = useState<DayRow[]>([])
  const [saving, setSaving] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null)

  // Seed editable state whenever a different plan is opened (render-time set
  // instead of a useEffect round-trip).
  const [seededId, setSeededId] = useState<string | null>(null)
  if (plan && plan.id !== seededId) {
    setSeededId(plan.id)
    setDays(structureToDays(plan.structure))
    setInstruction('')
    setSelectedDayIdx(null)
  }

  const busy = saving || adjusting || deleting

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

  const moveExercise = (dayIdx: number, exIdx: number, dir: -1 | 1) =>
    setDays((prev) =>
      prev.map((d, i) => {
        if (i !== dayIdx) return d
        const next = exIdx + dir
        if (next < 0 || next >= d.exercises.length) return d
        const exercises = [...d.exercises]
        const [moved] = exercises.splice(exIdx, 1)
        exercises.splice(next, 0, moved!)
        return { ...d, exercises }
      })
    )

  const handleSave = async () => {
    if (!plan) return
    setSaving(true)
    try {
      const res = await updatePlanStructure(plan.id, daysToStructure(days))
      if (res.success) {
        toast({ title: t.plans.detail.saved })
        onSaved()
        onOpenChange(false)
      } else {
        const err = (res as { error?: unknown }).error
        toast({
          variant: 'destructive',
          title: t.plans.detail.saveFailed,
          description: typeof err === 'string' ? tError(t, err) : t.plans.list.tryLater,
        })
      }
    } finally {
      setSaving(false)
    }
  }

  const handleAdjust = async () => {
    const text = instruction.trim()
    if (!text || busy) return
    setAdjusting(true)
    try {
      const res = await adjustWorkoutPlan({ instruction: text })
      if (res.success) {
        toast({ title: t.plans.detail.aiAdjusted })
        setInstruction('')
        onSaved()
        onOpenChange(false)
      } else {
        const err = (res as { error?: unknown }).error
        toast({
          variant: 'destructive',
          title: t.plans.detail.aiFailed,
          description: typeof err === 'string' ? tError(t, err) : t.plans.list.tryLater,
        })
      }
    } finally {
      setAdjusting(false)
    }
  }

  const selectedDay = selectedDayIdx != null ? days[selectedDayIdx] : undefined

  return (
    <Sheet open={plan !== null} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent side="right" className="w-full overflow-y-auto bg-background p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border bg-card px-5 py-4">
          <SheetTitle className="font-display text-base">
            {plan?.name || t.plans.detail.title}
          </SheetTitle>
          <SheetDescription className="text-[11px]">{t.plans.detail.subtitle}</SheetDescription>
        </SheetHeader>

        {selectedDay && selectedDayIdx != null ? (
          /* ── Level 2: single-day editor ─────────────────────────────── */
          <div className="space-y-5 p-5">
            <button
              type="button"
              onClick={() => setSelectedDayIdx(null)}
              className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft size={16} />
              {t.plans.detail.back}
            </button>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {weekdays[selectedDayIdx]}
                </span>
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={selectedDay.rest}
                    onChange={() => toggleRest(selectedDayIdx)}
                    className="h-4 w-4 accent-primary"
                  />
                  {t.plans.detail.restDay}
                </label>
              </div>
              <Input
                value={selectedDay.name}
                onChange={(e) => patchDay(selectedDayIdx, { name: e.target.value })}
                placeholder={t.plans.detail.dayNamePlaceholder}
                disabled={selectedDay.rest}
                className="h-11 text-base"
              />
            </div>

            {selectedDay.rest ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-10 text-center">
                <Moon size={22} className="text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">{t.plans.detail.restDay}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDay.exercises.map((ex, exIdx) => (
                  <div
                    key={exIdx}
                    className="rounded-xl border border-border bg-card p-3.5 shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={ex.name}
                        onChange={(e) => patchExercise(selectedDayIdx, exIdx, { name: e.target.value })}
                        placeholder={t.plans.detail.exercisePlaceholder}
                        className="h-11 flex-1 text-base"
                      />
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveExercise(selectedDayIdx, exIdx, -1)}
                          disabled={exIdx === 0}
                          aria-label={t.plans.detail.moveUp}
                          className="flex h-11 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveExercise(selectedDayIdx, exIdx, 1)}
                          disabled={exIdx === selectedDay.exercises.length - 1}
                          aria-label={t.plans.detail.moveDown}
                          className="flex h-11 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeExercise(selectedDayIdx, exIdx)}
                          aria-label={t.common.delete}
                          className="flex h-11 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="flex flex-col items-center gap-1">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {t.plans.detail.setsShort}
                        </label>
                        <Input
                          value={ex.sets}
                          onChange={(e) => patchExercise(selectedDayIdx, exIdx, { sets: e.target.value })}
                          type="number"
                          inputMode="numeric"
                          aria-label={t.plans.detail.setsShort}
                          className="h-10 w-16 px-1 text-center"
                        />
                      </div>
                      <div className="flex flex-1 flex-col items-center gap-1">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {t.plans.detail.repsShort}
                        </label>
                        <div className="flex w-full items-center gap-1.5">
                          <Input
                            value={ex.repsMin}
                            onChange={(e) => patchExercise(selectedDayIdx, exIdx, { repsMin: e.target.value })}
                            type="number"
                            inputMode="numeric"
                            aria-label={t.plans.detail.repsShort}
                            className="h-10 flex-1 px-1 text-center"
                          />
                          <span className="text-xs text-muted-foreground">-</span>
                          <Input
                            value={ex.repsMax}
                            onChange={(e) => patchExercise(selectedDayIdx, exIdx, { repsMax: e.target.value })}
                            type="number"
                            inputMode="numeric"
                            aria-label={t.plans.detail.repsShort}
                            className="h-10 flex-1 px-1 text-center"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {t.plans.detail.weightShort}
                        </label>
                        <Input
                          value={ex.weight}
                          onChange={(e) => patchExercise(selectedDayIdx, exIdx, { weight: e.target.value })}
                          type="number"
                          inputMode="decimal"
                          aria-label={t.plans.detail.weightShort}
                          placeholder={t.plans.detail.weightPlaceholder}
                          className="h-10 w-20 px-2 text-center"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addExercise(selectedDayIdx)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
                >
                  <Plus size={16} />
                  {t.plans.detail.addExercise}
                </button>
              </div>
            )}

            <Button onClick={handleSave} disabled={busy} className="w-full gap-2">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? t.plans.detail.saving : t.plans.detail.save}
            </Button>
          </div>
        ) : (
          /* ── Level 1: week overview ─────────────────────────────────── */
          <div className="space-y-5 p-5">
            {/* AI adjust */}
            <div className="glass glass-highlight rounded-xl p-3.5">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Wand2 size={15} />
                </span>
                <p className="text-xs font-semibold text-foreground">{t.plans.detail.aiTitle}</p>
              </div>
              <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 focus-within:border-primary/60">
                  <Sparkles size={14} className="shrink-0 text-primary" aria-hidden />
                  <input
                    type="text"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAdjust()
                    }}
                    disabled={busy}
                    placeholder={t.plans.detail.aiPlaceholder}
                    className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleAdjust}
                  disabled={busy || !instruction.trim()}
                  size="sm"
                  className="gap-1.5"
                >
                  {adjusting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Wand2 size={14} />
                  )}
                  {adjusting ? t.plans.detail.aiAdjusting : t.plans.detail.aiAdjust}
                </Button>
              </div>
            </div>

            {/* Week overview: one tappable row per day */}
            <div className="space-y-1">
              <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t.plans.detail.weekOverview}
              </p>
              <p className="px-0.5 pb-1 text-[11px] text-muted-foreground/80">
                {t.plans.detail.tapDayHint}
              </p>
              <div className="space-y-2">
                {days.map((day, dayIdx) => {
                  const count = day.exercises.filter((e) => e.name.trim()).length
                  const preview = day.exercises
                    .map((e) => e.name.trim())
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(', ')
                  return (
                    <button
                      key={dayIdx}
                      type="button"
                      onClick={() => setSelectedDayIdx(dayIdx)}
                      aria-label={t.plans.detail.editDayAria(day.name || weekdays[dayIdx]!)}
                      className={cn(
                        'flex min-h-[56px] w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                        day.rest
                          ? 'border-border bg-secondary/30 hover:bg-secondary/50'
                          : 'border-border bg-card hover:border-primary/40 hover:bg-card/80'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold uppercase tracking-wide',
                          day.rest
                            ? 'bg-secondary text-muted-foreground'
                            : 'bg-primary/12 text-primary'
                        )}
                      >
                        {weekdays[dayIdx]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {day.rest
                            ? t.plans.detail.restDay
                            : day.name.trim() || t.plans.detail.dayNamePlaceholder}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {day.rest ? (
                            <span className="inline-flex items-center gap-1">
                              <Moon size={11} />
                              {t.plans.detail.restDay}
                            </span>
                          ) : count > 0 ? (
                            preview || t.plans.detail.exercisesCount(count)
                          ) : (
                            t.plans.detail.noExercises
                          )}
                        </p>
                      </div>
                      {!day.rest && count > 0 && (
                        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {t.plans.detail.exercisesCount(count)}
                        </span>
                      )}
                      <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
                    </button>
                  )
                })}
              </div>
            </div>

            <Button onClick={handleSave} disabled={busy} className="w-full gap-2">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? t.plans.detail.saving : t.plans.detail.save}
            </Button>

            {onDelete && (
              <Button
                type="button"
                onClick={onDelete}
                disabled={busy}
                variant="ghost"
                className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {deleting ? t.plans.detail.deleting : t.plans.detail.deletePlan}
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
