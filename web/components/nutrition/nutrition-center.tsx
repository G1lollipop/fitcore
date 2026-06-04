"use client"

import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react"
import { useState, useEffect, useMemo } from "react"
import { logFood } from "@/app/actions/logFood"
import { useToast } from "@/hooks/use-toast"
import { sumMacros } from "@/lib/metrics/macros"
import { supabase } from "@/lib/supabaseClient"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { MealTimeline } from "./meal-timeline"
import { RadialMacroChart } from "./radial-macro-chart"
import type { DietLogItem } from "@/app/actions/types"

interface NutritionCenterProps {
  userId?: string
  onLogSuccess?: () => void
}

const DEFAULT_GOALS: { calories: number; protein: number; carbs: number; fat: number } = {
  calories: 2500,
  protein: 150,
  carbs: 300,
  fat: 80,
}

export function NutritionCenter({ userId, onLogSuccess }: NutritionCenterProps) {
  const { toast } = useToast()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [dietData, setDietData] = useState<DietLogItem[]>([])
  const [goals, setGoals] = useState({ ...DEFAULT_GOALS })
  const [loading, setLoading] = useState(true)
  const [inputText, setInputText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (userId) {
      loadDietData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedDate])

  const loadDietData = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const dateStr = selectedDate.toISOString().split('T')[0]

      const { data: settings } = await supabase
        .from('user_settings')
        .select('target_calories, target_protein, target_carbs, target_fat')
        .eq('user_id', userId)
        .single()

      if (settings) {
        setGoals({
          calories: settings.target_calories || DEFAULT_GOALS.calories,
          protein: settings.target_protein || DEFAULT_GOALS.protein,
          carbs: settings.target_carbs || DEFAULT_GOALS.carbs,
          fat: settings.target_fat || DEFAULT_GOALS.fat,
        })
      }

      const { data: statsData } = await supabase
        .from('daily_stats')
        .select('diet_logs')
        .eq('user_id', userId)
        .eq('date', dateStr)
        .single()

      if (statsData?.diet_logs) {
        setDietData(statsData.diet_logs as DietLogItem[])
      } else {
        setDietData([])
      }
    } catch (error) {
      console.error('加载饮食数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePrevDay = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() - 1)
    setSelectedDate(newDate)
  }

  const handleNextDay = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + 1)
    setSelectedDate(newDate)
  }

  const handleAddFood = async () => {
    if (!inputText.trim() || !userId) return
    setIsSubmitting(true)
    try {
      const result = await logFood(inputText, userId)
      if (result.success) {
        await loadDietData()
        setInputText("")
        toast({ title: "记录成功", description: `已添加: ${result.data?.food_name}` })
        onLogSuccess?.()
      } else {
        toast({ variant: "destructive", title: "记录失败", description: result.error })
      }
    } catch (error) {
      console.error('添加饮食失败:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const totals = useMemo(() => sumMacros(dietData), [dietData])

  const isToday = selectedDate.toDateString() === new Date().toDateString()
  const isFuture = selectedDate > new Date()
  // The MealTimeline supports inline delete only for "today" — historical
  // days aren't currently editable from this view.
  const timelineUserId = isToday ? userId : undefined

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevDay}
            aria-label="前一天"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-[10rem] rounded-xl bg-secondary/60 px-4 py-2 text-center">
            <p className="text-sm font-medium text-foreground tabular-nums">
              {selectedDate.toLocaleDateString('zh-CN', {
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={handleNextDay}
            disabled={isFuture}
            aria-label="后一天"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {!isToday && (
          <button
            type="button"
            onClick={() => setSelectedDate(new Date())}
            className="text-xs font-medium text-primary hover:underline"
          >
            返回今天
          </button>
        )}
      </div>

      {loading ? (
        <NutritionSkeleton />
      ) : (
        <>
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
          >
            <header className="mb-4 flex items-baseline justify-between">
              <h3 className="font-display text-base font-semibold text-foreground">
                营养摄入
              </h3>
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Macros
              </span>
            </header>
            <RadialMacroChart totals={totals} goals={goals} />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
          >
            <header className="mb-4 flex items-baseline justify-between">
              <h3 className="font-display text-base font-semibold text-foreground">
                饮食时间线
              </h3>
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Today
              </span>
            </header>

            <AddFoodInput
              value={inputText}
              onChange={setInputText}
              onSubmit={handleAddFood}
              isSubmitting={isSubmitting}
              disabled={!isToday}
            />

            <div className="mt-5">
              <AnimatePresence mode="popLayout">
                <MealTimeline
                  key={selectedDate.toDateString()}
                  logs={dietData}
                  userId={timelineUserId}
                  onChange={() => {
                    loadDietData()
                    onLogSuccess?.()
                  }}
                />
              </AnimatePresence>
            </div>
          </motion.section>
        </>
      )}
    </div>
  )
}

interface AddFoodInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  isSubmitting: boolean
  disabled?: boolean
}

function AddFoodInput({ value, onChange, onSubmit, isSubmitting, disabled }: AddFoodInputProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-2 transition-colors focus-within:border-primary/40 focus-within:bg-card',
        disabled && 'opacity-60'
      )}
    >
      <Sparkles size={14} className="text-primary" aria-hidden />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        placeholder={disabled ? '历史记录暂不可编辑' : '例：鸡胸肉 200g、糙米饭一碗…'}
        disabled={isSubmitting || disabled}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting || disabled || !value.trim()}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? '解析中…' : '添加'}
      </button>
    </div>
  )
}

function NutritionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <Skeleton className="mb-4 h-5 w-24" />
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-56 w-56 rounded-full" />
          <div className="grid w-full max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6">
        <Skeleton className="mb-4 h-5 w-32" />
        <Skeleton className="mb-5 h-10 w-full rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}
