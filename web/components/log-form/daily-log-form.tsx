"use client"

import { useState, useTransition, useEffect } from "react"
import { UtensilsCrossed, Dumbbell, Plus, Check, X, Pencil, ClipboardList, RotateCcw, Loader2, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { logFood, deleteDietLog } from "@/app/actions/logFood"
import { logWorkout, deleteWorkoutLog, batchLogWorkouts } from "@/app/actions/logWorkout"
import { DietLogEditDialog } from "@/components/log-form/diet-log-edit-dialog"
import { WorkoutLogEditDialog } from "@/components/log-form/workout-log-edit-dialog"
import type { DietLogItem, WorkoutLogItem, YesterdayWorkoutLog } from "@/app/actions/types"
import { useToast } from "@/hooks/use-toast"
import { useT } from "@/lib/i18n/provider"
import { tError, type Dictionary } from "@/lib/i18n"

interface LogEntry {
  id: string
  text: string
  time: string
  /** Full record, present when the entry maps to a real DB row (enables edit). */
  diet?: DietLogItem
  workout?: WorkoutLogItem
}

function TagBadge({
  label,
  onRemove,
  onEdit,
  t,
}: {
  label: string
  onRemove: () => void
  onEdit?: () => void
  t: Dictionary
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-xs text-foreground border border-border">
      {label}
      {onEdit && (
        <button
          onClick={onEdit}
          className="text-muted-foreground hover:text-primary transition-colors"
          aria-label={t.logForm.daily.editTag(label)}
        >
          <Pencil size={10} />
        </button>
      )}
      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive transition-colors"
        aria-label={t.logForm.daily.deleteTag(label)}
      >
        <X size={10} />
      </button>
    </span>
  )
}

interface LogSectionProps {
  icon: React.ReactNode
  title: string
  placeholder: string
  entries: LogEntry[]
  onAdd: (text: string) => void
  onRemove: (id: string) => void
  onEdit?: (entry: LogEntry) => void
  showWorkoutActions?: boolean
  onCopyYesterday?: () => void
  onImportPlan?: () => void
  isSubmitting?: boolean
  todayWorkoutInfo?: {
    planName?: string
    dayName?: string
    isRestDay?: boolean
    exerciseCount?: number
  } | null
  loadingWorkout?: boolean
  hasYesterdayWorkout?: boolean
  t: Dictionary
}

function LogSection({
  icon,
  title,
  placeholder,
  entries,
  onAdd,
  onRemove,
  onEdit,
  showWorkoutActions = false,
  onCopyYesterday,
  onImportPlan,
  isSubmitting = false,
  todayWorkoutInfo,
  loadingWorkout = false,
  hasYesterdayWorkout = false,
  t,
}: LogSectionProps) {
  const [input, setInput] = useState("")
  const [added, setAdded] = useState(false)
  const [importing, setImporting] = useState(false)

  const handleAdd = () => {
    if (!input.trim() || isSubmitting) return
    onAdd(input.trim())
    setInput("")
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  const handleImport = () => {
    setImporting(true)
    setTimeout(() => {
      onImportPlan?.()
      setImporting(false)
    }, 600)
  }

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 shrink-0">
          {icon}
        </div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder={placeholder}
          disabled={isSubmitting}
          className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all disabled:opacity-50"
        />
        <button
          onClick={handleAdd}
          disabled={isSubmitting}
          className={cn(
            "flex items-center justify-center w-9 h-9 rounded-lg transition-all shrink-0 disabled:opacity-50",
            added
              ? "bg-primary/20 text-primary scale-95"
              : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
          )}
          aria-label={t.logForm.daily.addAria}
        >
          {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : added ? <Check size={15} /> : <Plus size={15} />}
        </button>
      </div>

      {showWorkoutActions && (
        <div className="space-y-2">
          {todayWorkoutInfo && !loadingWorkout && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
              <Calendar size={13} className="text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {todayWorkoutInfo.planName} — {todayWorkoutInfo.dayName}
                </p>
                {todayWorkoutInfo.isRestDay ? (
                  <p className="text-[10px] text-muted-foreground">{t.logForm.daily.todayRestDay}</p>
                ) : (
                  <p className="text-[10px] text-muted-foreground">{t.logForm.daily.exercisesToComplete(todayWorkoutInfo.exerciseCount ?? 0)}</p>
                )}
              </div>
            </div>
          )}
          {loadingWorkout && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary">
              <Loader2 size={13} className="text-muted-foreground animate-spin" />
              <p className="text-xs text-muted-foreground">{t.logForm.daily.loadingTodayPlan}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCopyYesterday}
              disabled={!hasYesterdayWorkout}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors",
                hasYesterdayWorkout
                  ? "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  : "bg-secondary/50 border-border/50 text-muted-foreground/50 cursor-not-allowed"
              )}
            >
              <RotateCcw size={11} className="shrink-0" />
              {t.logForm.daily.copyYesterday}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || loadingWorkout}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors",
                importing || loadingWorkout
                  ? "bg-primary/10 border-primary/20 text-primary cursor-wait"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <ClipboardList size={11} className="shrink-0" />
              {importing ? t.logForm.daily.importing : t.logForm.daily.importPlan}
            </button>
          </div>
        </div>
      )}

      {entries.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-1">
              <TagBadge
                label={e.text}
                onRemove={() => onRemove(e.id)}
                onEdit={onEdit && (e.diet || e.workout) ? () => onEdit(e) : undefined}
                t={t}
              />
              <span className="text-[10px] text-muted-foreground">{e.time}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t.logForm.daily.noEntries}</p>
      )}
    </div>
  )
}

