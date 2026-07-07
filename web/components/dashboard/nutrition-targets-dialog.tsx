'use client'

import { Calculator, Loader2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import { calculateNutritionRecommendation } from '@/app/actions/onboarding'
import { updateDietPlan } from '@/app/actions/settings'
import { useUserSettings, useInvalidateUserSettings } from '@/lib/queries/settings'


interface NutritionTargetsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fired after targets are saved so the home rings/goals refresh. */
  onSaved?: () => void
}

interface FormState {
  calories: string
  protein: string
  carbs: string
  fat: string
}

const EMPTY: FormState = { calories: '', protein: '', carbs: '', fat: '' }

/**
 * Dialog for editing the user's daily nutrition targets (calories / macros /
 * water) right where the home overview shows the matching progress. Values can
 * be edited by hand or recomputed from the body profile via AI (the same engine
 * onboarding uses). Replaces the standalone Diet Plan card that lived on the
 * retired Plans tab.
 */
export function NutritionTargetsDialog({ open, onOpenChange, onSaved }: NutritionTargetsDialogProps) {
  const t = useT()
  const { toast } = useToast()
  // Shared cache: warmed on home mount, so opening the dialog is instant.
  const { data: settings, isPending } = useUserSettings()
  const invalidateUserSettings = useInvalidateUserSettings()
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [seeded, setSeeded] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)

  // Body profile derived from the cached settings, kept for the AI recalc
  // (not edited here). Null until the profile is complete enough to recompute.
  const profile = useMemo(() => {
    const s = settings
    if (s && s.gender && s.age && s.height && s.weight && s.activity_level) {
      return {
        gender: s.gender as 'male' | 'female',
        age: s.age,
        height: s.height,
        weight: s.weight,
        activityLevel: s.activity_level as 'sedentary' | 'light' | 'moderate' | 'heavy',
      }
    }
    return null
  }, [settings])

  // Seed the targets from the cached settings when the dialog opens, using the
  // render-time "adjust state on prop change" pattern (no effect, no
  // fetch-on-open). If the cache is warm this seeds on the first open render
  // (no skeleton); otherwise it waits for the query to resolve. Reopening
  // reflects the latest saved values.
  if (open && !seeded && !isPending) {
    setForm(
      settings
        ? {
            calories: settings.target_calories != null ? String(settings.target_calories) : '',
            protein: settings.target_protein != null ? String(settings.target_protein) : '',
            carbs: settings.target_carbs != null ? String(settings.target_carbs) : '',
            fat: settings.target_fat != null ? String(settings.target_fat) : '',
          }
        : EMPTY
    )
    setSeeded(true)
  }
  if (!open && seeded) setSeeded(false)

  const loading = open && !seeded

  const set = useCallback(
    <K extends keyof FormState>(key: K, val: FormState[K]) =>
      setForm((prev) => ({ ...prev, [key]: val })),
    []
  )

  const handleRecalc = useCallback(async () => {
    if (!profile) {
      toast({ variant: 'destructive', title: t.plans.dietPlan.profileIncomplete })
      return
    }
    setRecalculating(true)
    try {
      const res = await calculateNutritionRecommendation(profile)
      if (res.success && res.recommendation) {
        const r = res.recommendation
        setForm((prev) => ({
          ...prev,
          calories: String(r.targetCalories),
          protein: String(r.targetProtein),
          carbs: String(r.targetCarbs),
          fat: String(r.targetFat),
        }))
        toast({ title: t.plans.dietPlan.recalcDone })
      } else {
        toast({ variant: 'destructive', title: t.plans.dietPlan.recalcFailed, description: tError(t, res.error) })
      }
    } finally {
      setRecalculating(false)
    }
  }, [profile, t, toast])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await updateDietPlan({
        targetCalories: Number(form.calories),
        targetProtein: Number(form.protein),
        targetCarbs: Number(form.carbs),
        targetFat: Number(form.fat),
        waterGoalMl: 0,
      })
      if (res.success) {
        invalidateUserSettings()
        toast({ title: t.plans.dietPlan.saved })
        onSaved?.()
        onOpenChange(false)
      } else {
        toast({ variant: 'destructive', title: t.plans.dietPlan.saveFailed, description: tError(t, res.error) })
      }
    } finally {
      setSaving(false)
    }
  }, [form, invalidateUserSettings, onOpenChange, onSaved, t, toast])

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-base">{t.dashboard.targets.title}</DialogTitle>
          <DialogDescription className="text-[11px]">{t.dashboard.targets.subtitle}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <Skeleton className="h-56 w-full rounded-2xl" />
        ) : (
          <>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRecalc}
                disabled={recalculating}
                className="h-8 shrink-0 text-xs"
              >
                {recalculating ? <Loader2 size={13} className="animate-spin" /> : <Calculator size={13} />}
                {t.plans.dietPlan.recalc}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Field label={t.plans.dietPlan.calories}>
                <Input className="h-9 text-sm" type="number" inputMode="numeric" value={form.calories} onChange={(e) => set('calories', e.target.value)} />
              </Field>
              <Field label={t.plans.dietPlan.protein}>
                <Input className="h-9 text-sm" type="number" inputMode="numeric" value={form.protein} onChange={(e) => set('protein', e.target.value)} />
              </Field>
              <Field label={t.plans.dietPlan.carbs}>
                <Input className="h-9 text-sm" type="number" inputMode="numeric" value={form.carbs} onChange={(e) => set('carbs', e.target.value)} />
              </Field>
              <Field label={t.plans.dietPlan.fat}>
                <Input className="h-9 text-sm" type="number" inputMode="numeric" value={form.fat} onChange={(e) => set('fat', e.target.value)} />
              </Field>
            </div>

            <Button type="button" onClick={handleSave} disabled={saving} className="h-10 w-full gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? t.plans.dietPlan.saving : t.plans.dietPlan.save}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
