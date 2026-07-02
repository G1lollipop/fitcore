'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Camera, ChevronDown, Mic, PencilLine, Sparkles } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { logFood } from '@/app/actions/logFood'
import { getNutritionByDate, type NutritionDayData } from '@/app/actions/history'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'
import { sumMacros, macroProgressBundle } from '@/lib/metrics/macros'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/provider'
import { tError, type Dictionary } from '@/lib/i18n'
import { Skeleton } from '@/components/ui/skeleton'
import { MealTimeline } from '@/components/nutrition/meal-timeline'
import { DietLogEditDialog } from '@/components/log-form/diet-log-edit-dialog'
import { useMealPhoto } from '@/components/log-form/meal-photo-context'
import { useSpeechInput } from '@/lib/hooks/use-speech-input'
import { useDashboardActions } from '@/lib/queries/dashboard'
import { toLocalDateStr } from '@/lib/utils/date'
import type { DietLogItem } from '@/app/actions/types'

type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat'
const MACRO_UNITS: Record<MacroKey, string> = { calories: 'kcal', protein: 'g', carbs: 'g', fat: 'g' }

interface DietDaySectionProps {
  /** The day this section shows; controlled by the parent History page. */
  date: Date
  userId?: string
  onChange?: () => void
  weekData?: Record<string, NutritionDayData>
  isLoadingWeek?: boolean
}

const DEFAULT_GOALS = { calories: 2500, protein: 150, carbs: 300, fat: 80 }

const toDateStr = toLocalDateStr

function buildWeekChartData(
  todayStr: string,
  weekData: Record<string, NutritionDayData> | undefined
) {
  const data: Array<{
    date: string
    label: string
    calories: number
    protein: number
    carbs: number
    fat: number
    goal: number
  }> = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(`${todayStr}T12:00:00`)
    date.setDate(date.getDate() - i)
    const dateStr = toLocalDateStr(date)
    const day = weekData?.[dateStr]
    const totals = sumMacros(day?.dietLogs ?? [])
    data.push({
      date: dateStr,
      label: date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
      calories: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      goal: day?.goals.calories ?? DEFAULT_GOALS.calories,
    })
  }
  return data
}

/**
 * Compact, expandable nutrition card for the Record page. Tapping the card
 * opens a bottom sheet with the full meal timeline and 7-day macro trend charts.
 */
