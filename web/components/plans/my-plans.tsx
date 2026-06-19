'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Dumbbell, Plus } from 'lucide-react'
import { useCallback, useEffect, useState, useTransition } from 'react'
import {
  getUserPlansLight,
  getCurrentPlanLight,
  getSystemTemplatesLight,
  setCurrentPlan,
  deletePlan,
} from '@/app/actions/plans'
import { batchLogWorkouts } from '@/app/actions/logWorkout'
import { useToast } from '@/hooks/use-toast'
import { calculateTodayWorkout, type TodayWorkoutResult } from '@/lib/plans/today-workout'
import { useT } from '@/lib/i18n/provider'
import { tError, localizedName } from '@/lib/i18n'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import type { Database } from '@/lib/database.types'
import { ExerciseSelector, type SelectedExercise } from './exercise-selector'
import { PlanCard, type PlanCardData } from './plan-card'
import { PlanWizard, type OpenPickerFn } from './plan-wizard'
import { TemplateGrid } from './template-grid'
import { TodayBanner } from './today-banner'

type WorkoutPlan = Database['public']['Tables']['workout_plans']['Row']
type WorkoutDay = Database['public']['Tables']['workout_days']['Row']
type PlanExercise = Database['public']['Tables']['plan_exercises']['Row']
type Exercise = Database['public']['Tables']['exercises']['Row']

interface PlanWithDays extends WorkoutPlan {
  workout_days?: (WorkoutDay & {
    plan_exercises?: (PlanExercise & { exercises?: Exercise })[]
  })[]
}

