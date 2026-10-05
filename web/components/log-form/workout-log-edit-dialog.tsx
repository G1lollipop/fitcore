'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Plus, Save } from 'lucide-react'
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
import { updateWorkoutLog, createWorkoutLog } from '@/app/actions/logWorkout'
import type { WorkoutLogItem } from '@/app/actions/types'
import { elapsedLoggingMs, trackLoggingEvent } from '@/lib/analytics/logging-events'

interface WorkoutLogEditDialogProps {
  /** The entry being edited; `null` keeps the dialog closed (edit mode). */
  log?: WorkoutLogItem | null
  /**
   * `'edit'` (default) pre-fills from `log` and persists via `updateWorkoutLog`.
   * `'create'` starts empty and inserts a new row via `createWorkoutLog`.
   */
  mode?: 'edit' | 'create'
  /** Controls visibility in create mode (edit mode derives it from `log`). */
  open?: boolean
  /** Target calendar day (YYYY-MM-DD) for create-mode back-dating. */
  dateStr?: string
  onClose: () => void
  /** In create mode, receives the inserted row so callers can patch caches. */
  onSuccess?: (created?: WorkoutLogItem) => void
}

type EditFields = {
  workout_name: string
  /** Empty string means "no sets" → persisted as null. */
  sets: number | ''
  duration_minutes: number
  calories_burned: number
}

const EMPTY_FIELDS: EditFields = {
  workout_name: '',
  sets: '',
  duration_minutes: 0,
  calories_burned: 0,
}

/**
 * Shared create + edit form for a single workout entry.
 *
 * - Edit mode pre-fills from `log` and persists via `updateWorkoutLog`.
 * - Create mode starts empty and inserts a new `workout_logs` row via
 *   `createWorkoutLog` for the passed `dateStr` (so manual entries land on the
 *   day being viewed).
 *
 * Manual numeric entry throughout — it never re-runs AI parsing.
 */
export function WorkoutLogEditDialog({
  log,
  mode = 'edit',
  open,
  dateStr,
  onClose,
  onSuccess,
}: WorkoutLogEditDialogProps) {
  const t = useT()
  const { toast } = useToast()
  const isCreate = mode === 'create'
  const isOpen = isCreate ? !!open : (log ?? null) !== null

  const [fields, setFields] = useState<EditFields | null>(null)
  const [saving, setSaving] = useState(false)
  const editStartedAtRef = useRef<number | null>(null)

  useEffect(() => {
    editStartedAtRef.current = isOpen ? performance.now() : null
  }, [isOpen, log?.id])

  // Sync form state on the closed→open transition — React's "adjust state
  // during render" pattern, which avoids an extra effect + render pass.
  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (isOpen) {
      setFields(
        isCreate || !log
          ? { ...EMPTY_FIELDS }
          : {
              workout_name: log.workout_name,
              sets: log.sets ?? '',
              duration_minutes: log.duration_minutes,
              calories_burned: log.calories_burned,
            }
      )
      setSaving(false)
    }
  }

  const setField = <K extends keyof EditFields>(key: K, value: EditFields[K]) => {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const handleSave = async () => {
    if (!fields) return
    const payload = {
      workout_name: fields.workout_name.trim(),
      sets: fields.sets === '' ? null : fields.sets,
      duration_minutes: fields.duration_minutes,
      calories_burned: fields.calories_burned,
    }

    if (isCreate) {
      if (!payload.workout_name) return
      setSaving(true)
      const result = await createWorkoutLog(payload, dateStr)
      if (!result.success) {
        setSaving(false)
        toast({
          variant: 'destructive',
          title: t.logForm.create.createFailed,
          description: result.error ? tError(t, result.error) : t.logForm.edit.tryLater,
        })
        return
      }
      onSuccess?.(result.data)
      toast({ title: t.logForm.create.workoutAdded, description: payload.workout_name })
      onClose()
      return
    }

    // Edit mode.
    if (!log) return
    setSaving(true)
    const result = await updateWorkoutLog(log.id, payload)
    if (!result.success) {
      setSaving(false)
      toast({
        variant: 'destructive',
        title: t.logForm.edit.updateFailed,
        description: result.error ? tError(t, result.error) : t.logForm.edit.tryLater,
      })
      return
    }
    const changedFieldCount = (
      ['workout_name', 'sets', 'duration_minutes', 'calories_burned'] as const
    ).filter((field) => {
      const original = field === 'sets' ? (log.sets ?? '') : log[field]
      return fields[field] !== original
    }).length
    if (changedFieldCount > 0) {
      trackLoggingEvent('FitCore Logging Correction', {
        source: 'record',
        entry_point: 'record_editor',
        changed_field_count: changedFieldCount,
        log_type: 'workout',
        elapsed_ms: elapsedLoggingMs(editStartedAtRef.current ?? performance.now()),
      })
    }
    onSuccess?.()
    toast({ title: t.logForm.edit.updated, description: payload.workout_name })
    onClose()
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? t.logForm.create.workoutTitle : t.logForm.edit.workoutTitle}
          </DialogTitle>
          <DialogDescription>
            {isCreate ? t.logForm.create.workoutDesc : t.logForm.edit.workoutDesc}
          </DialogDescription>
        </DialogHeader>

        {fields && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="workout-name">{t.logForm.edit.workoutName}</Label>
              <Input
                id="workout-name"
                value={fields.workout_name}
                onChange={(e) => setField('workout_name', e.target.value)}
                disabled={saving}
                autoFocus={isCreate}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="workout-sets">{t.logForm.edit.sets}</Label>
                <Input
                  id="workout-sets"
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
                <Label htmlFor="workout-duration">{t.logForm.edit.duration}</Label>
                <Input
                  id="workout-duration"
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
                <Label htmlFor="workout-burned">{t.logForm.edit.burned}</Label>
                <Input
                  id="workout-burned"
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
          <Button
            onClick={handleSave}
            disabled={saving || (isCreate && !fields?.workout_name.trim())}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isCreate ? (
              <Plus className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isCreate ? t.logForm.create.save : t.logForm.edit.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