export function DietDaySection({
  date,
  userId,
  onChange,
  weekData,
  isLoadingWeek,
}: DietDaySectionProps) {
  const { toast } = useToast()
  const t = useT()
  const qc = useQueryClient()
  const { applyDietLog } = useDashboardActions()
  const { openPicker } = useMealPhoto()
  const [inputText, setInputText] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [manualOpen, setManualOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const speechBaseRef = useRef('')

  const dateStr = toDateStr(date)
  const isFuture = date > new Date() && date.toDateString() !== new Date().toDateString()
  const addingToday = dateStr === toDateStr(new Date())
  const nutritionKey = ['nutrition', dateStr] as const

  const rangeData = weekData?.[dateStr]
  const { data: fetchedData } = useQuery({
    queryKey: ['nutrition', dateStr],
    queryFn: () => getNutritionByDate(dateStr),
    enabled: !!userId && !isLoadingWeek && !rangeData,
  })
  const data = rangeData ?? fetchedData
  const goals = data?.goals ?? DEFAULT_GOALS
  const dietData = useMemo(() => data?.dietLogs ?? [], [data])

  const todayStr = toDateStr(new Date())
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
        title: t.nutrition.logFailed,
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

  const patchLogs = (fn: (logs: DietLogItem[]) => DietLogItem[]) =>
    qc.setQueryData<NutritionDayData>(nutritionKey, (old) => ({
      goals: old?.goals ?? DEFAULT_GOALS,
      dietLogs: fn(old?.dietLogs ?? []),
    }))

  const handleAddFood = () => {
    const text = inputText.trim()
    if (!text || !userId) return

    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const placeholder: DietLogItem = {
      id: tempId,
      food_name: text,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      logged_at: addingToday ? new Date().toISOString() : `${dateStr}T12:00:00`,
      pending: true,
    }
    patchLogs((logs) => [...logs, placeholder])
    setInputText('')
    setPendingCount((c) => c + 1)

    void (async () => {
      try {
        const result = await logFood(text, dateStr)
        if (result.success && result.data) {
          const saved = result.data
          patchLogs((logs) => logs.map((d) => (d.id === tempId ? saved : d)))
          if (addingToday) applyDietLog(saved)
          void qc.invalidateQueries({ queryKey: ['nutrition', 'range'] })
          onChange?.()
          toast({ title: t.nutrition.logSuccess, description: t.nutrition.added(saved.food_name) })
        } else {
          patchLogs((logs) => logs.filter((d) => d.id !== tempId))
          toast({ variant: 'destructive', title: t.nutrition.logFailed, description: tError(t, result.error) })
        }
      } catch (error) {
        console.error('Failed to add food:', error)
        patchLogs((logs) => logs.filter((d) => d.id !== tempId))
        toast({ variant: 'destructive', title: t.nutrition.logFailed, description: t.nutrition.addInput.parsing })
      } finally {
        setPendingCount((c) => Math.max(0, c - 1))
      }
    })()
  }

  const handleManualCreated = (created?: DietLogItem) => {
    if (!created) return
    patchLogs((logs) => [...logs, created])
    if (dateStr === toDateStr(new Date())) applyDietLog(created)
    void qc.invalidateQueries({ queryKey: ['nutrition', 'range'] })
    onChange?.()
  }

  const totals = useMemo(() => sumMacros(dietData), [dietData])
  const progress = useMemo(() => macroProgressBundle(totals, goals), [totals, goals])
  const timelineUserId = isFuture ? undefined : userId

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
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="glass glass-highlight block w-full rounded-2xl p-3 text-left"
          aria-label={t.history.expandAria}
        >
          <div className="flex w-full items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-semibold text-foreground">{t.history.dietTitle}</h3>
              <p className="text-[11px] text-muted-foreground">{t.history.tapToExpand}</p>
            </div>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground">
              <ChevronDown size={14} />
            </div>
          </div>

          {/* Compact macro summary */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            {(['calories', 'protein', 'carbs', 'fat'] as MacroKey[]).map((key) => {
              const p = progress[key]
              return (
                <div key={key} className="rounded-xl border border-border/50 bg-card/40 p-2">
                  <p className="truncate text-[10px] text-muted-foreground">{t.nutrition.rings[key]}</p>
                  <p className="font-display text-sm font-semibold leading-tight tabular-nums text-foreground">
                    {p.current}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      /{p.target}
                      {MACRO_UNITS[key]}
                    </span>
                  </p>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, p.pct)}%` }} />
                  </div>
                </div>
              )
            })}
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
              {' · '}{t.history.dietTitle}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
            {/* Calories trend */}
            <div className="rounded-2xl border border-border/50 bg-card/40 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t.history.last7Days} · {t.history.caloriesTrend}</p>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
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
                    <ReferenceLine y={goals.calories} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                    <Bar dataKey="calories" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Macros trend */}
            <div className="rounded-2xl border border-border/50 bg-card/40 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t.history.last7Days} · {t.history.macroTrend}</p>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} axisLine={false} tickLine={false} />
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
                    <Bar dataKey="protein" stackId="a" fill="var(--chart-2)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="carbs" stackId="a" fill="var(--chart-3)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="fat" stackId="a" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Add input */}
            <div className="flex items-stretch gap-2">
              <div className="min-w-0 flex-1">
                <AddFoodInput
                  t={t}
                  value={inputText}
                  onChange={setInputText}
                  onSubmit={handleAddFood}
                  busy={pendingCount > 0}
                  disabled={isFuture}
                  micSupported={speech.supported}
                  listening={speech.listening}
                  onMic={toggleMic}
                  showPhoto={addingToday && !isFuture}
                  onPhoto={openPicker}
                />
              </div>
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                disabled={isFuture}
                aria-label={t.logForm.manual.foodAria}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/50 px-0 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PencilLine size={16} aria-hidden />
              </button>
            </div>

            {/* Meal timeline */}
            <div className="max-h-[34vh] overflow-y-auto overflow-x-hidden rounded-xl pr-1">
              <AnimatePresence mode="popLayout">
                <MealTimeline
                  key={dateStr}
                  logs={dietData}
                  userId={timelineUserId}
                  onChange={() => {
                    void qc.invalidateQueries({ queryKey: nutritionKey })
                    void qc.invalidateQueries({ queryKey: ['nutrition', 'range'] })
                    onChange?.()
                  }}
                />
              </AnimatePresence>
            </div>
          </div>
        </div>
      </SheetContent>

      <DietLogEditDialog
        mode="create"
        open={manualOpen}
        dateStr={dateStr}
        onClose={() => setManualOpen(false)}
        onSuccess={handleManualCreated}
      />
    </Sheet>
  )
}

interface AddFoodInputProps {
  t: Dictionary
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  busy: boolean
  disabled?: boolean
  micSupported?: boolean
  listening?: boolean
  onMic?: () => void
  showPhoto?: boolean
  onPhoto?: () => void
}

function AddFoodInput({
  t,
  value,
  onChange,
  onSubmit,
  busy,
  disabled,
  micSupported,
  listening,
  onMic,
  showPhoto,
  onPhoto,
}: AddFoodInputProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-xl border border-border bg-secondary/50 px-3 py-2 transition-colors focus-within:border-primary/40 focus-within:bg-card',
        disabled && 'opacity-60'
      )}
    >
      <Sparkles size={14} className="shrink-0 text-primary" aria-hidden />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        placeholder={
          disabled
            ? t.nutrition.addInput.disabledPlaceholder
            : listening
              ? t.logForm.quick.micListening
              : t.nutrition.addInput.placeholder
        }
        disabled={disabled}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
      />
      {micSupported && !disabled && (
        <button
          type="button"
          onClick={onMic}
          aria-label={listening ? t.logForm.quick.micStop : t.logForm.quick.micStart}
          aria-pressed={listening}
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
            listening
              ? 'bg-destructive/15 text-destructive'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          )}
        >
          <Mic size={15} className={listening ? 'animate-pulse' : undefined} />
        </button>
      )}
      {showPhoto && (
        <button
          type="button"
          onClick={onPhoto}
          aria-label={t.logForm.quick.photoAria}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Camera size={15} />
        </button>
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? t.nutrition.addInput.parsing : t.common.add}
      </button>
    </div>
  )
}
