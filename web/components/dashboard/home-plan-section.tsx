'use client'

import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'
import { getCurrentPlanLight, deletePlan } from '@/app/actions/plans'
import { confirmWorkoutPlan } from '@/app/actions/generatePlan'
import { DASHBOARD_KEY } from '@/lib/queries/dashboard'
import type { PlanPreviewPayload, PlanDay } from '@/lib/plans/types'
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import type { TodayWorkoutInfo } from '@/app/actions/types'
import { TodayPlanCard } from '@/components/dashboard/today-plan-card'
import { PlanGeneratorCard } from '@/components/plans/plan-generator-card'
import { PlanEditor } from '@/components/plans/plan-editor'
import { PlanDetailSheet, type DetailPlan } from '@/components/plans/plan-detail-sheet'
import { TrainingMode } from '@/components/training/training-mode'

/** Loose shape for the active plan row (body lives in `structure`). */
interface PlanRow {
  id: string
  name: string
  description?: string | null
  structure?: unknown
}

interface HomePlanSectionProps {
  /** Today's workout slice from the dashboard payload (null → no active plan). */
  info: TodayWorkoutInfo
  userId?: string
  /** Refresh dashboard after a successful batch log from the today card. */
  onLogged?: () => void
  className?: string
}

/**
 * The single-plan surface on the home tab (folded in from the retired Plans tab).
 *
 * - **No active plan** → a compact "create your plan" card: AI generate
 *   (auto-activates) with a manual-create fallback.
 * - **Has active plan** → the compact today slice ({@link TodayPlanCard}); tapping
 *   it expands to the full-week {@link PlanDetailSheet} (view all 7 days, inline
 *   edit, "let AI adjust", and delete/replace).
 *
 * The collapsed home view stays short (just today); the full week only appears
 * after the user taps to expand.
 */
export function HomePlanSection({ info, userId, onLogged, className }: HomePlanSectionProps) {
  const t = useT()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [trainingOpen, setTrainingOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingPlan, setConfirmingPlan] = useState(false)

  // Full active-plan structure (needed for the expanded sheet). The dashboard
  // payload only carries today's slice, so we fetch the whole plan separately.
  const { data: currentPlan } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const res = await getCurrentPlanLight()
      return res.success && res.data ? (res.data.plan as PlanRow) : null
    },
    enabled: !!userId,
  })

  // Refresh both the plan cache (this section) and the dashboard payload (the
  // today card + rings) whenever the active plan changes.
  const refreshPlan = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['plans'] })
    void qc.invalidateQueries({ queryKey: DASHBOARD_KEY })
  }, [qc])

  const detailPlan: DetailPlan | null = currentPlan
    ? {
        id: currentPlan.id,
        name: currentPlan.name,
        description: currentPlan.description,
        structure: currentPlan.structure,
      }
    : null

  const handleDelete = useCallback(async () => {
    if (!currentPlan || deleting) return
    if (!confirm(t.plans.list.confirmDelete)) return
    setDeleting(true)
    try {
      const res = await deletePlan(currentPlan.id)
      if (res.success) {
        setSheetOpen(false)
        refreshPlan()
        toast({ title: t.plans.list.deleteSuccess, description: t.plans.list.deleteSuccessDesc })
      } else {
        toast({
          variant: 'destructive',
          title: t.plans.list.deleteFailed,
          description: typeof res.error === 'string' ? tError(t, res.error) : t.plans.list.tryLater,
        })
      }
    } finally {
      setDeleting(false)
    }
  }, [currentPlan, deleting, refreshPlan, t, toast])

  const handleConfirmPlan = useCallback(
    async (preview: PlanPreviewPayload) => {
      setConfirmingPlan(true)
      try {
        const res = await confirmWorkoutPlan(preview)
        if (res.success && 'data' in res && res.data) {
          toast({ title: t.plans.detail.applied })
          setSheetOpen(false)
          refreshPlan()
        } else {
          const err = (res as { error?: unknown }).error
          toast({
            variant: 'destructive',
            title: t.plans.detail.applyFailed,
            description: typeof err === 'string' ? tError(t, err) : t.plans.list.tryLater,
          })
        }
      } finally {
        setConfirmingPlan(false)
      }
    },
    [refreshPlan, t, toast]
  )

  // ── No active plan → create surface ─────────────────────────────────────
  if (!info) {
    return (
      <div className={className}>
        <PlanGeneratorCard onGenerated={refreshPlan} onManual={() => setEditorOpen(true)} />
        <PlanEditor open={editorOpen} onOpenChange={setEditorOpen} onCreated={refreshPlan} />
      </div>
    )
  }

  // ── Has active plan → today slice + expandable full week ────────────────
  return (
    <div className={className}>
      <TodayPlanCard
        info={info}
        userId={userId}
        onLogged={onLogged}
        onExpand={() => setSheetOpen(true)}
        onStartTraining={() => setTrainingOpen(true)}
        onCreate={() => setEditorOpen(true)}
      />

      <PlanDetailSheet
        plan={sheetOpen ? detailPlan : null}
        onOpenChange={setSheetOpen}
        onSaved={refreshPlan}
        onDelete={handleDelete}
        deleting={deleting}
        onConfirm={handleConfirmPlan}
        confirming={confirmingPlan}
      />

      <PlanEditor open={editorOpen} onOpenChange={setEditorOpen} onCreated={refreshPlan} />

      <AnimatePresence>
        {trainingOpen && info?.plan && info?.todayDay && (
          <TrainingMode
            planId={info.plan.id}
            userId={userId ?? ''}
            day={{
              name: info.todayDay.name,
              rest_day: info.todayDay.isRestDay,
              exercises: info.exercises.map((e) => ({
                name: e.text,
                sets: e.sets ?? null,
                reps_min: e.repsMin ?? null,
                reps_max: e.repsMax ?? null,
                weight: e.weight ?? null,
              })),
            } as PlanDay}
            onClose={() => setTrainingOpen(false)}
            onFinish={() => {
              setTrainingOpen(false)
              refreshPlan()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
