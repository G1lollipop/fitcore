'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Clock, Dumbbell, Flame, Sparkles, Target, Trash2 } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'
import { logWorkout, deleteWorkoutLog } from '@/app/actions/logWorkout'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'
import {
  classifyMuscleGroup,
  muscleLabel,
  type MuscleGroup,
} from '@/lib/training/calendar'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import type { WorkoutLogItem } from '@/app/actions/types'

interface DailyLogDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dateStr: string | null
  logs: WorkoutLogItem[]
  userId?: string
  onChange?: () => void
}

const TODAY_ISO = new Date().toISOString().split('T')[0]

const MUSCLE_BADGE_COLOR: Record<MuscleGroup, string> = {
  chest: 'var(--color-chart-3)',
  back: 'var(--color-chart-2)',
  legs: 'var(--color-primary)',
  shoulders: 'var(--color-chart-5)',
  arms: 'var(--color-chart-1)',
  core: 'var(--color-chart-4)',
  cardio: 'var(--color-accent)',
  other: 'var(--color-muted-foreground)',
}

function formatHeading(dateStr: string | null): {
  title: string
  description: string
} {
  if (!dateStr) return { title: '', description: '' }
  const d = new Date(`${dateStr}T00:00:00`)
  const isToday = dateStr === TODAY_ISO
  const title = d.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
  const description = isToday ? '今日训练 · 可添加或删除' : '历史记录 · 仅查看'
  return { title, description }
}

/**
 * Side drawer (Sheet) showing one day's workout logs. Opens off the right
 * edge so the calendar stays visible underneath. Today is editable (add +
 * delete); other days are read-only.
 */
export function DailyLogDrawer({
  open,
  onOpenChange,
  dateStr,
  logs,
  userId,
  onChange,
}: DailyLogDrawerProps) {
  const { toast } = useToast()
  const [inputText, setInputText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isToday = dateStr === TODAY_ISO
  const canEdit = isToday && !!userId
  const { title, description } = formatHeading(dateStr)

  const totals = useMemo(() => {
    return logs.reduce(
      (acc, log) => ({
        sessions: acc.sessions + 1,
        minutes: acc.minutes + (log.duration_minutes ?? 0),
        kcal: acc.kcal + (log.calories_burned ?? 0),
      }),
      { sessions: 0, minutes: 0, kcal: 0 }
    )
  }, [logs])

  const handleAdd = async () => {
    if (!inputText.trim() || !canEdit) return
    setIsSubmitting(true)
    try {
      const result = await logWorkout(inputText, userId!)
      if (result.success) {
        toast({
          title: '记录成功',
          description: `已添加: ${result.data?.workout_name}`,
        })
        setInputText('')
        onChange?.()
      } else {
        toast({
          variant: 'destructive',
          title: '记录失败',
          description: result.error,
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto bg-background p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity size={16} />
            </span>
            <div>
              <SheetTitle className="font-display text-base">{title}</SheetTitle>
              <SheetDescription className="text-[11px]">
                {description}
              </SheetDescription>
            </div>
          </div>

          {logs.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <SummaryStat
                icon={<Dumbbell size={12} />}
                label="次数"
                value={`${totals.sessions}`}
              />
              <SummaryStat
                icon={<Clock size={12} />}
                label="时长"
                value={`${totals.minutes} 分`}
              />
              <SummaryStat
                icon={<Flame size={12} />}
                label="消耗"
                value={`${totals.kcal} kcal`}
              />
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 px-5 py-4">
          {canEdit && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2 transition-colors focus-within:border-primary/40 focus-within:bg-card">
              <Sparkles size={14} className="text-primary" aria-hidden />
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="例：深蹲 5 组 × 10 个、慢跑 30 分钟…"
                disabled={isSubmitting}
                className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={isSubmitting || !inputText.trim()}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? '解析中…' : '添加'}
              </button>
            </div>
          )}

          {logs.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title={isToday ? '今天还没有训练记录' : '该日无训练记录'}
              description={isToday ? '在上方输入或用 ⌘K 快速记录' : undefined}
              size="inset"
            />
          ) : (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {logs.map((log) => (
                  <WorkoutRow
                    key={log.id}
                    log={log}
                    canDelete={canEdit}
                    userId={userId}
                    onChange={onChange}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SummaryStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <p className="font-display mt-0.5 text-sm font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  )
}

interface WorkoutRowProps {
  log: WorkoutLogItem
  canDelete: boolean
  userId?: string
  onChange?: () => void
}

function WorkoutRow({ log, canDelete, userId, onChange }: WorkoutRowProps) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()
  const [isRemoving, setIsRemoving] = useState(false)

  const group = classifyMuscleGroup(log.workout_name)
  const accent = MUSCLE_BADGE_COLOR[group]

  const handleDelete = () => {
    if (!canDelete || !userId || isPending) return
    setIsRemoving(true)
    startTransition(async () => {
      const result = await deleteWorkoutLog(userId, log.id)
      if (!result.success) {
        setIsRemoving(false)
        toast({
          variant: 'destructive',
          title: '删除失败',
          description: result.error ?? '请稍后再试',
        })
        return
      }
      toast({ title: '已删除', description: log.workout_name })
      onChange?.()
    })
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: isRemoving ? 0.4 : 1, x: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="group flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          backgroundColor: `color-mix(in oklch, ${accent} 18%, transparent)`,
          color: accent,
        }}
        aria-hidden
      >
        <Dumbbell size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {log.workout_name}
          </p>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: `color-mix(in oklch, ${accent} 14%, transparent)`,
              color: accent,
            }}
          >
            {muscleLabel(group)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
          {log.sets ? (
            <span className="inline-flex items-center gap-1">
              <Target size={10} />
              {log.sets} 组
            </span>
          ) : null}
          {log.duration_minutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock size={10} />
              {log.duration_minutes} 分
            </span>
          ) : null}
          {log.calories_burned ? (
            <span className="inline-flex items-center gap-1">
              <Flame size={10} />
              {log.calories_burned} kcal
            </span>
          ) : null}
          {log.logged_at && (
            <span className="text-muted-foreground/70">
              {new Date(log.logged_at).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </div>
      {canDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          aria-label={`删除 ${log.workout_name}`}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <Trash2 size={14} />
        </button>
      )}
    </motion.li>
  )
}
