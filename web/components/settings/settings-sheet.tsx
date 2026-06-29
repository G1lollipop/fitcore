'use client'

import { useCallback, useEffect, useState } from 'react'
import { Calculator, LogOut, Loader2 } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { signOut } from '@/app/actions/auth'
import { getUserSettings, calculateNutritionRecommendation } from '@/app/actions/onboarding'
import { updateUserSettings } from '@/app/actions/settings'

type Gender = 'male' | 'female'
type Activity = 'sedentary' | 'light' | 'moderate' | 'heavy'
const ACTIVITY_OPTIONS: Activity[] = ['sedentary', 'light', 'moderate', 'heavy']

interface FormState {
  gender: Gender
  age: string
  height: string
  weight: string
  activityLevel: Activity
  targetCalories: string
  targetProtein: string
  targetCarbs: string
  targetFat: string
}

const EMPTY_FORM: FormState = {
  gender: 'male',
  age: '',
  height: '',
  weight: '',
  activityLevel: 'moderate',
  targetCalories: '',
  targetProtein: '',
  targetCarbs: '',
  targetFat: '',
}

interface SettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function SettingsSheet({ open, onOpenChange, onSaved }: SettingsSheetProps) {
  const t = useT()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  // Load current settings each time the sheet opens so it always reflects the
  // latest saved values.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      const s = await getUserSettings()
      if (cancelled) return
      if (s) {
        setForm({
          gender: (s.gender as Gender) ?? 'male',
          age: s.age != null ? String(s.age) : '',
          height: s.height != null ? String(s.height) : '',
          weight: s.weight != null ? String(s.weight) : '',
          activityLevel: (s.activity_level as Activity) ?? 'moderate',
          targetCalories: s.target_calories != null ? String(s.target_calories) : '',
          targetProtein: s.target_protein != null ? String(s.target_protein) : '',
          targetCarbs: s.target_carbs != null ? String(s.target_carbs) : '',
          targetFat: s.target_fat != null ? String(s.target_fat) : '',
        })
      } else {
        setForm(EMPTY_FORM)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const set = useCallback(
    <K extends keyof FormState>(key: K, val: FormState[K]) =>
      setForm((prev) => ({ ...prev, [key]: val })),
    []
  )

  const profileNumbers = () => ({
    gender: form.gender,
    age: Number(form.age),
    height: Number(form.height),
    weight: Number(form.weight),
    activityLevel: form.activityLevel,
  })

  const handleRecalc = useCallback(async () => {
    const p = profileNumbers()
    if (!p.age || !p.height || !p.weight) {
      toast({ variant: 'destructive', title: t.settings.profileIncomplete })
      return
    }
    setRecalculating(true)
    try {
      const res = await calculateNutritionRecommendation(p)
      if (res.success && res.recommendation) {
        const r = res.recommendation
        setForm((prev) => ({
          ...prev,
          targetCalories: String(r.targetCalories),
          targetProtein: String(r.targetProtein),
          targetCarbs: String(r.targetCarbs),
          targetFat: String(r.targetFat),
        }))
        toast({ title: t.settings.recalcDone })
      } else {
        toast({ variant: 'destructive', title: t.settings.recalcFailed, description: tError(t, res.error) })
      }
    } finally {
      setRecalculating(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, t])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await updateUserSettings({
        ...profileNumbers(),
        targetCalories: Number(form.targetCalories),
        targetProtein: Number(form.targetProtein),
        targetCarbs: Number(form.targetCarbs),
        targetFat: Number(form.targetFat),
      })
      if (res.success) {
        toast({ title: t.settings.saved })
        onSaved?.()
        onOpenChange(false)
      } else {
        toast({ variant: 'destructive', title: t.settings.saveFailed, description: tError(t, res.error) })
      }
    } finally {
      setSaving(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, onSaved, onOpenChange, t])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto bg-background p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border bg-card px-5 py-4">
          <SheetTitle className="font-display text-base">{t.settings.title}</SheetTitle>
          <SheetDescription className="text-[11px]">{t.settings.subtitle}</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4 p-5">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : (
          <div className="space-y-6 p-5">
            {/* ── Profile ── */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.settings.profileTitle}
              </h3>

              <div className="space-y-1.5">
                <Label>{t.settings.gender}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['male', 'female'] as Gender[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => set('gender', g)}
                      className={cn(
                        'h-9 rounded-md border text-sm font-medium transition-colors',
                        form.gender === g
                          ? 'border-primary/40 bg-primary/12 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {g === 'male' ? t.settings.male : t.settings.female}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Field label={t.settings.age}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.age}
                    onChange={(e) => set('age', e.target.value)}
                  />
                </Field>
                <Field label={t.settings.height}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.height}
                    onChange={(e) => set('height', e.target.value)}
                  />
                </Field>
                <Field label={t.settings.weight}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.weight}
                    onChange={(e) => set('weight', e.target.value)}
                  />
                </Field>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="settings-activity">{t.settings.activity}</Label>
                <select
                  id="settings-activity"
                  value={form.activityLevel}
                  onChange={(e) => set('activityLevel', e.target.value as Activity)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {ACTIVITY_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {t.settings.activityLevels[a]}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {/* ── Nutrition goals ── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.settings.goalsTitle}
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRecalc}
                  disabled={recalculating}
                  className="h-7 text-xs"
                >
                  {recalculating ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Calculator size={13} />
                  )}
                  {t.settings.recalc}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label={t.settings.calories}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.targetCalories}
                    onChange={(e) => set('targetCalories', e.target.value)}
                  />
                </Field>
                <Field label={t.settings.protein}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.targetProtein}
                    onChange={(e) => set('targetProtein', e.target.value)}
                  />
                </Field>
                <Field label={t.settings.carbs}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.targetCarbs}
                    onChange={(e) => set('targetCarbs', e.target.value)}
                  />
                </Field>
                <Field label={t.settings.fat}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={form.targetFat}
                    onChange={(e) => set('targetFat', e.target.value)}
                  />
                </Field>
              </div>
            </section>

            <Button type="button" onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              {saving ? t.settings.saving : t.settings.save}
            </Button>

            {/* ── Appearance ── */}
            <section className="flex items-center justify-between border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.settings.appearanceTitle}
              </h3>
              <ThemeToggle />
            </section>

            {/* ── Account ── */}
            <section className="border-t border-border pt-4">
              <form action={signOut}>
                <Button type="submit" variant="outline" className="w-full text-destructive">
                  <LogOut size={15} />
                  {t.settings.signOut}
                </Button>
              </form>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