interface DailyLogFormProps {
  userId?: string;
  onLogSuccess?: () => void;
  initialDietLogs?: DietLogItem[];
  initialWorkoutLogs?: WorkoutLogItem[];
  yesterdayWorkout?: YesterdayWorkoutLog;
  todayWorkout?: {
    plan: { id: string; name: string } | null;
    todayDay: { id: string; name: string; isRestDay: boolean } | null;
    exercises: { id: string; text: string; sets?: number; repsMin?: number; repsMax?: number; weight?: number }[];
  } | null;
  compact?: boolean;
}

export function DailyLogForm({
  userId,
  onLogSuccess,
  initialDietLogs = [],
  initialWorkoutLogs = [],
  yesterdayWorkout = [],
  todayWorkout,
  compact = false
}: DailyLogFormProps) {
  const { toast } = useToast()
  const t = useT()
  const [isDietPending, startDietTransition] = useTransition()
  const [isWorkoutPending, startWorkoutTransition] = useTransition()

  const now = () => {
    const d = new Date()
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
  }

  const [dietEntries, setDietEntries] = useState<LogEntry[]>([])
  const [workoutEntries, setWorkoutEntries] = useState<LogEntry[]>([])
  const [editingDiet, setEditingDiet] = useState<DietLogItem | null>(null)
  const [editingWorkout, setEditingWorkout] = useState<WorkoutLogItem | null>(null)

  useEffect(() => {
    setDietEntries(initialDietLogs.map((log) => ({
      id: log.id || `legacy-diet-${log.logged_at}`,
      text: log.food_name,
      time: new Date(log.logged_at).toLocaleTimeString(t.common.locale, { hour: "2-digit", minute: "2-digit" }),
      diet: log,
    })))
  }, [initialDietLogs, t])

  useEffect(() => {
    setWorkoutEntries(initialWorkoutLogs.map((log) => ({
      id: log.id || `legacy-workout-${log.logged_at}`,
      text: log.workout_name,
      time: new Date(log.logged_at).toLocaleTimeString(t.common.locale, { hour: "2-digit", minute: "2-digit" }),
      workout: log,
    })))
  }, [initialWorkoutLogs, t])

  const handleEditEntry = (entry: LogEntry) => {
    if (entry.diet) setEditingDiet(entry.diet)
    else if (entry.workout) setEditingWorkout(entry.workout)
  }

  const addDiet = (text: string) => {
    if (!userId) return
    startDietTransition(async () => {
      const result = await logFood(text)
      if (result.success && result.data) {
        const item = result.data
        setDietEntries((prev) => [...prev, { id: item.id, text: item.food_name, time: now(), diet: item }])
        onLogSuccess?.()
        toast({ title: t.logForm.daily.logged, description: `${result.data.food_name} (${result.data.calories} kcal)` })
      } else {
        toast({ variant: "destructive", title: t.logForm.daily.logFailed, description: result.error ? tError(t, result.error) : t.logForm.daily.retry })
      }
    })
  }

  const addWorkout = (text: string) => {
    if (!userId) return
    startWorkoutTransition(async () => {
      const result = await logWorkout(text)
      if (result.success && result.data) {
        const item = result.data
        setWorkoutEntries((prev) => [...prev, { id: item.id, text: item.workout_name, time: now(), workout: item }])
        onLogSuccess?.()
        toast({ title: t.logForm.daily.logged, description: `${result.data.workout_name} (${result.data.calories_burned} kcal)` })
      } else {
        toast({ variant: "destructive", title: t.logForm.daily.logFailed, description: result.error ? tError(t, result.error) : t.logForm.daily.retry })
      }
    })
  }

  const removeDiet = (id: string) => {
    if (!dietEntries.some((e) => e.id === id)) return
    startDietTransition(async () => {
      const result = await deleteDietLog(id)
      if (result.success) {
        setDietEntries((prev) => prev.filter((e) => e.id !== id))
        onLogSuccess?.()
        toast({ title: t.logForm.daily.deleted })
      } else {
        toast({ variant: "destructive", title: t.logForm.daily.deleteFailed, description: tError(t, result.error) })
      }
    })
  }

  const removeWorkout = (id: string) => {
    if (!workoutEntries.some((e) => e.id === id)) return
    startWorkoutTransition(async () => {
      const result = await deleteWorkoutLog(id)
      if (result.success) {
        setWorkoutEntries((prev) => prev.filter((e) => e.id !== id))
        onLogSuccess?.()
        toast({ title: t.logForm.daily.deleted })
      } else {
        toast({ variant: "destructive", title: t.logForm.daily.deleteFailed, description: tError(t, result.error) })
      }
    })
  }

  const handleCopyYesterday = () => {
    if (!userId || !yesterdayWorkout || yesterdayWorkout.length === 0) {
      toast({ title: t.logForm.daily.noYesterday })
      return
    }
    const newEntries = yesterdayWorkout.filter((p) => !workoutEntries.some((e) => e.text === p.text))
    if (newEntries.length === 0) {
      toast({ title: t.logForm.daily.yesterdayAllExist })
      return
    }
    startWorkoutTransition(async () => {
      const workouts = newEntries.map((e) => ({ name: e.text, duration_minutes: 15, calories_burned: 50 }))
      const result = await batchLogWorkouts(workouts)
      if (result.success) {
        const time = now()
        setWorkoutEntries((prev) => [...prev, ...newEntries.map((p) => ({ id: `y-${Date.now()}-${p.text}`, text: p.text, time }))])
        onLogSuccess?.()
        toast({ title: t.logForm.daily.copied, description: t.logForm.daily.copiedDesc(newEntries.length) })
      } else {
        toast({ variant: "destructive", title: t.logForm.daily.copyFailed, description: tError(t, result.error) })
      }
    })
  }

  const handleImportPlan = () => {
    if (!userId) return
    if (!todayWorkout || !todayWorkout.exercises.length) {
      toast({ title: t.logForm.daily.noPlan, description: t.logForm.daily.noPlanDesc })
      return
    }
    if (todayWorkout.todayDay?.isRestDay) {
      toast({ title: t.logForm.daily.restDayTitle, description: `${todayWorkout.todayDay.name}` })
      return
    }
    const newExercises = todayWorkout.exercises.filter((e) => !workoutEntries.some((entry) => entry.text === e.text))
    if (newExercises.length === 0) {
      toast({ title: t.logForm.daily.todayPlanAllExist })
      return
    }
    startWorkoutTransition(async () => {
      const workouts = newExercises.map((e) => ({ name: e.text, sets: e.sets, duration_minutes: 15, calories_burned: 50 }))
      const result = await batchLogWorkouts(workouts)
      if (result.success) {
        const time = now()
        setWorkoutEntries((prev) => [...prev, ...newExercises.map((e) => ({ id: `pl-${Date.now()}-${e.id}`, text: e.text, time }))])
        onLogSuccess?.()
        toast({ title: t.logForm.daily.planImported, description: `${todayWorkout.plan?.name} — ${todayWorkout.todayDay?.name}` })
      } else {
        toast({ variant: "destructive", title: t.logForm.daily.importFailed, description: tError(t, result.error) })
      }
    })
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <LogSection
        icon={<UtensilsCrossed size={14} className="text-primary" />}
        title={t.logForm.daily.dietTitle}
        placeholder={t.logForm.daily.dietPlaceholder}
        entries={dietEntries}
        onAdd={addDiet}
        onRemove={removeDiet}
        onEdit={handleEditEntry}
        isSubmitting={isDietPending}
        t={t}
      />
      <LogSection
        icon={<Dumbbell size={14} className="text-primary" />}
        title={t.logForm.daily.workoutTitle}
        placeholder={t.logForm.daily.workoutPlaceholder}
        entries={workoutEntries}
        onAdd={addWorkout}
        onRemove={removeWorkout}
        onEdit={handleEditEntry}
        showWorkoutActions
        onCopyYesterday={handleCopyYesterday}
        onImportPlan={handleImportPlan}
        isSubmitting={isWorkoutPending}
        todayWorkoutInfo={todayWorkout ? {
          planName: todayWorkout.plan?.name,
          dayName: todayWorkout.todayDay?.name,
          isRestDay: todayWorkout.todayDay?.isRestDay,
          exerciseCount: todayWorkout.exercises.length,
        } : null}
        hasYesterdayWorkout={yesterdayWorkout && yesterdayWorkout.length > 0}
        t={t}
      />

      <DietLogEditDialog
        log={editingDiet}
        onClose={() => setEditingDiet(null)}
        onSuccess={onLogSuccess}
      />
      <WorkoutLogEditDialog
        log={editingWorkout}
        onClose={() => setEditingWorkout(null)}
        onSuccess={onLogSuccess}
      />
    </div>
  )
}
