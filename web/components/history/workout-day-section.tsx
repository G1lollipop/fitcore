'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Dumbbell, Flame, Mic, Pencil, PencilLine, Sparkles, Target, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { logWorkout, deleteWorkoutLog } from '@/app/actions/logWorkout'
import { getWorkoutHistory } from '@/app/actions/history'
import { WorkoutLogEditDialog } from '@/components/log-form/workout-log-edit-dialog'
import { useToast } from '@/hooks/use-toast'
import { useSpeechInput } from '@/lib/hooks/use-speech-input'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useDashboardActions } from '@/lib/queries/dashboard'
import { toLocalDateStr } from '@/lib/utils/date'
import type { WorkoutLogItem } from '@/app/actions/types'

interface WorkoutDaySectionProps {
  date: Date
  userId?: string
  onChange?: () => void
}

const toDateStr = toLocalDateStr

/**
 * The training slice of the History page for a single (parent-controlled) day:
 * a glanceable summary + add-workout + the day's workout list with inline edit
 * / delete. Mirrors the old per-day drawer but renders inline so diet and
 * training stack under one shared date.
 */
export function WorkoutDaySection({ date, userId, onChange }: WorkoutDaySectionProps) {
  const { toast } = useToast()
  const t = useT()
  const qc = useQueryClient()
  const { invalidate } = useDashboardActions()
  const [inputText, setInputText] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [editing, setEditing] = useState<WorkoutLogItem | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  // Text captured when dictation starts, so speech appends to it.
  const speechBaseRef = useRef('')

  const dateStr = toDateStr(date)
  const todayStr = toDateStr(new Date())
  const isFuture = dateStr > todayStr
  const addingToday = dateStr === todayStr
  const canEdit = !!userId && !isFuture

  const speech = useSpeechInput({
    lang: t.common.locale,
    onTranscript: (transcript) => {
      const base = speechBaseRef.current
      setInputText(base ? `${base} ${transcript}`.trim() : transcript)
    },
    onError: (error) => {
      if (error === 'no-speech' || error === 'aborted') return
      toast({
        variant: 'destructive',
        title: t.training.drawer.logFailed,
        description:
          error === 'not-allowed' || error === 'service-not-allowed'
            ? t.logForm.quick.micDenied
            : t.logForm.quick.micError,
      })
    },
  })

  const toggleMic = () => {
    if (speech.listening) {
      speech.stop()
      return
    }
    speechBaseRef.current = inputText.trim()
    speech.start()
  }

  const { data: logs = [], isLoading: loading } = useQuery({
    queryKey: ['workouts', dateStr],
    queryFn: () => getWorkoutHistory(dateStr, dateStr).then((g) => g[dateStr] ?? []),
    enabled: !!userId,
  })

  const patchLogs = useCallback(
    (fn: (logs: WorkoutLogItem[]) => WorkoutLogItem[]) => {
      qc.setQueryData<WorkoutLogItem[]>(['workouts', dateStr], (old) => fn(old ?? []))
    },
    [qc, dateStr]
  )

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['workouts', dateStr] })
    if (addingToday) invalidate()
    onChange?.()
  }, [qc, dateStr, addingToday, invalidate, onChange])

  // Manual structured create resolved server-side already: splice the real row
  // into the day cache for an instant update, then reconcile in the background.
  const handleManualCreated = (created?: WorkoutLogItem) => {
    if (!created) return
    patchLogs((prev) => [...prev, created])
    refresh()
  }

  // Non-blocking: drop an optimistic `pending` placeholder and clear the input
  // immediately, then reconcile in the background when the parse resolves.
  const handleAdd = () => {
    const text = inputText.trim()
    if (!text || !canEdit) return

    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const placeholder: WorkoutLogItem = {
      id: tempId,
      workout_name: text,
      sets: null,
      duration_minutes: 0,
      calories_burned: 0,
      logged_at: addingToday ? new Date().toISOString() : `${dateStr}T12:00:00`,
      pending: true,
    }
    patchLogs((prev) => [...prev, placeholder])
    setInputText('')
    setPendingCount((c) => c + 1)

    void (async () => {
      try {
        const result = await logWorkout(text, undefined, dateStr)
        if (result.success && result.data) {
          const saved = result.data
          patchLogs((prev) => prev.map((w) => (w.id === tempId ? saved : w)))
          toast({
            title: t.training.drawer.logSuccess,
            description: t.training.drawer.added(saved.workout_name),
          })
          if (addingToday) invalidate()
          onChange?.()
        } else {
          patchLogs((prev) => prev.filter((w) => w.id !== tempId))
          toast({ variant: 'destructive', title: t.training.drawer.logFailed, description: tError(t, result.error) })
        }
      } catch (error) {
        console.error('Failed to add workout:', error)
        patchLogs((prev) => prev.filter((w) => w.id !== tempId))
        toast({ variant: 'destructive', title: t.training.drawer.logFailed, description: t.training.drawer.parsing })
      } finally {
        setPendingCount((c) => Math.max(0, c - 1))
      }
    })()
  }

  const totals = useMemo(
    () =>
      logs.reduce(
        (acc, l) => ({
          sessions: acc.sessions + 1,
          minutes: acc.minutes + (l.duration_minutes ?? 0),
          kcal: acc.kcal + (l.calories_burned ?? 0),
        }),
        { sessions: 0, minutes: 0, kcal: 0 }
      ),
    [logs]
  )

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      className="glass glass-highlight rounded-2xl p-4 sm:p-5"
    >
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-base font-semibold text-foreground">
          {t.history.trainingTitle}
        </h3>
        {logs.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {t.training.drawer.minutesValue(totals.minutes)} · {totals.kcal} kcal
          </span>
        )}
      </header>

      {canEdit && (
        <div className="mb-4 flex items-stretch gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-border bg-secondary/50 px-3 py-2 transition-colors focus-within:border-primary/40 focus-within:bg-card">
            <Sparkles size={14} className="shrink-0 text-primary" aria-hidden />
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder={speech.listening ? t.logForm.quick.micListening : t.training.drawer.placeholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
            />
            {speech.supported && (
              <button
                type="button"
                onClick={toggleMic}
                aria-label={speech.listening ? t.logForm.quick.micStop : t.logForm.quick.micStart}
                aria-pressed={speech.listening}
                className={cn(
                  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                  speech.listening
                    ? 'bg-destructive/15 text-destructive'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <Mic size={15} className={speech.listening ? 'animate-pulse' : undefined} />
              </button>
            )}
            <button
              type="button"
              onClick={handleAdd}
              disabled={!inputText.trim()}
              className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendingCount > 0 ? t.training.drawer.parsing : t.common.add}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            aria-label={t.logForm.manual.workoutAria}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-secondary/50 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <PencilLine size={14} aria-hidden />
            {t.logForm.manual.label}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title={addingToday ? t.training.drawer.emptyTodayTitle : t.training.drawer.emptyOtherTitle}
          description={addingToday ? t.training.drawer.emptyTodayDesc : undefined}
          size="inset"
        />
      ) : (
        <div className="max-h-[44vh] overflow-y-auto overflow-x-hidden rounded-xl pr-1">
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {logs.map((log) => (
                <WorkoutRow
                  key={log.id}
                  log={log}
                  canEdit={canEdit}
                  userId={userId}
                  onChange={refresh}
                  onEdit={canEdit ? setEditing : undefined}
                />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}

      <WorkoutLogEditDialog log={editing} onClose={() => setEditing(null)} onSuccess={refresh} />
      <WorkoutLogEditDialog
        mode="create"
        open={manualOpen}
        dateStr={dateStr}
        onClose={() => setManualOpen(false)}
        onSuccess={handleManualCreated}
      />
    </motion.section>
  )
}

interface WorkoutRowProps {
  log: WorkoutLogItem
  canEdit: boolean
  userId?: string
  onChange: () => void
  onEdit?: (log: WorkoutLogItem) => void
}

function WorkoutRow({ log, canEdit, userId, onChange, onEdit }: WorkoutRowProps) {
  const { toast } = useToast()
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const rowPending = !!log.pending
  const rowEditable = canEdit && !rowPending

  const handleDelete = () => {
    if (!rowEditable || !userId || isPending) return
    startTransition(async () => {
      const result = await deleteWorkoutLog(log.id)
      if (!result.success) {
        toast({
          variant: 'destructive',
          title: t.training.drawer.deleteFailed,
          description: result.error ? tError(t, result.error) : t.training.drawer.tryLater,
        })
        return
      }
      toast({ title: t.training.drawer.deleted, description: log.workout_name })
      onChange()
    })
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="group flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
        <Dumbbell size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{log.workout_name}</p>
        {rowPending ? (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {t.training.drawer.parsing}
          </p>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
            {log.sets ? (
              <span className="inline-flex items-center gap-1">
                <Target size={10} />
                {t.training.drawer.sets(log.sets)}
              </span>
            ) : null}
            {log.duration_minutes ? (
              <span className="inline-flex items-center gap-1">
                <Clock size={10} />
                {t.training.drawer.minutesValue(log.duration_minutes)}
              </span>
            ) : null}
            {log.calories_burned ? (
              <span className="inline-flex items-center gap-1">
                <Flame size={10} />
                {log.calories_burned} kcal
              </span>
            ) : null}
          </div>
        )}
      </div>
      {rowEditable && onEdit && (
        <button
          type="button"
          onClick={() => onEdit(log)}
          disabled={isPending}
          aria-label={t.training.drawer.editAria(log.workout_name)}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9'
          )}
        >
          <Pencil size={14} />
        </button>
      )}
      {rowEditable && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          aria-label={t.training.drawer.deleteAria(log.workout_name)}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9'
          )}
        >
          <Trash2 size={14} />
        </button>
      )}
    </motion.li>
  )
}
