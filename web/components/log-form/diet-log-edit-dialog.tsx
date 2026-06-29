'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import { updateDietLog } from '@/app/actions/updateDietLog'
import type { DietLogItem } from '@/app/actions/types'

interface DietLogEditDialogProps {
  /** The entry being edited; `null` keeps the dialog closed. */
  log: DietLogItem | null
  onClose: () => void
  onSuccess?: () => void
}

type EditFields = Pick<DietLogItem, 'food_name' | 'calories' | 'protein' | 'carbs' | 'fat'>

/**
 * Shared in-place editor for a single food entry. Pre-fills from the passed
 * `log`, validates client-side numbers, and persists via `updateDietLog`
 * (which recomputes the day's stats). Used by the meal timeline, the dashboard
 * daily log, and any other surface that lists food entries.
 */
export function DietLogEditDialog({ log, onClose, onSuccess }: DietLogEditDialogProps) {
  const t = useT()
  const { toast } = useToast()
  const [fields, setFields] = useState<EditFields | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (log) {
      setFields({
        food_name: log.food_name,
        calories: log.calories,
        protein: log.protein,
        carbs: log.carbs,
        fat: log.fat,
      })
      setSaving(false)
    }
  }, [log])

  const setField = <K extends keyof EditFields>(key: K, value: EditFields[K]) => {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const handleSave = async () => {
    if (!log || !fields) return
    setSaving(true)
    const next: DietLogItem = {
      id: log.id,
      logged_at: log.logged_at,
      food_name: fields.food_name,
      calories: fields.calories,
      protein: fields.protein,
      carbs: fields.carbs,
      fat: fields.fat,
    }
    const result = await updateDietLog(log.id, next)
    if (!result.success) {
      setSaving(false)
      toast({
        variant: 'destructive',
        title: t.logForm.edit.updateFailed,
        description: result.error ? tError(t, result.error) : t.logForm.edit.tryLater,
      })
      return
    }
    onSuccess?.()
    toast({ title: t.logForm.edit.updated, description: `${next.food_name} · ${next.calories} kcal` })
    onClose()
  }

  return (
    <Dialog
      open={log !== null}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.logForm.edit.dietTitle}</DialogTitle>
          <DialogDescription>{t.logForm.edit.dietDesc}</DialogDescription>
        </DialogHeader>

        {fields && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="edit-food-name">{t.logForm.edit.foodName}</Label>
              <Input
                id="edit-food-name"
                value={fields.food_name}
                onChange={(e) => setField('food_name', e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-calories">{t.logForm.edit.calories}</Label>
                <Input
                  id="edit-calories"
                  type="number"
                  inputMode="numeric"
                  value={fields.calories}
                  onChange={(e) => setField('calories', Math.max(0, Number(e.target.value) || 0))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-protein">{t.logForm.edit.protein}</Label>
                <Input
                  id="edit-protein"
                  type="number"
                  inputMode="numeric"
                  value={fields.protein}
                  onChange={(e) => setField('protein', Math.max(0, Number(e.target.value) || 0))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-carbs">{t.logForm.edit.carbs}</Label>
                <Input
                  id="edit-carbs"
                  type="number"
                  inputMode="numeric"
                  value={fields.carbs}
                  onChange={(e) => setField('carbs', Math.max(0, Number(e.target.value) || 0))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-fat">{t.logForm.edit.fat}</Label>
                <Input
                  id="edit-fat"
                  type="number"
                  inputMode="numeric"
                  value={fields.fat}
                  onChange={(e) => setField('fat', Math.max(0, Number(e.target.value) || 0))}
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t.logForm.edit.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
