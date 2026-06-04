'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Dumbbell,
  Plus,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { createCustomPlan, type CustomPlanDay } from '@/app/actions/plans'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'
import { goalLabels, levelLabels } from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { SelectedExercise } from './exercise-selector'

/**
 * Host-supplied callback to launch the exercise picker. The picker is
 * deliberately mounted *outside* the wizard's Sheet to avoid running two
 * Radix Dialog DismissableLayers at the same time — see the comment block
 * in `MyPlans` for the full rationale.
 */
export type OpenPickerFn = (
  position: number,
  initial: SelectedExercise[],
  onConfirm: (next: SelectedExercise[]) => void
) => void

interface PlanWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId?: string
  onCreated?: () => void
  onOpenPicker: OpenPickerFn
  /**
   * When true, treats the wizard as still in flight even though `open` is
   * false (host has temporarily hidden the Sheet to show the picker). Skips
   * the reset-on-close timer so wizard state survives the round trip.
   */
  suspended?: boolean
}

type WizardStep = 1 | 2 | 3 | 4

interface ScheduleDay {
  name: string
  focus_muscles: string[]
}

interface WizardState {
  basics: {
    name: string
    description: string
    goal: string
    experience_level: string
    duration_weeks: number
  }
  /** 7 weekday slots Mon..Sun. null = rest. */
  schedule: (ScheduleDay | null)[]
  /** Exercises keyed by ISO weekday position 1..7. */
  exercises: Record<number, SelectedExercise[]>
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

const GOAL_OPTIONS = [
  { value: 'general', label: goalLabels.general },
  { value: 'strength', label: goalLabels.strength },
  { value: 'muscle_gain', label: goalLabels.muscle_gain },
  { value: 'fat_loss', label: goalLabels.fat_loss },
  { value: 'endurance', label: goalLabels.endurance },
] as const

const LEVEL_OPTIONS = [
  { value: 'beginner', label: levelLabels.beginner },
  { value: 'intermediate', label: levelLabels.intermediate },
  { value: 'advanced', label: levelLabels.advanced },
] as const

const STEP_LABELS: Record<WizardStep, string> = {
  1: '基础信息',
  2: '安排训练日',
  3: '挑选动作',
  4: '检查并创建',
}

const INITIAL_STATE: WizardState = {
  basics: {
    name: '',
    description: '',
    goal: 'general',
    experience_level: 'beginner',
    duration_weeks: 8,
  },
  schedule: Array<ScheduleDay | null>(7).fill(null),
  exercises: {},
}

/**
 * Multi-step plan creation wizard rendered inside a right-side Sheet.
 *
 * Step 1 collects basics; step 2 picks weekdays; step 3 attaches exercises
 * per weekday via the existing ExerciseSelector; step 4 reviews and
 * dispatches `createCustomPlan`. Each step has its own validation.
 */
export function PlanWizard({
  open,
  onOpenChange,
  userId,
  onCreated,
  onOpenPicker,
  suspended = false,
}: PlanWizardProps) {
  const { toast } = useToast()
  const [state, setState] = useState<WizardState>(INITIAL_STATE)
  const [step, setStep] = useState<WizardStep>(1)
  const [isSubmitting, startSubmit] = useTransition()

  // Reset when the drawer closes so reopening starts clean. Skipped while
  // the host is briefly hiding us to show the picker (suspended), so the
  // user returns to the same step with their selections intact.
  useEffect(() => {
    if (open || suspended) return
    const t = setTimeout(() => {
      setState(INITIAL_STATE)
      setStep(1)
    }, 250)
    return () => clearTimeout(t)
  }, [open, suspended])

  const trainingDays = useMemo(
    () =>
      state.schedule
        .map((d, idx) => (d ? { day: d, position: idx + 1 } : null))
        .filter((d): d is { day: ScheduleDay; position: number } => d !== null),
    [state.schedule]
  )

  const totalExercises = useMemo(
    () => Object.values(state.exercises).reduce((sum, list) => sum + (list?.length ?? 0), 0),
    [state.exercises]
  )

  const canAdvance = useMemo(() => {
    if (step === 1) return state.basics.name.trim().length > 0
    if (step === 2) return trainingDays.length > 0
    if (step === 3) return totalExercises > 0
    return true
  }, [step, state.basics.name, trainingDays.length, totalExercises])

  const handleNext = () => {
    if (!canAdvance) return
    setStep((s) => (s < 4 ? ((s + 1) as WizardStep) : s))
  }
  const handleBack = () => {
    setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s))
  }

  const handleSubmit = () => {
    if (!userId) {
      toast({
        variant: 'destructive',
        title: '请先登录',
        description: '创建计划需要登录账户',
      })
      return
    }
    if (!state.basics.name.trim() || trainingDays.length === 0) return

    startSubmit(async () => {
      const days: CustomPlanDay[] = state.schedule.map((slot, idx) => {
        const position = idx + 1
        if (!slot) {
          return {
            name: '休息',
            rest_day: true,
            exercises: [],
          }
        }
        const exs = state.exercises[position] ?? []
        return {
          name: slot.name || `训练日 ${position}`,
          focus_muscles: slot.focus_muscles,
          rest_day: false,
          exercises: exs.map((e) => ({
            exercise_id: e.exercise_id,
            target_sets: e.target_sets,
            target_reps_min: e.target_reps_min,
            target_reps_max: e.target_reps_max,
            target_weight_kg: e.target_weight_kg,
          })),
        }
      })

      const result = await createCustomPlan(userId, {
        name: state.basics.name.trim(),
        description: state.basics.description.trim() || undefined,
        goal: state.basics.goal,
        experience_level: state.basics.experience_level,
        frequency_per_week: trainingDays.length,
        duration_weeks: state.basics.duration_weeks,
        days,
      })

      if (result.success) {
        toast({
          title: '计划已创建',
          description: `${state.basics.name} · ${trainingDays.length} 天/周`,
        })
        onCreated?.()
        onOpenChange(false)
      } else {
        toast({
          variant: 'destructive',
          title: '创建失败',
          description: typeof result.error === 'string' ? result.error : '请稍后再试',
        })
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto bg-background p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles size={16} />
            </span>
            <div>
              <SheetTitle className="font-display text-base">创建训练计划</SheetTitle>
              <SheetDescription className="text-[11px]">
                第 {step} / 4 步 · {STEP_LABELS[step]}
              </SheetDescription>
            </div>
          </div>
          <StepProgress step={step} />
        </SheetHeader>

        <div className="flex-1 px-5 py-5">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <BasicsStep
                  basics={state.basics}
                  onChange={(basics) => setState((s) => ({ ...s, basics }))}
                />
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <ScheduleStep
                  schedule={state.schedule}
                  onChange={(schedule) => setState((s) => ({ ...s, schedule }))}
                />
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <ExercisesStep
                  schedule={state.schedule}
                  exercises={state.exercises}
                  onOpenSelector={(position) => {
                    onOpenPicker(position, state.exercises[position] ?? [], (selected) =>
                      setState((s) => ({
                        ...s,
                        exercises: {
                          ...s.exercises,
                          [position]: selected,
                        },
                      }))
                    )
                  }}
                  onClear={(position) =>
                    setState((s) => ({
                      ...s,
                      exercises: { ...s.exercises, [position]: [] },
                    }))
                  }
                />
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <ReviewStep
                  state={state}
                  trainingDays={trainingDays}
                  totalExercises={totalExercises}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <footer className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-card/80 px-5 py-3 backdrop-blur">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1 || isSubmitting}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} />
            上一步
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canAdvance}
              className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              下一步
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Check size={14} />
              {isSubmitting ? '创建中…' : '创建计划'}
            </button>
          )}
        </footer>
      </SheetContent>
    </Sheet>
  )
}

