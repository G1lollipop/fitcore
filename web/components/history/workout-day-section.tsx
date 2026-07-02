'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Clock, Dumbbell, Flame, Mic, Pencil, PencilLine, Sparkles, Target, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { logWorkout, deleteWorkoutLog } from '@/app/actions/logWorkout'
import { getWorkoutHistory } from '@/app/actions/history'
import { WorkoutLogEditDialog } from '@/components/log-form/workout-log-edit-dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
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
  weekData?: Record<string, WorkoutLogItem[]>
  isLoadingWeek?: boolean
}

const toDateStr = toLocalDateStr

function buildWeekChartData(
  todayStr: string,
  weekData: Record<string, WorkoutLogItem[]> | undefined
) {
  const data: Array<{
    date: string
    label: string
    sessions: number
    minutes: number
    kcal: number
  }> = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(`${todayStr}T12:00:00`)
    date.setDate(date.getDate() - i)
    const dateStr = toLocalDateStr(date)
    const logs = weekData?.[dateStr] ?? []
    const totals = logs.reduce(
      (acc, l) => ({
        sessions: acc.sessions + 1,
        minutes: acc.minutes + (l.duration_minutes ?? 0),
        kcal: acc.kcal + (l.calories_burned ?? 0),
      }),
      { sessions: 0, minutes: 0, kcal: 0 }
    )
    data.push({
      date: dateStr,
      label: date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
      ...totals,
    })
  }
  return data
}

/**
 * Compact, expandable training card for the Record page. Tapping the card opens
 * a bottom sheet with the day's workout list and a 7-day training trend chart.
 */
export function WorkoutDaySection({
  date,
  userId,
  onChange,
  weekData,
  isLoadingWeek,
}: WorkoutDaySectionProps) {
  const { toast } = useToast()
  const t = useT()
  const qc = useQueryClient()
  const { invalidate } = useDashboardActions()
  const [inputText, setInputText] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [editing, setEditing] = useState<WorkoutLogItem | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const speechBaseRef = useRef('')

  const dateStr = toDateStr(date)
  const todayStr = toDateStr(new Date())
  const isFuture = dateStr > todayStr
  const addingToday = dateStr === todayStr
  const canEdit = !!userId && !isFuture

  const rangeLogs = weekData?.[dateStr]
  const { data: fetchedLogs } = useQuery({
    queryKey: ['workouts', dateStr],
    queryFn: () => getWorkoutHistory(dateStr, dateStr).then((g) => g[dateStr] ?? []),
    enabled: !!userId && !isLoadingWeek && !rangeLogs,
  })
  const logs = useMemo(() => rangeLogs ?? fetchedLogs ?? [], [rangeLogs, fetchedLogs])
  const chartData = useMemo(() => buildWeekChartData(todayStr, weekData), [todayStr, weekData])

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

  const patchLogs = useCallback(
    (fn: (logs: WorkoutLogItem[]) => WorkoutLogItem[]) => {
      qc.setQueryData<WorkoutLogItem[]>(['workouts', dateStr], (old) => fn(old ?? []))
    },
    [qc, dateStr]
  )

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['workouts', dateStr] })
    void qc.invalidateQueries({ queryKey: ['workouts', 'range'] })
    if (addingToday) invalidate()
    onChange?.()
  }, [qc, dateStr, addingToday, invalidate, onChange])

  const handleManualCreated = (created?: WorkoutLogItem) => {
    if (!created) return
    patchLogs((prev) => [...prev, created])
    refresh()
  }

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

  if (isLoadingWeek) {
    return <Skeleton className="h-28 w-full rounded-2xl" />
  }

  return (
    <Sheet open={expanded} onOpenChange={setExpanded}>
      <SheetTrigger asChild>
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="glass glass-highlight block w-full rounded-2xl p-3 text-left"
          aria-label={t.history.expandAria}
        >
          <div className="flex w-full items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-semibold text-foreground">{t.history.trainingTitle}</h3>
              <p className="text-[11px] text-muted-foreground">{t.history.tapToExpand}</p>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground">
              <ChevronDown size={14} />
            </div>
          </div>

          {/* Compact summary */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border/50 bg-card/40 p-2">
              <p className="truncate text-[10px] text-muted-foreground">{t.history.sessions}</p>
              <p className="font-display text-sm font-semibold tabular-nums text-foreground">{totals.sessions}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card/40 p-2">
              <p className="truncate text-[10px] text-muted-foreground">{t.training.drawer.duration}</p>
              <p className="font-display text-sm font-semibold tabular-nums text-foreground">
                {t.training.drawer.minutesValue(totals.minutes)}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card/40 p-2">
              <p className="truncate text-[10px] text-muted-foreground">{t.training.drawer.burned}</p>
              <p className="font-display text-sm font-semibold tabular-nums text-foreground">{totals.kcal} kcal</p>
            </div>
          </div>
        </motion.button>
      </SheetTrigger>

      <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl p-0">
        <div className="flex h-full flex-col">
          <SheetHeader className="px-4 pt-5 pb-2">
            <SheetTitle className="font-display text-lg">
              {date.toLocaleDateString(t.common.locale, {
                month: 'short',
                day: 'numeric',
                weekday: 'short',
              })}
              {' · '}{t.history.trainingTitle}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
            {/* 7-day training trend */}
            <div className="rounded-2xl border border-border/50 bg-card/40 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t.history.last7Days} · {t.history.workoutTrend}</p>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                      }}
                      labelStyle={{ color: 'var(--foreground)' }}
                    />
                    <Bar yAxisId="left" dataKey="minutes" name={t.history.durationTrend} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="kcal" name={t.common.kcal} fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Add input */}
            {canEdit && (
              <div className="flex items-stretch gap-2">
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
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/50 px-0 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <PencilLine size={16} aria-hidden />
                </button>
              </div>
            )}

            {/* Workout list */}
            {logs.length === 0 ? (
              <EmptyState
                icon={Dumbbell}
                title={addingToday ? t.training.drawer.emptyTodayTitle : t.training.drawer.emptyOtherTitle}
                description={addingToday ? t.training.drawer.emptyTodayDesc : undefined}
                size="inset"
              />
            ) : (
              <div className="max-h-[34vh] overflow-y-auto overflow-x-hidden rounded-xl pr-1">
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
          </div>
        </div>
      </SheetContent>

      <WorkoutLogEditDialog log={editing} onClose={() => setEditing(null)} onSuccess={refresh} />
      <WorkoutLogEditDialog
        mode="create"
        open={manualOpen}
        dateStr={dateStr}
        onClose={() => setManualOpen(false)}
        onSuccess={handleManualCreated}
      />
    </Sheet>
  )
}

function cleanWorkoutName(name: string): string {
  const stripped = name.replace(/\s*[·\-–]?\s*\d+\s*sets?\b.*$/i, '').trim()
  return stripped || name
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
  const displayName = cleanWorkoutName(log.workout_name)

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
      className="group flex items-start gap-2 rounded-xl border border-border bg-card px-2.5 py-3 shadow-sm"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden>
        <Dumbbell size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
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
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50'
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
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <Trash2 size={14} />
        </button>
      )}
    </motion.li>
  )
}
