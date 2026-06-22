'use client'

import { Loader2, Save } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updatePlan } from '@/app/actions/plans'
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'

export interface EditablePlan {
  id: string
  name: string
  description?: string | null
  goal?: string | null
  experience_level?: string | null
  frequency_per_week?: number | null
  duration_weeks?: number | null
}

interface PlanEditDialogProps {
  plan: EditablePlan | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

/**
 * Lightweight editor for a plan's metadata, backing the previously-unused
 * `updatePlan` action with a UI. Day/exercise structure is edited via the
 * wizard or adjusted conversationally through the coach; this covers the
 * common "rename / retarget / change cadence" edits.
 */
export function PlanEditDialog({ plan, onOpenChange, onSaved }: PlanEditDialogProps) {
  const t = useT()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [goal, setGoal] = useState('general')
  const [level, setLevel] = useState('beginner')
  const [frequency, setFrequency] = useState(3)
  const [duration, setDuration] = useState<number | ''>('')

  // Seed the form whenever a new plan is opened.
  const [seededId, setSeededId] = useState<string | null>(null)
  if (plan && plan.id !== seededId) {
    setSeededId(plan.id)
    setName(plan.name ?? '')
    setDescription(plan.description ?? '')
    setGoal(plan.goal ?? 'general')
    setLevel(plan.experience_level ?? 'beginner')
    setFrequency(plan.frequency_per_week ?? 3)
    setDuration(plan.duration_weeks ?? '')
  }

  const handleSave = async () => {
    if (!plan) return
    setSaving(true)
    const updates: Record<string, unknown> = {
      name: name.trim() || plan.name,
      description: description.trim() || null,
      goal,
      experience_level: level,
      frequency_per_week: Math.min(7, Math.max(1, Math.round(frequency) || 1)),
      duration_weeks: duration === '' ? null : Math.max(1, Math.round(Number(duration))),
    }
    const res = await updatePlan(plan.id, updates)
    setSaving(false)
    if (!res.success) {
      const err = (res as { error?: unknown }).error
      toast({
        variant: 'destructive',
        title: t.plans.edit.failed,
        description: typeof err === 'string' ? tError(t, err) : t.plans.list.tryLater,
      })
      return
    }
    toast({ title: t.plans.edit.success, description: t.plans.edit.successDesc })
    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={plan !== null} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.plans.edit.title}</DialogTitle>
          <DialogDescription>{plan?.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="plan-name">{t.plans.edit.nameLabel}</Label>
            <Input
              id="plan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="plan-desc">{t.plans.edit.descLabel}</Label>
            <Input
              id="plan-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="plan-goal">{t.plans.edit.goalLabel}</Label>
              <select
                id="plan-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                disabled={saving}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary/60"
              >
                {Object.entries(t.labels.goals).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-level">{t.plans.edit.levelLabel}</Label>
              <select
                id="plan-level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                disabled={saving}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary/60"
              >
                {Object.entries(t.labels.levels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="plan-freq">{t.plans.edit.freqLabel}</Label>
              <Input
                id="plan-freq"
                type="number"
                inputMode="numeric"
                min={1}
                max={7}
                value={frequency}
                onChange={(e) => setFrequency(Number(e.target.value) || 1)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-duration">{t.plans.edit.durationLabel}</Label>
              <Input
                id="plan-duration"
                type="number"
                inputMode="numeric"
                min={1}
                value={duration}
                onChange={(e) =>
                  setDuration(e.target.value === '' ? '' : Number(e.target.value))
                }
                disabled={saving}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t.plans.edit.cancel}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? t.plans.edit.saving : t.plans.edit.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