function StepProgress({ step }: { step: WizardStep }) {
  return (
    <div className="mt-3 flex items-center gap-1.5">
      {[1, 2, 3, 4].map((n) => {
        const done = n < step
        const active = n === step
        return (
          <div
            key={n}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              done && 'bg-primary',
              active && 'bg-primary/60',
              !done && !active && 'bg-secondary'
            )}
          />
        )
      })}
    </div>
  )
}

interface BasicsStepProps {
  basics: WizardState['basics']
  onChange: (basics: WizardState['basics']) => void
}

function BasicsStep({ basics, onChange }: BasicsStepProps) {
  return (
    <div className="space-y-4">
      <Field label="计划名称" required>
        <input
          type="text"
          value={basics.name}
          onChange={(e) => onChange({ ...basics, name: e.target.value })}
          maxLength={40}
          placeholder="例：上下肢分化 · 8 周"
          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </Field>

      <Field label="计划简介" hint="可选 · 鼓励一句话描述目标">
        <textarea
          value={basics.description}
          onChange={(e) => onChange({ ...basics, description: e.target.value })}
          maxLength={140}
          rows={2}
          placeholder="例：以增肌为主，每周练 4 天，控制总训练时间在 60 分钟内"
          className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="主要目标">
          <SelectChips
            value={basics.goal}
            onChange={(goal) => onChange({ ...basics, goal })}
            options={GOAL_OPTIONS}
          />
        </Field>
        <Field label="经验水平">
          <SelectChips
            value={basics.experience_level}
            onChange={(experience_level) => onChange({ ...basics, experience_level })}
            options={LEVEL_OPTIONS}
          />
        </Field>
      </div>

      <Field label="计划周期" hint="估计持续多少周">
        <div className="flex flex-wrap gap-1.5">
          {[4, 6, 8, 12, 16].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onChange({ ...basics, duration_weeks: w })}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                basics.duration_weeks === w
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-secondary/40 text-muted-foreground hover:border-primary/30 hover:text-foreground'
              )}
            >
              {w} 周
            </button>
          ))}
        </div>
      </Field>
    </div>
  )
}

