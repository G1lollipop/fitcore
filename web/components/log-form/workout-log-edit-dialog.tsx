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
import { updateWorkoutLog } from '@/app/actions/logWorkout'
import type { WorkoutLogItem } from '@/app/actions/types'

interface WorkoutLogEditDialogProps {
  /** The entry being edited; `null` keeps the dialog closed. */
  log: WorkoutLogItem | null
  onClose: () => void
  onSuccess?: () => void
}

type EditFields = {
  workout_name: string
  /** Empty string means "no sets" → persisted as null. */
  sets: number | ''
  duration_minutes: number
  calories_burned: number
}

/**
 * Shared in-place editor for a single workout entry. Pre-fills from the passed
 * `log` and persists via `updateWorkoutLog` (which recomputes the day's stats).
 * A manual numeric edit — it does not re-run AI parsing.
 */
export function WorkoutLogEditDialog({ log, onClose, onSuccess }: WorkoutLogEditDialogProps) {
  const t = useT()
  const { toast } = useToast()
  const [fields, setFields] = useState<EditFields | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (log) {
      setFields({
        workout_name: log.workout_name,
        sets: log.sets ?? '',
        duration_minutes: log.duration_minutes,
        calories_burned: log.calories_burned,
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
    const result = await updateWorkoutLog(log.id, {
      workout_name: fields.workout_name,
      sets: fields.sets === '' ? null : fields.sets,
      duration_minutes: fields.duration_minutes,
      calories_burned: fields.calories_burned,
    })
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
    toast({ title: t.logForm.edit.updated, description: fields.workout_name })
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
          <DialogTitle>{t.logForm.edit.workoutTitle}</DialogTitle>
          <DialogDescription>{t.logForm.edit.workoutDesc}</DialogDescription>
        </DialogHeader>

        {fields && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="edit-workout-name">{t.logForm.edit.workoutName}</Label>
              <Input
                id="edit-workout-name"
                value={fields.workout_name}
                onChange={(e) => setField('workout_name', e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edit-sets">{t.logForm.edit.sets}</Label>
                <Input
                  id="edit-sets"
                  type="number"
                  inputMode="numeric"
                  value={fields.sets}
                  onChange={(e) =>
                    setField(
                      'sets',
                      e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-duration">{t.logForm.edit.duration}</Label>
                <Input
                  id="edit-duration"
                  type="number"
                  inputMode="numeric"
                  value={fields.duration_minutes}
                  onChange={(e) =>
                    setField('duration_minutes', Math.max(0, Number(e.target.value) || 0))
                  }
                  disabled={saving}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="edit-burned">{t.logForm.edit.burned}</Label>
                <Input
                  id="edit-burned"
                  type="number"
                  inputMode="numeric"
                  value={fields.calories_burned}
                  onChange={(e) =>
                    setField('calories_burned', Math.max(0, Number(e.target.value) || 0))
                  }
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
