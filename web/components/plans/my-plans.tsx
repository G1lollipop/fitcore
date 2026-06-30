'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Dumbbell, Plus } from 'lucide-react'
import { useCallback, useEffect, useState, useTransition } from 'react'
import {
  getUserPlansLight,
  getCurrentPlanLight,
  setCurrentPlan,
  deletePlan,
} from '@/app/actions/plans'
import { batchLogWorkouts } from '@/app/actions/logWorkout'
import { useToast } from '@/hooks/use-toast'
import { calculateTodayWorkout, type TodayWorkoutResult } from '@/lib/plans/today-workout'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PlanCard, type PlanCardData } from './plan-card'
import { PlanEditDialog, type EditablePlan } from './plan-edit-dialog'
import { PlanEditor } from './plan-editor'
import { PlanGeneratorCard } from './plan-generator-card'
import { TodayBanner } from './today-banner'

/** Loose shape for a plan row (body lives in `structure`). */
interface PlanRow {
  id: string
  name: string
  description?: string | null
  goal?: string | null
  experience_level?: string | null
  frequency_per_week?: number | null
  duration_weeks?: number | null
  structure?: unknown
}

interface MyPlansProps {
  userId?: string
  /**
   * When embedded in the Training tab the today-workout banner is lifted to
   * the parent (`TrainingCenter`) so it shows under both segments; hide the
   * local copy to avoid a duplicate.
   */
  hideTodayBanner?: boolean
  /** Fired after the current plan changes (set / delete) so a lifted banner can refresh. */
  onCurrentPlanChange?: () => void
}

export function MyPlans({ userId, hideTodayBanner = false, onCurrentPlanChange }: MyPlansProps) {
  const { toast } = useToast()
  const t = useT()

  const [userPlans, setUserPlans] = useState<PlanRow[]>([])
  const [currentPlan, setCurrentPlanData] = useState<PlanRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const [todayResult, setTodayResult] = useState<TodayWorkoutResult | null>(null)
  const [isLogging, startLogging] = useTransition()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<EditablePlan | null>(null)

  const refreshTodayWorkout = useCallback((plan: PlanRow | null) => {
    setTodayResult(plan ? calculateTodayWorkout(plan.structure) : null)
  }, [])

  const loadData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [userPlansRes, currentPlanRes] = await Promise.all([
        getUserPlansLight(),
        getCurrentPlanLight(),
      ])

      if (userPlansRes.success && userPlansRes.data) {
        setUserPlans(userPlansRes.data as PlanRow[])
      }
      if (currentPlanRes.success && currentPlanRes.data) {
        const plan = currentPlanRes.data.plan as PlanRow
        setCurrentPlanData(plan)
        refreshTodayWorkout(plan)
      } else {
        setCurrentPlanData(null)
        setTodayResult(null)
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
          onCurrentPlanChange?.()
          toast({ title: t.plans.list.setSuccess, description: t.plans.list.setSuccessDesc })
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
    [userId, userPlans, refreshTodayWorkout, onCurrentPlanChange, toast, t]
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
            onCurrentPlanChange?.()
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
    [userId, currentPlan, onCurrentPlanChange, toast, t]
  )

  const handleStartWorkout = useCallback(() => {
    if (!userId || !todayResult || todayResult.exercises.length === 0) return
    startLogging(async () => {
      const workouts = todayResult.exercises.map((e) => ({
        name: e.exerciseName || t.plans.list.workoutDefaultName,
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

  if (loading) {
    return <PlansSkeleton />
  }

  return (
    <div className="space-y-6">
      {!hideTodayBanner && currentPlan && todayResult && (
        <TodayBanner
          planName={currentPlan.name}
          result={todayResult}
          isLogging={isLogging}
          onStart={handleStartWorkout}
        />
      )}

      <PlanGeneratorCard onGenerated={loadData} onManual={() => setEditorOpen(true)} />

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
            onClick={() => setEditorOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
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
              onClick={() => setEditorOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md"
            >
              <Plus size={12} />
              {t.plans.list.create}
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
                    onEdit={() =>
                      setEditingPlan({
                        id: plan.id,
                        name: plan.name,
                        description: plan.description,
                        goal: plan.goal,
                        experience_level: plan.experience_level,
                        frequency_per_week: plan.frequency_per_week,
                        duration_weeks: plan.duration_weeks,
                      })
                    }
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <PlanEditor open={editorOpen} onOpenChange={setEditorOpen} onCreated={loadData} />

      <PlanEditDialog
        plan={editingPlan}
        onOpenChange={(open) => {
          if (!open) setEditingPlan(null)
        }}
        onSaved={loadData}
      />
    </div>
  )
}

function planToCardData(plan: PlanRow): PlanCardData {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    goal: plan.goal,
    experience_level: plan.experience_level,
    duration_weeks: plan.duration_weeks,
    frequency_per_week: plan.frequency_per_week,
    structure: plan.structure,
  }
}

function PlansSkeleton() {
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-6">
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
