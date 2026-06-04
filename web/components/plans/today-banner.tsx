'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Coffee, Flame, Play, Target } from 'lucide-react'
import type { TodayWorkoutResult } from '@/lib/plans/today-workout'
import { cn } from '@/lib/utils'

interface TodayBannerProps {
  planName: string
  result: TodayWorkoutResult
  isLogging: boolean
  onStart: () => void
  className?: string
}

const PREVIEW_LIMIT = 4

/**
 * Hero banner for the My Plans surface. When today is a workout day, lists
 * the first few exercises and exposes a "start" button that wires into
 * the parent's batch-log flow. On a rest day, the banner softens to a
 * "recovery" copy with no CTA.
 */
export function TodayBanner({
  planName,
  result,
  isLogging,
  onStart,
  className,
}: TodayBannerProps) {
  const isRest = result.isRestDay
  const dayName = result.todayDay?.name ?? '今日训练'
  const exercises = result.exercises
  const showCount = Math.min(PREVIEW_LIMIT, exercises.length)
  const overflow = Math.max(0, exercises.length - showCount)

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6',
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full blur-3xl',
          isRest ? 'bg-accent/15' : 'bg-primary/15'
        )}
      />

      <header className="relative flex items-start justify-between gap-3">
        <div>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              isRest
                ? 'bg-accent/15 text-accent-foreground'
                : 'bg-primary/15 text-primary'
            )}
          >
            {isRest ? <Coffee size={10} /> : <Flame size={10} />}
            {isRest ? '今日休息' : '今日训练'}
          </span>
          <h2 className="font-display mt-2 text-xl font-semibold text-foreground sm:text-2xl">
            {dayName}
          </h2>
          <p className="text-xs text-muted-foreground">
            {planName}
            {result.todayDay?.day_order
              ? ` · 第 ${result.todayDay.day_order} 天`
              : ''}
          </p>
        </div>

        {!isRest && exercises.length > 0 && (
          <motion.button
            type="button"
            onClick={onStart}
            disabled={isLogging}
            whileTap={isLogging ? undefined : { scale: 0.96 }}
            whileHover={isLogging ? undefined : { y: -1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play size={14} className={cn(isLogging && 'animate-pulse')} />
            {isLogging ? '记录中…' : '开始训练'}
          </motion.button>
        )}
      </header>

      <div className="relative mt-4">
        <AnimatePresence mode="popLayout">
          {isRest ? (
            <motion.p
              key="rest"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-5 text-sm text-muted-foreground"
            >
              今天是计划中的休息日 — 拉伸、补水、好好睡一觉。
            </motion.p>
          ) : exercises.length === 0 ? (
            <motion.p
              key="empty"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-dashed border-border bg-secondary/30 px-4 py-5 text-sm text-muted-foreground"
            >
              这一天还没有添加动作，去计划详情里补几个吧。
            </motion.p>
          ) : (
            <motion.ul
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-1.5"
            >
              {exercises.slice(0, showCount).map((ex, idx) => (
                <li
                  key={ex.id}
                  className="flex items-center gap-3 rounded-xl bg-secondary/40 px-3 py-2"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="flex-1 truncate text-sm text-foreground">
                    {ex.exerciseName ?? ex.text}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                    <Target size={10} />
                    {ex.sets ?? 0} 组
                    {ex.repsMin && ex.repsMax
                      ? ` · ${ex.repsMin}-${ex.repsMax}`
                      : ''}
                  </span>
                </li>
              ))}
              {overflow > 0 && (
                <li className="px-3 pt-1 text-center text-[11px] text-muted-foreground">
                  + 还有 {overflow} 个动作
                </li>
              )}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}