export function MyPlans({ userId }: { userId?: string }) {
  const { toast } = useToast()
  const t = useT()

  const [userPlans, setUserPlans] = useState<PlanWithDays[]>([])
  const [currentPlan, setCurrentPlanData] = useState<PlanWithDays | null>(null)
  const [templates, setTemplates] = useState<WorkoutPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const [todayResult, setTodayResult] = useState<TodayWorkoutResult | null>(null)
  const [isLogging, startLogging] = useTransition()
  const [wizardOpen, setWizardOpen] = useState(false)

  /**
   * Picker hoisted out of `PlanWizard` so we never have two Radix Dialog
   * `DismissableLayer`s open at once.
   *
   * The previous architecture mounted both the wizard's Sheet *and* the
   * `ExerciseSelector`'s Dialog as concurrent siblings. Radix tracks layer
   * stacking via DOM containment + a React-tree pointer-down ref; because
   * the picker portal isn't a React-tree descendant of the Sheet, the
   * Sheet's `onPointerDownCapture` never fires for clicks inside the
   * picker. The Sheet's document-level handler then sees the click as
   * "outside" — and the layer-index guard that's supposed to suppress the
   * lower layer races against the just-mounted upper layer. End result:
   * the first click anywhere inside the picker dismissed both modals.
   *
   * Fix: only ever run one Radix Dialog at a time. While the picker is
   * open, the Sheet is closed (`open={wizardOpen && !pickerRequest}`) and
   * the wizard is told to suspend its reset timer so its in-flight state
   * survives the round trip.
   */
  const [pickerRequest, setPickerRequest] = useState<{
    initial: SelectedExercise[]
    onConfirm: (next: SelectedExercise[]) => void
  } | null>(null)

  const handleOpenPicker = useCallback<OpenPickerFn>((_position, initial, onConfirm) => {
    setPickerRequest({ initial, onConfirm })
  }, [])

  const handleClosePicker = useCallback(() => {
    setPickerRequest(null)
  }, [])

  const refreshTodayWorkout = useCallback((plan: PlanWithDays | null) => {
    if (!plan) {
      setTodayResult(null)
      return
    }
    const result = calculateTodayWorkout(plan)
    setTodayResult(result)
  }, [])

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [userPlansRes, currentPlanRes, templatesRes] = await Promise.all([
        getUserPlansLight(),
        getCurrentPlanLight(),
        getSystemTemplatesLight(),
      ])

      if (userPlansRes.success && userPlansRes.data) {
        setUserPlans(userPlansRes.data as PlanWithDays[])
      }
      if (currentPlanRes.success && currentPlanRes.data) {
        const plan = currentPlanRes.data.plan as PlanWithDays
        setCurrentPlanData(plan)
        refreshTodayWorkout(plan)
      } else {
        setCurrentPlanData(null)
        setTodayResult(null)
      }
      if (templatesRes.success && templatesRes.data) {
        setTemplates(templatesRes.data as unknown as WorkoutPlan[])
      }
    } catch (error) {
      console.error('Failed to load plans:', error)
    } finally {
      setLoading(false)
    }
  }, [userId, refreshTodayWorkout])

  useEffect(() => {
    if (userId) loadData()
  }, [userId, loadData])

  const handleSetCurrent = useCallback(
    async (planId: string) => {
      if (!userId) return
      setPendingPlanId(planId)
      try {
        const result = await setCurrentPlan(planId)
        if (result.success) {
          const newCurrent = userPlans.find((p) => p.id === planId) ?? null
          setCurrentPlanData(newCurrent)
          refreshTodayWorkout(newCurrent)
          toast({
            title: t.plans.list.setSuccess,
            description: t.plans.list.setSuccessDesc,
          })
        } else {
          toast({
            variant: 'destructive',
            title: t.plans.list.setFailed,
            description: typeof result.error === 'string' ? tError(t, result.error) : t.plans.list.tryLater,
          })
        }
      } finally {
        setPendingPlanId(null)
      }
    },
    [userId, userPlans, refreshTodayWorkout, toast, t]
  )

  const handleDelete = useCallback(
    async (planId: string) => {
      if (!userId) return
      if (!confirm(t.plans.list.confirmDelete)) return
      setPendingPlanId(planId)
      try {
        const result = await deletePlan(planId)
        if (result.success) {
          setUserPlans((prev) => prev.filter((p) => p.id !== planId))
          if (currentPlan?.id === planId) {
            setCurrentPlanData(null)
            setTodayResult(null)
          }
          toast({ title: t.plans.list.deleteSuccess, description: t.plans.list.deleteSuccessDesc })
        } else {
          toast({
            variant: 'destructive',
            title: t.plans.list.deleteFailed,
            description: typeof result.error === 'string' ? tError(t, result.error) : t.plans.list.tryLater,
          })
        }
      } finally {
        setPendingPlanId(null)
      }
    },
    [userId, currentPlan, toast, t]
  )

  const handleStartWorkout = useCallback(() => {
    if (!userId || !todayResult || todayResult.exercises.length === 0) return
    startLogging(async () => {
      const workouts = todayResult.exercises.map((e) => ({
        name: e.exerciseName
          ? localizedName(t, e.exerciseName, e.exerciseNameEn)
          : t.plans.list.workoutDefaultName,
        sets: e.sets ?? undefined,
        duration_minutes: 15,
        calories_burned: Math.round((e.sets ?? 3) * 8),
      }))
      const result = await batchLogWorkouts(workouts)
      if (result.success) {
        toast({
          title: t.plans.list.workoutStarted,
          description: t.plans.list.workoutStartedDesc(workouts.length),
        })
      } else {
        toast({
          variant: 'destructive',
          title: t.plans.list.logFailed,
          description: typeof result.error === 'string' ? tError(t, result.error) : t.plans.list.tryLater,
        })
      }
    })
  }, [userId, todayResult, toast, t])

  const handleWizardCreated = useCallback(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return <PlansSkeleton />
  }

  return (
    <div className="space-y-6">
      {currentPlan && todayResult && (
        <TodayBanner
          planName={currentPlan.name}
          result={todayResult}
          isLogging={isLogging}
          onStart={handleStartWorkout}
        />
      )}

      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-foreground">{t.plans.list.title}</h3>
            <p className="text-[11px] text-muted-foreground">
              {userPlans.length > 0 ? t.plans.list.countPlans(userPlans.length) : t.plans.list.noPlansYet}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md"
          >
            <Plus size={12} />
            {t.plans.list.create}
          </button>
        </header>

        {userPlans.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title={t.plans.list.emptyTitle}
            description={t.plans.list.emptyDesc}
          >
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md"
            >
              <Plus size={12} />
              {t.plans.list.createWithWizard}
            </button>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {userPlans.map((plan) => (
                <motion.div
                  key={plan.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                >
                  <PlanCard
                    plan={planToCardData(plan)}
                    isCurrent={currentPlan?.id === plan.id}
                    isPending={pendingPlanId === plan.id}
                    onSetCurrent={() => handleSetCurrent(plan.id)}
                    onDelete={() => handleDelete(plan.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <header>
          <h3 className="font-display text-base font-semibold text-foreground">{t.plans.list.templatesTitle}</h3>
          <p className="text-[11px] text-muted-foreground">{t.plans.list.templatesHint}</p>
        </header>
        <TemplateGrid
          templates={templates.slice(0, 6)}
          userId={userId ?? undefined}
          onCopied={loadData}
        />
      </section>

      <PlanWizard
        open={wizardOpen && pickerRequest === null}
        onOpenChange={setWizardOpen}
        userId={userId ?? undefined}
        onCreated={handleWizardCreated}
        onOpenPicker={handleOpenPicker}
        suspended={pickerRequest !== null}
      />

      {pickerRequest && (
        <ExerciseSelector
          isOpen
          onClose={handleClosePicker}
          initialSelected={pickerRequest.initial}
          onConfirm={pickerRequest.onConfirm}
        />
      )}
    </div>
  )
}

function planToCardData(plan: PlanWithDays): PlanCardData {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    goal: plan.goal,
    experience_level: plan.experience_level,
    duration_weeks: plan.duration_weeks,
    frequency_per_week: plan.frequency_per_week,
    rest_days: plan.rest_days,
    workout_days: plan.workout_days?.map((d) => ({
      id: d.id,
      name: d.name,
      day_order: d.day_order,
      focus_muscles: d.focus_muscles,
    })),
  }
}

function PlansSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="h-6 w-1/2" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  )
}