interface ScheduleStepProps {
  schedule: (ScheduleDay | null)[]
  onChange: (schedule: (ScheduleDay | null)[]) => void
}

function ScheduleStep({ schedule, onChange }: ScheduleStepProps) {
  const toggle = (idx: number) => {
    const next = [...schedule]
    if (next[idx]) {
      next[idx] = null
    } else {
      const dayCount = next.filter(Boolean).length + 1
      next[idx] = {
        name: `训练日 ${dayCount}`,
        focus_muscles: [],
      }
    }
    onChange(next)
  }

  const updateDay = (idx: number, patch: Partial<ScheduleDay>) => {
    const next = [...schedule]
    if (next[idx]) {
      next[idx] = { ...next[idx]!, ...patch }
      onChange(next)
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        点击下方日期切换训练 / 休息。每个训练日可以单独命名。
      </p>

      <div className="grid grid-cols-7 gap-1.5">
        {schedule.map((day, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => toggle(idx)}
            className={cn(
              'flex flex-col items-center justify-center rounded-xl py-3 text-xs font-medium transition-colors',
              day
                ? 'bg-primary/15 text-primary outline outline-2 outline-offset-[-2px] outline-primary/40'
                : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
            )}
          >
            <span className="text-[10px] uppercase tracking-wider">{WEEKDAY_LABELS[idx]}</span>
            <span className="mt-0.5">{day ? <Dumbbell size={12} /> : <Coffee size={12} />}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {schedule.map((day, idx) =>
          day ? (
            <div
              key={idx}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {WEEKDAY_LABELS[idx]}
              </span>
              <input
                type="text"
                value={day.name}
                onChange={(e) => updateDay(idx, { name: e.target.value })}
                maxLength={20}
                placeholder="例：上肢推 / 腿日 / 全身循环"
                className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="button"
                onClick={() => toggle(idx)}
                aria-label="改为休息"
                className="rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                改为休息
              </button>
            </div>
          ) : null
        )}
      </div>
    </div>
  )
}

interface ExercisesStepProps {
  schedule: (ScheduleDay | null)[]
  exercises: Record<number, SelectedExercise[]>
  onOpenSelector: (position: number) => void
  onClear: (position: number) => void
}

function ExercisesStep({ schedule, exercises, onOpenSelector, onClear }: ExercisesStepProps) {
  const trainingDays = schedule
    .map((d, idx) => (d ? { day: d, position: idx + 1 } : null))
    .filter((d): d is { day: ScheduleDay; position: number } => d !== null)

  if (trainingDays.length === 0) {
    return <EmptyState size="inline" title="请先回到第二步选择训练日" />
  }

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        给每个训练日挑选动作，至少 1 个训练日需要包含动作。
      </p>

      {trainingDays.map(({ day, position }) => {
        const list = exercises[position] ?? []
        return (
          <article
            key={position}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <header className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {WEEKDAY_LABELS[position - 1]}
                </p>
                <h4 className="font-display text-sm font-semibold text-foreground">{day.name}</h4>
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {list.length} 个动作
              </span>
            </header>

            {list.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {list.slice(0, 5).map((ex) => (
                  <li
                    key={ex.exercise_id}
                    className="flex items-center justify-between rounded-xl bg-secondary/40 px-3 py-2 text-xs"
                  >
                    <span className="truncate font-medium text-foreground">{ex.name}</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground tabular-nums">
                      <Target size={10} />
                      {ex.target_sets} × {ex.target_reps_min}–{ex.target_reps_max}
                    </span>
                  </li>
                ))}
                {list.length > 5 && (
                  <li className="px-3 text-center text-[11px] text-muted-foreground">
                    + 还有 {list.length - 5} 个
                  </li>
                )}
              </ul>
            ) : (
              <div className="mt-3">
                <EmptyState size="inline" title="还没有动作" />
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => onOpenSelector(position)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <Plus size={12} />
                {list.length > 0 ? '编辑动作' : '挑选动作'}
              </button>
              {list.length > 0 && (
                <button
                  type="button"
                  onClick={() => onClear(position)}
                  className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                  aria-label={`清空 ${day.name} 的动作`}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

interface ReviewStepProps {
  state: WizardState
  trainingDays: { day: ScheduleDay; position: number }[]
  totalExercises: number
}

function ReviewStep({ state, trainingDays, totalExercises }: ReviewStepProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h4 className="font-display text-sm font-semibold text-foreground">
          {state.basics.name || '未命名计划'}
        </h4>
        {state.basics.description && (
          <p className="mt-1 text-xs text-muted-foreground">{state.basics.description}</p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <ReviewRow
            icon={<Sparkles size={12} />}
            label="目标"
            value={goalLabels[state.basics.goal] ?? state.basics.goal}
          />
          <ReviewRow
            icon={<Dumbbell size={12} />}
            label="经验"
            value={levelLabels[state.basics.experience_level] ?? state.basics.experience_level}
          />
          <ReviewRow
            icon={<Calendar size={12} />}
            label="频率"
            value={`${trainingDays.length} 次/周`}
          />
          <ReviewRow icon={<Target size={12} />} label="动作总数" value={`${totalExercises} 个`} />
        </div>
      </section>

      <section className="space-y-2">
        {state.schedule.map((slot, idx) => {
          const position = idx + 1
          const list = state.exercises[position] ?? []
          return (
            <div
              key={idx}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2.5',
                slot ? 'border-border bg-card' : 'border-dashed border-border bg-secondary/30'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg',
                  slot ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'
                )}
              >
                {slot ? <Dumbbell size={14} /> : <Coffee size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {WEEKDAY_LABELS[idx]}
                </p>
                <p className="truncate text-sm font-medium text-foreground">
                  {slot ? slot.name : '休息'}
                </p>
              </div>
              {slot && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {list.length} 个动作
                </span>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

interface SelectChipsProps<T extends string> {
  value: T
  onChange: (v: T) => void
  options: readonly { value: T; label: string }[]
}

function SelectChips<T extends string>({ value, onChange, options }: SelectChipsProps<T>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            value === opt.value
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-secondary/40 text-muted-foreground hover:border-primary/30 hover:text-foreground'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ReviewRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-secondary/40 px-2.5 py-2">
      <span className="text-primary">{icon}</span>
      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xs font-medium tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  )
}
