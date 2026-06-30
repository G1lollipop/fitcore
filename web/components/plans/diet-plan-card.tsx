'use client'

import { Calculator, Loader2, UtensilsCrossed } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import { getUserSettings, calculateNutritionRecommendation } from '@/app/actions/onboarding'
import { updateDietPlan } from '@/app/actions/settings'
import { DEFAULT_WATER_GOAL_ML, mlToLiters } from '@/lib/metrics/water'

interface DietPlanCardProps {
  onSaved?: () => void
}

interface FormState {
  calories: string
  protein: string
  carbs: string
  fat: string
  water: string
}

const EMPTY: FormState = { calories: '', protein: '', carbs: '', fat: '', water: '' }

/**
 * The "diet plan" surface on the Plans tab: the user's daily nutrition targets
 * (calories / macros / water). Editable by hand or recomputed from the body
 * profile via AI (the same engine onboarding uses). Profile itself is edited in
 * Settings.
 */
export function DietPlanCard({ onSaved }: DietPlanCardProps) {
  const t = useT()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  // Body profile kept for the AI recalc (not edited here).
  const [profile, setProfile] = useState<{
    gender: 'male' | 'female'
    age: number
    height: number
    weight: number
    activityLevel: 'sedentary' | 'light' | 'moderate' | 'heavy'
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const s = await getUserSettings()
      if (cancelled) return
      if (s) {
        setForm({
          calories: s.target_calories != null ? String(s.target_calories) : '',
          protein: s.target_protein != null ? String(s.target_protein) : '',
          carbs: s.target_carbs != null ? String(s.target_carbs) : '',
          fat: s.target_fat != null ? String(s.target_fat) : '',
          water: mlToLiters(s.water_goal ?? DEFAULT_WATER_GOAL_ML),
        })
        if (s.gender && s.age && s.height && s.weight && s.activity_level) {
          setProfile({
            gender: s.gender as 'male' | 'female',
            age: s.age,
            height: s.height,
            weight: s.weight,
            activityLevel: s.activity_level as 'sedentary' | 'light' | 'moderate' | 'heavy',
          })
        }
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
        waterGoalMl: Math.round(Number(form.water) * 1000),
      })
      if (res.success) {
        toast({ title: t.plans.dietPlan.saved })
        onSaved?.()
      } else {
        toast({ variant: 'destructive', title: t.plans.dietPlan.saveFailed, description: tError(t, res.error) })
      }
    } finally {
      setSaving(false)
    }
  }, [form, onSaved, t, toast])

  if (loading) {
    return <Skeleton className="h-72 w-full rounded-2xl" />
  }

  return (
    <section className="glass glass-highlight rounded-2xl p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <UtensilsCrossed size={14} />
          </span>
          <h3 className="font-display text-sm font-semibold leading-tight text-foreground">
            {t.plans.dietPlan.title}
          </h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRecalc}
          disabled={recalculating}
          className="h-7 shrink-0 text-xs"
        >
          {recalculating ? <Loader2 size={13} className="animate-spin" /> : <Calculator size={13} />}
          {t.plans.dietPlan.recalc}
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label={t.plans.dietPlan.calories}>
          <Input className="h-8 text-sm" type="number" inputMode="numeric" value={form.calories} onChange={(e) => set('calories', e.target.value)} />
        </Field>
        <Field label={t.plans.dietPlan.protein}>
          <Input className="h-8 text-sm" type="number" inputMode="numeric" value={form.protein} onChange={(e) => set('protein', e.target.value)} />
        </Field>
        <Field label={t.plans.dietPlan.carbs}>
          <Input className="h-8 text-sm" type="number" inputMode="numeric" value={form.carbs} onChange={(e) => set('carbs', e.target.value)} />
        </Field>
        <Field label={t.plans.dietPlan.fat}>
          <Input className="h-8 text-sm" type="number" inputMode="numeric" value={form.fat} onChange={(e) => set('fat', e.target.value)} />
        </Field>
        <Field label={t.plans.dietPlan.waterGoal}>
          <Input
            className="h-8 text-sm"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0.25"
            value={form.water}
            onChange={(e) => set('water', e.target.value)}
          />
        </Field>
        <div className="flex items-end">
          <Button type="button" onClick={handleSave} disabled={saving} size="sm" className="h-8 w-full text-xs">
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {saving ? t.plans.dietPlan.saving : t.plans.dietPlan.save}
          </Button>
        </div>
      </div>
    </section>
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
