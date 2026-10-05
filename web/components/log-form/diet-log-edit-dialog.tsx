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
import { updateDietLog } from '@/app/actions/updateDietLog'
import { saveDietLog } from '@/app/actions/saveDietLog'
import type { DietLogItem } from '@/app/actions/types'
import { elapsedLoggingMs, trackLoggingEvent } from '@/lib/analytics/logging-events'

/** Client-side row id for optimistic inserts, with a non-crypto fallback. */
function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

interface DietLogEditDialogProps {
  /** The entry being edited; `null` keeps the dialog closed (edit mode). */
  log?: DietLogItem | null
  /**
   * `'edit'` (default) pre-fills from `log` and persists via `updateDietLog`.
   * `'create'` starts empty and inserts a new row via `saveDietLog`.
   */
  mode?: 'edit' | 'create'
  /** Controls visibility in create mode (edit mode derives it from `log`). */
  open?: boolean
  /** Target calendar day (YYYY-MM-DD) for create-mode back-dating. */
  dateStr?: string
  onClose: () => void
  /** In create mode, receives the inserted row so callers can patch caches. */
  onSuccess?: (created?: DietLogItem) => void
}

type EditFields = Pick<DietLogItem, 'food_name' | 'calories' | 'protein' | 'carbs' | 'fat'>

const EMPTY_FIELDS: EditFields = { food_name: '', calories: 0, protein: 0, carbs: 0, fat: 0 }

/**
 * Shared create + edit form for a single food entry.
 *
 * - Edit mode pre-fills from `log`, validates client-side numbers, and persists
 *   via `updateDietLog` (which recomputes the day's stats).
 * - Create mode starts empty and inserts a new `food_logs` row via `saveDietLog`
 *   for the passed `dateStr` (so manual entries land on the day being viewed).
 *
 * Used by the meal timeline, the History diet/workout sections, and the home
 * Quick Log bar.
 */
export function DietLogEditDialog({
  log,
  mode = 'edit',
  open,
  dateStr,
  onClose,
  onSuccess,
}: DietLogEditDialogProps) {
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
  // during render" pattern (https://react.dev/learn/you-might-not-need-an-effect),
  // which avoids an extra effect + render pass. These dialogs always mount
  // closed, so the initial (no-op) render never needs to seed fields.
  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (isOpen) {
      setFields(
        isCreate || !log
          ? { ...EMPTY_FIELDS }
          : {
              food_name: log.food_name,
              calories: log.calories,
              protein: log.protein,
              carbs: log.carbs,
              fat: log.fat,
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
    if (isCreate) {
      if (!fields.food_name.trim()) return
      setSaving(true)
      const created: DietLogItem = {
        id: newId(),
        food_name: fields.food_name.trim(),
        calories: fields.calories,
        protein: fields.protein,
        carbs: fields.carbs,
        fat: fields.fat,
        // Server resolves the real timestamp from `dateStr`; this is a
        // reasonable default for the "today" case.
        logged_at: new Date().toISOString(),
      }
      const result = await saveDietLog(created, dateStr)
      if (!result.success) {
        setSaving(false)
        toast({
          variant: 'destructive',
          title: t.logForm.create.createFailed,
          description: result.error ? tError(t, result.error) : t.logForm.edit.tryLater,
        })
        return
      }
      onSuccess?.(result.data ?? created)
      toast({
        title: t.logForm.create.foodAdded,
        description: `${created.food_name} · ${created.calories} kcal`,
      })
      onClose()
      return
    }

    // Edit mode.
    if (!log) return
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
    const changedFieldCount = (
      ['food_name', 'calories', 'protein', 'carbs', 'fat'] as const
    ).filter((field) => fields[field] !== log[field]).length
    if (changedFieldCount > 0) {
      trackLoggingEvent('FitCore Logging Correction', {
        source: 'record',
        entry_point: 'record_editor',
        changed_field_count: changedFieldCount,
        log_type: 'food',
        elapsed_ms: elapsedLoggingMs(editStartedAtRef.current ?? performance.now()),
      })
    }
    onSuccess?.()
    toast({
      title: t.logForm.edit.updated,
      description: `${next.food_name} · ${next.calories} kcal`,
    })
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
            {isCreate ? t.logForm.create.dietTitle : t.logForm.edit.dietTitle}
          </DialogTitle>
          <DialogDescription>
            {isCreate ? t.logForm.create.dietDesc : t.logForm.edit.dietDesc}
          </DialogDescription>
        </DialogHeader>

        {fields && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="diet-food-name">{t.logForm.edit.foodName}</Label>
              <Input
                id="diet-food-name"
                value={fields.food_name}
                onChange={(e) => setField('food_name', e.target.value)}
                disabled={saving}
                autoFocus={isCreate}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="diet-calories">{t.logForm.edit.calories}</Label>
                <Input
                  id="diet-calories"
                  type="number"
                  inputMode="numeric"
                  value={fields.calories}
                  onChange={(e) => setField('calories', Math.max(0, Number(e.target.value) || 0))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="diet-protein">{t.logForm.edit.protein}</Label>
                <Input
                  id="diet-protein"
                  type="number"
                  inputMode="numeric"
                  value={fields.protein}
                  onChange={(e) => setField('protein', Math.max(0, Number(e.target.value) || 0))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="diet-carbs">{t.logForm.edit.carbs}</Label>
                <Input
                  id="diet-carbs"
                  type="number"
                  inputMode="numeric"
                  value={fields.carbs}
                  onChange={(e) => setField('carbs', Math.max(0, Number(e.target.value) || 0))}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="diet-fat">{t.logForm.edit.fat}</Label>
                <Input
                  id="diet-fat"
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
          <Button
            onClick={handleSave}
            disabled={saving || (isCreate && !fields?.food_name.trim())}
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
