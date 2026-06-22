'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Coffee, Salad, UtensilsCrossed, Cookie, Moon, Trash2 } from 'lucide-react'
import { useMemo, useState, useTransition, type ComponentType } from 'react'
import { deleteDietLog } from '@/app/actions/logFood'
import { useToast } from '@/hooks/use-toast'
import { sumMacros } from '@/lib/metrics/macros'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n/provider'
import { tError } from '@/lib/i18n'
import { EmptyState } from '@/components/ui/empty-state'
import type { DietLogItem } from '@/app/actions/types'

type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner' | 'lateNight'

interface MealConfig {
  slot: MealSlot
  icon: ComponentType<{ size?: number; className?: string }>
  /** Used for the per-meal kcal pill background and timeline node. */
  accent: string
}

// Canonical render order. Late-night sits at the bottom only when populated.
const MEAL_ORDER: readonly MealSlot[] = [
  'breakfast',
  'lunch',
  'snack',
  'dinner',
  'lateNight',
] as const

const MEAL_CONFIG: Record<MealSlot, MealConfig> = {
  breakfast: { slot: 'breakfast', icon: Coffee, accent: 'var(--color-chart-2)' },
  lunch: { slot: 'lunch', icon: Salad, accent: 'var(--color-primary)' },
  snack: { slot: 'snack', icon: Cookie, accent: 'var(--color-accent)' },
  dinner: { slot: 'dinner', icon: UtensilsCrossed, accent: 'var(--color-chart-3)' },
  lateNight: { slot: 'lateNight', icon: Moon, accent: 'var(--color-chart-5)' },
}

/**
 * Bucket a logged-at ISO timestamp into a meal slot using local-time hours.
 * Boundaries are inclusive of the start, exclusive of the end:
 *   breakfast  04:00–10:30
 *   lunch      10:30–14:30
 *   snack      14:30–17:00
 *   dinner     17:00–21:30
 *   lateNight  21:30–04:00
 */
function bucketByLoggedAt(iso: string): MealSlot {
  const d = new Date(iso)
  const minutes = d.getHours() * 60 + d.getMinutes()
  if (minutes >= 240 && minutes < 630) return 'breakfast' // 04:00–10:30
  if (minutes >= 630 && minutes < 870) return 'lunch' // 10:30–14:30
  if (minutes >= 870 && minutes < 1020) return 'snack' // 14:30–17:00
  if (minutes >= 1020 && minutes < 1290) return 'dinner' // 17:00–21:30
  return 'lateNight' // 21:30–04:00 (wraps midnight)
}

function formatTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

interface MealTimelineProps {
  logs: DietLogItem[]
  userId?: string
  onChange?: () => void
  className?: string
}

/**
 * Auto-grouped meal timeline. Logs are bucketed into breakfast/lunch/snack/
 * dinner/late-night by their `logged_at` hour, sorted within each meal,
 * then rendered as a vertical timeline. Empty buckets are hidden.
 */
export function MealTimeline({ logs, userId, onChange, className }: MealTimelineProps) {
  const t = useT()
  const groups = useMemo(() => {
    const buckets: Record<MealSlot, DietLogItem[]> = {
      breakfast: [],
      lunch: [],
      snack: [],
      dinner: [],
      lateNight: [],
    }
    for (const log of logs) {
      buckets[bucketByLoggedAt(log.logged_at)].push(log)
    }
    for (const slot of MEAL_ORDER) {
      buckets[slot].sort(
        (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
      )
    }
    return buckets
  }, [logs])

  const populated = MEAL_ORDER.filter((slot) => groups[slot].length > 0)

  if (populated.length === 0) {
    return (
      <EmptyState
        icon={UtensilsCrossed}
        title={t.nutrition.empty.title}
        description={t.nutrition.empty.description}
        size="inset"
        className={className}
      />
    )
  }

  return (
    <ol className={cn('relative space-y-6', className)}>
      <AnimatePresence initial={false}>
        {populated.map((slot, idx) => (
          <MealSection
            key={slot}
            config={MEAL_CONFIG[slot]}
            logs={groups[slot]}
            userId={userId}
            onChange={onChange}
            isLast={idx === populated.length - 1}
          />
        ))}
      </AnimatePresence>
    </ol>
  )
}

interface MealSectionProps {
  config: MealConfig
  logs: DietLogItem[]
  userId?: string
  onChange?: () => void
  isLast: boolean
}

function MealSection({ config, logs, userId, onChange, isLast }: MealSectionProps) {
  const t = useT()
  const totals = useMemo(() => sumMacros(logs), [logs])
  const Icon = config.icon

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="relative pl-10"
    >
      {/* Timeline rail — runs from the bottom of this section's node to the
          top of the next. Hidden on the final populated section. */}
      {!isLast && (
        <span
          className="absolute left-[15px] top-9 h-[calc(100%+1.5rem)] w-px bg-border"
          aria-hidden
        />
      )}

      <span
        className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-sm"
        style={{ color: config.accent }}
        aria-hidden
      >
        <Icon size={15} />
      </span>

      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold text-foreground">{t.nutrition.meals[config.slot]}</h4>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
          style={{
            backgroundColor: `color-mix(in oklch, ${config.accent} 16%, transparent)`,
            color: config.accent,
          }}
        >
          {totals.calories} kcal
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {t.nutrition.macroLine(totals.protein, totals.carbs, totals.fat)}
        </span>
      </header>

      <ul className="mt-3 space-y-2">
        <AnimatePresence initial={false}>
          {logs.map((log) => (
            <MealRow
              key={log.id}
              log={log}
              userId={userId}
              onChange={onChange}
              accent={config.accent}
            />
          ))}
        </AnimatePresence>
      </ul>
    </motion.li>
  )
}

interface MealRowProps {
  log: DietLogItem
  userId?: string
  onChange?: () => void
  accent: string
}

function MealRow({ log, userId, onChange, accent }: MealRowProps) {
  const { toast } = useToast()
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const [isRemoving, setIsRemoving] = useState(false)

  const handleDelete = () => {
    if (!userId || isPending || log.pending) return
    setIsRemoving(true)
    startTransition(async () => {
      const result = await deleteDietLog(log.id)
      if (!result.success) {
        setIsRemoving(false)
        toast({
          variant: 'destructive',
          title: t.nutrition.deleteFailed,
          description: result.error ? tError(t, result.error) : t.nutrition.tryLater,
        })
        return
      }
      toast({ title: t.nutrition.deleted, description: log.food_name })
      onChange?.()
    })
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: isRemoving ? 0.4 : 1, x: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md"
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: accent }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{log.food_name}</p>
        {log.pending ? (
          <p className="flex items-center gap-1.5 text-[11px] text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {t.nutrition.addInput.parsing}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {formatTime(log.logged_at, t.common.locale)} · {log.calories} kcal ·{' '}
            {t.nutrition.macroLine(log.protein, log.carbs, log.fat)}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={!userId || isPending || log.pending}
        aria-label={t.nutrition.deleteAria(log.food_name)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 size={14} />
      </button>
    </motion.li>
  )
}
