# Phone UX Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three phone UX issues: AI coach transparency + avatar, Record page information density, and Today's meals pushing Quick Log off-screen.

**Architecture:** Three independent work streams touching different component trees. Stream A fixes the AI chat overlay and creates a mascot avatar. Stream B redesigns the Record page with a weekly summary bar and inline day timeline (extracting chart code from existing diet/workout sections). Stream C replaces the inline meal expansion on Today with a bottom sheet. All streams preserve existing data layer and React Query caching.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Sheet), lucide-react, framer-motion, Recharts

## Global Constraints

- Every main page must fit one phone viewport without vertical scrolling
- Quick Log and AI Coach must always be accessible above the fold
- No changes to data layer, server actions, or API
- No changes to desktop layout (md+ breakpoints)
- No new npm dependencies
- Match existing code patterns (glass cards, rounded-2xl, text sizes, color tokens)
- `npm run typecheck` must pass after all changes
- `npm run lint` must pass after all changes

---

## Stream A: AI Coach Fixes (independent — can run in parallel with B and C)

### Task A1: Create CoachAvatar component

**Files:**
- Create: `web/components/ai-chat/coach-avatar.tsx`

**Interfaces:**
- Produces: `CoachAvatar({ size?: number; className?: string })` — renders SVG mascot

- [ ] **Step 1: Create the component file**

```tsx
// web/components/ai-chat/coach-avatar.tsx
import { cn } from '@/lib/utils'

interface CoachAvatarProps {
  /** Size in pixels (applied as both width and height). Default 28. */
  size?: number
  className?: string
}

/**
 * AI coach mascot avatar — a simple geometric fitness coach character.
 * Flat vector style, two-tone coloring via currentColor + opacity.
 * The gradient background is applied by the parent container.
 */
export function CoachAvatar({ size = 28, className }: CoachAvatarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      {/* Head — rounded rectangle for a friendly face */}
      <rect x="6" y="7" width="20" height="17" rx="9" fill="currentColor" opacity="0.8" />

      {/* Headband / sweatband */}
      <rect x="6" y="7" width="20" height="4" rx="2" fill="currentColor" opacity="0.5" />
      <path d="M5 11 Q16 16 27 11" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.35" fill="none" />

      {/* Eyes — two dots */}
      <circle cx="13" cy="16" r="1.5" fill="currentColor" />
      <circle cx="19" cy="16" r="1.5" fill="currentColor" />

      {/* Smile — small arc */}
      <path d="M13 20.5 Q16 23 19 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />

      {/* Body — simple rounded trapezoid */}
      <path
        d="M10 24 L11 31 L21 31 L22 24 Z"
        fill="currentColor"
        opacity="0.35"
        rx="2"
      />

      {/* Whistle cord — curved line */}
      <path d="M15 27 Q16 30 18 29" stroke="currentColor" strokeWidth="1" strokeOpacity="0.4" fill="none" />
    </svg>
  )
}
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd web && npx tsc --noEmit --pretty src/components/ai-chat/coach-avatar.tsx 2>&1 | head -5`
Or: `cd web && npm run typecheck` (expects clean)

- [ ] **Step 3: Commit**

```bash
git add web/components/ai-chat/coach-avatar.tsx
git commit -m "feat: add CoachAvatar mascot SVG component"
```

---

### Task A2: Replace Bot icon with CoachAvatar in 4 locations

**Files:**
- Modify: `web/components/ai-chat/chat-header.tsx:50-58`
- Modify: `web/components/ai-chat/chat-message.tsx:26-28`
- Modify: `web/components/ai-chat/chat-body.tsx:60-62`
- Modify: `web/components/dashboard/coach-ask-bar.tsx:45-47`

**Interfaces:**
- Consumes: `CoachAvatar` from `@/components/ai-chat/coach-avatar`
- Produces: No new exports; visual change only

- [ ] **Step 1: Update chat-header.tsx — replace Bot icon div**

Add import:
```tsx
import { CoachAvatar } from './coach-avatar'
```

Replace the avatar div (lines 50-58, the `div` with `bg-gradient-to-br from-primary/25 to-accent/20` containing `<Bot>`) with:
```tsx
<div
  className={cn(
    'relative flex items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/20 shadow-sm shrink-0 overflow-hidden text-primary',
    compact ? 'w-7 h-7' : 'w-9 h-9'
  )}
>
  <CoachAvatar size={compact ? 20 : 24} />
</div>
```

Remove the `Bot` import from `lucide-react` if no longer used in this file.

- [ ] **Step 2: Update chat-message.tsx — replace Bot in assistant bubbles**

Add import: `import { CoachAvatar } from './coach-avatar'`

Replace the avatar div (lines 26-28, the `div` with `w-7 h-7 rounded-xl bg-gradient-to-br` containing `<Bot>`) with:
```tsx
<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/20 text-primary">
  <CoachAvatar size={20} />
</div>
```

Remove `Bot` from lucide imports if no longer used.

- [ ] **Step 3: Update chat-body.tsx — replace Bot in waiting indicator**

Add import: `import { CoachAvatar } from './coach-avatar'`

Replace the avatar div (lines 60-62) with:
```tsx
<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/20 text-primary">
  <CoachAvatar size={20} />
</div>
```

Remove `Bot` from lucide imports if no longer used.

- [ ] **Step 4: Update coach-ask-bar.tsx — replace Bot in home entry bar**

Add import: `import { CoachAvatar } from '@/components/ai-chat/coach-avatar'`

Replace the avatar div (lines 45-47) with:
```tsx
<div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/15 shadow-sm text-primary">
  <CoachAvatar size={20} />
</div>
```

Remove `Bot` from `lucide-react` import.

- [ ] **Step 5: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add web/components/ai-chat/chat-header.tsx web/components/ai-chat/chat-message.tsx web/components/ai-chat/chat-body.tsx web/components/dashboard/coach-ask-bar.tsx
git commit -m "feat: replace Bot icon with CoachAvatar mascot in all coach surfaces"
```

---

### Task A3: Fix AI coach chat panel transparency

**Files:**
- Modify: `web/components/ai-chat/chat-window.tsx:121`
- Modify: `web/components/ai-chat/chat-input.tsx:30,44`

**Interfaces:**
- No new interfaces; only CSS class changes

- [ ] **Step 1: Add opaque background to MobileSheet inner scroll container**

In `chat-window.tsx`, change line 121 from:
```tsx
<div className="flex min-h-0 flex-1 flex-col pb-14">
```
to:
```tsx
<div className="flex min-h-0 flex-1 flex-col rounded-b-2xl bg-background pb-14">
```

- [ ] **Step 2: Add opaque background to ChatInput chips row**

In `chat-input.tsx`, change line 30 from:
```tsx
<div className="flex gap-1.5 overflow-x-auto border-t border-border/60 px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
```
to:
```tsx
<div className="flex gap-1.5 overflow-x-auto border-t border-border/60 bg-background px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
```

- [ ] **Step 3: Add opaque background to ChatInput input container**

In `chat-input.tsx`, change line 44 from:
```tsx
<div className="flex shrink-0 items-center gap-2 px-3 pb-3 pt-1">
```
to:
```tsx
<div className="flex shrink-0 items-center gap-2 bg-background px-3 pb-3 pt-1">
```

- [ ] **Step 4: Verify — typecheck + lint**

```bash
cd web && npm run typecheck && npm run lint
```
Expected: no errors (pre-existing lint warnings acceptable)

- [ ] **Step 5: Commit**

```bash
git add web/components/ai-chat/chat-window.tsx web/components/ai-chat/chat-input.tsx
git commit -m "fix: add opaque background to AI chat panel bottom to prevent text bleed-through"
```

---

## Stream B: Record Page Redesign (independent — can run in parallel with A and C)

### Task B1: Extract TrendCharts component from diet/workout sections

**Files:**
- Create: `web/components/history/trend-charts.tsx`
- Modify: `web/components/history/diet-day-section.tsx`
- Modify: `web/components/history/workout-day-section.tsx`

**Interfaces:**
- Produces: `TrendCharts({ date, dietWeekData, workoutWeekData, todayStr })` — renders 7-day trend bar charts (calories, macros, workouts) inside a sheet-ready container
- Consumes: chart data structures from `getNutritionRange` and `getWorkoutHistory`

- [ ] **Step 1: Create TrendCharts component**

Read the chart rendering code from `diet-day-section.tsx` (the 7-day calorie bar chart + macro stacked bar chart) and `workout-day-section.tsx` (the 7-day workout trend bar chart). Extract both into one component.

```tsx
// web/components/history/trend-charts.tsx
'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import { useT } from '@/lib/i18n/provider'
import type { NutritionDayData, WorkoutLogItem } from '@/app/actions/types'
import { toLocalDateStr } from '@/lib/utils/date'

const toDateStr = toLocalDateStr

interface TrendChartsProps {
  date: Date
  dietWeekData?: Record<string, NutritionDayData>
  workoutWeekData?: Record<string, WorkoutLogItem[]>
  todayStr: string
}

function buildDietChartData(
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
    data.push({
      date: dateStr,
      label: date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
      calories: day?.total_calories ?? 0,
      protein: day?.total_protein ?? 0,
      carbs: day?.total_carbs ?? 0,
      fat: day?.total_fat ?? 0,
      goal: day?.target_calories ?? 0,
    })
  }
  return data
}

function buildWorkoutChartData(
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
    data.push({ date: dateStr, label: date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }), ...totals })
  }
  return data
}

export function TrendCharts({ date: _date, dietWeekData, workoutWeekData, todayStr }: TrendChartsProps) {
  const t = useT()
  const dietData = buildDietChartData(todayStr, dietWeekData)
  const workoutData = buildWorkoutChartData(todayStr, workoutWeekData)

  return (
    <div className="space-y-4">
      {/* Calories trend */}
      <div className="rounded-2xl border border-border/50 bg-card/40 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t.history.last7Days} · {t.nutrition.rings.kcal}</p>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dietData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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
              <ReferenceLine yAxisId="0" y={dietData[0]?.goal} stroke="var(--chart-5)" strokeDasharray="5 5" strokeWidth={1} />
              <Bar dataKey="calories" name={t.common.kcal} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Macros trend */}
      <div className="rounded-2xl border border-border/50 bg-card/40 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t.history.last7Days} · {t.dashboard.targets.label}</p>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dietData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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
              <Bar dataKey="protein" name={t.nutrition.rings.protein} fill="var(--chart-1)" stackId="macros" radius={[4, 4, 0, 0]} />
              <Bar dataKey="carbs" name={t.nutrition.rings.carbs} fill="var(--chart-2)" stackId="macros" />
              <Bar dataKey="fat" name={t.nutrition.rings.fat} fill="var(--chart-3)" stackId="macros" radius={[0, 0, 4, 4]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Workout trend */}
      <div className="rounded-2xl border border-border/50 bg-card/40 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t.history.last7Days} · {t.history.workoutTrend}</p>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={workoutData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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
    </div>
  )
}
```

- [ ] **Step 2: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: no errors from new file. May have unused-var warning on `_date` param — that's acceptable for interface compatibility.

- [ ] **Step 3: Commit**

```bash
git add web/components/history/trend-charts.tsx
git commit -m "feat: extract TrendCharts component from diet/workout day sections"
```

---

### Task B2: Create WeeklySummaryBar component

**Files:**
- Create: `web/components/history/weekly-summary-bar.tsx`

**Interfaces:**
- Produces: `WeeklySummaryBar({ dietWeekData, workoutWeekData, todayStr, onOpenTrends })` — computes aggregates and displays compact stats row
- Consumes: same data types as TrendCharts

- [ ] **Step 1: Create the component**

```tsx
// web/components/history/weekly-summary-bar.tsx
'use client'

import { TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { useT } from '@/lib/i18n/provider'
import { toLocalDateStr } from '@/lib/utils/date'
import type { NutritionDayData, WorkoutLogItem } from '@/app/actions/types'

const toDateStr = toLocalDateStr

interface WeeklySummaryBarProps {
  dietWeekData?: Record<string, NutritionDayData>
  workoutWeekData?: Record<string, WorkoutLogItem[]>
  todayStr: string
  onOpenTrends?: () => void
}

function computeStreak(
  dietWeekData: Record<string, NutritionDayData> | undefined,
  workoutWeekData: Record<string, WorkoutLogItem[]> | undefined,
  todayStr: string
): number {
  let streak = 0
  for (let i = 0; i < 7; i++) {
    const date = new Date(`${todayStr}T12:00:00`)
    date.setDate(date.getDate() - i)
    const dateStr = toLocalDateStr(date)
    const hasDiet = (dietWeekData?.[dateStr]?.dietLogs?.length ?? 0) > 0
    const hasWorkout = (workoutWeekData?.[dateStr]?.length ?? 0) > 0
    if (hasDiet || hasWorkout) {
      streak++
    } else {
      break
    }
  }
  return streak
}

export function WeeklySummaryBar({ dietWeekData, workoutWeekData, todayStr, onOpenTrends }: WeeklySummaryBarProps) {
  const t = useT()

  const totals = useMemo(() => {
    let kcal = 0
    let workouts = 0
    let minutes = 0
    for (const day of Object.values(dietWeekData ?? {})) {
      kcal += day.total_calories ?? 0
    }
    for (const logs of Object.values(workoutWeekData ?? {})) {
      workouts += logs.length
      for (const l of logs) {
        minutes += l.duration_minutes ?? 0
      }
    }
    const streak = computeStreak(dietWeekData, workoutWeekData, todayStr)
    return { kcal, workouts, minutes, streak }
  }, [dietWeekData, workoutWeekData, todayStr])

  return (
    <div className="glass glass-highlight rounded-2xl p-2.5">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{t.history.thisWeek}</span>
          <span>{totals.kcal.toLocaleString()} {t.common.kcal}</span>
          <span>{totals.workouts} {t.history.workouts}</span>
          <span>{totals.minutes} min</span>
          {totals.streak > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              🔥 {totals.streak}d
            </span>
          )}
        </div>
        {onOpenTrends && (
          <button
            type="button"
            onClick={onOpenTrends}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <TrendingUp size={13} />
            {t.history.trends}
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add missing i18n keys**

The component uses `t.history.thisWeek`, `t.history.workouts`, `t.history.trends`. Verify these exist in the i18n dictionary. If not, add English fallbacks.

Check: `grep -r "thisWeek\|workouts\|trends" web/lib/i18n/`
If missing, add to the English dictionary.

- [ ] **Step 3: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add web/components/history/weekly-summary-bar.tsx
git commit -m "feat: add WeeklySummaryBar with week totals and logging streak"
```

---

### Task B3: Create DayTimeline component

**Files:**
- Create: `web/components/history/day-timeline.tsx`

**Interfaces:**
- Produces: `DayTimeline({ date, userId, dietData, workoutLogs, onChange })` — renders interleaved diet + workout items
- Consumes: `NutritionDayData`, `WorkoutLogItem`, `DietLogEditDialog`, `WorkoutLogEditDialog`

- [ ] **Step 1: Create the component**

```tsx
// web/components/history/day-timeline.tsx
'use client'

import { Dumbbell, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '@/lib/i18n/provider'
import { cn } from '@/lib/utils'
import { toLocalDateStr } from '@/lib/utils/date'
import { useToast } from '@/components/ui/use-toast'
import { EmptyState } from '@/components/ui/empty-state'
import { DietLogEditDialog } from '@/components/log-form/diet-log-edit-dialog'
import { WorkoutLogEditDialog } from '@/components/log-form/workout-log-edit-dialog'
import { deleteDietLog } from '@/app/actions/history'
import { deleteWorkoutLog } from '@/app/actions/history'
import { tError } from '@/lib/i18n/errors'
import type { NutritionDayData, DietLogItem, WorkoutLogItem } from '@/app/actions/types'

const toDateStr = toLocalDateStr

interface DayTimelineProps {
  date: Date
  userId?: string
  dietData?: NutritionDayData
  workoutLogs?: WorkoutLogItem[]
  onChange?: () => void
}

type TimelineItem = { kind: 'diet'; data: DietLogItem; slot: string } | { kind: 'workout'; data: WorkoutLogItem }

const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner', 'lateNight'] as const

function bucketByLoggedAt(iso: string): string {
  const h = new Date(iso).getHours()
  if (h < 10) return 'breakfast'
  if (h < 13) return 'lunch'
  if (h < 16) return 'snack'
  if (h < 21) return 'dinner'
  return 'lateNight'
}

const SLOT_LABELS: Record<string, string> = {
  breakfast: '🥣 Breakfast',
  lunch: '🥗 Lunch',
  snack: '🍪 Snack',
  dinner: '🍽️ Dinner',
  lateNight: '🌙 Late Night',
}

export function DayTimeline({ date, userId, dietData, workoutLogs, onChange }: DayTimelineProps) {
  const t = useT()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [isPending, startTransition] = useTransition()
  const [editingDiet, setEditingDiet] = useState<DietLogItem | null>(null)
  const [editingWorkout, setEditingWorkout] = useState<WorkoutLogItem | null>(null)
  const dateStr = toDateStr(date)

  const timelineItems = useMemo((): TimelineItem[] => {
    const items: TimelineItem[] = []

    // Group diet logs by meal slot
    const dietLogs = dietData?.dietLogs ?? []
    const grouped = new Map<string, DietLogItem[]>()
    for (const log of dietLogs) {
      const slot = bucketByLoggedAt(log.logged_at)
      const arr = grouped.get(slot) || []
      arr.push(log)
      grouped.set(slot, arr)
    }

    for (const slot of MEAL_ORDER) {
      for (const log of grouped.get(slot) ?? []) {
        items.push({ kind: 'diet', data: log, slot })
      }
    }

    // Workout items
    for (const log of workoutLogs ?? []) {
      items.push({ kind: 'workout', data: log })
    }

    items.sort((a, b) => {
      const aTime = new Date(a.kind === 'diet' ? a.data.logged_at : a.data.logged_at).getTime()
      const bTime = new Date(b.kind === 'diet' ? b.data.logged_at : b.data.logged_at).getTime()
      return aTime - bTime
    })

    return items
  }, [dietData, workoutLogs])

  const handleDeleteDiet = (log: DietLogItem) => {
    if (!userId || isPending) return
    startTransition(async () => {
      const result = await deleteDietLog(log.id)
      if (!result.success) {
        toast({ variant: 'destructive', title: 'Delete failed', description: tError(t, result.error) })
        return
      }
      void qc.invalidateQueries({ queryKey: ['nutrition', dateStr] })
      onChange?.()
    })
  }

  const handleDeleteWorkout = (log: WorkoutLogItem) => {
    if (!userId || isPending) return
    startTransition(async () => {
      const result = await deleteWorkoutLog(log.id)
      if (!result.success) {
        toast({ variant: 'destructive', title: 'Delete failed', description: tError(t, result.error) })
        return
      }
      void qc.invalidateQueries({ queryKey: ['workouts', dateStr] })
      onChange?.()
    })
  }

  if (timelineItems.length === 0) {
    return (
      <EmptyState
        icon={UtensilsCrossed}
        title={t.nutrition.empty.title}
        description={t.nutrition.empty.description}
        size="inset"
      />
    )
  }

  let lastSlot = ''

  return (
    <>
      <div className="space-y-1">
        <AnimatePresence initial={false}>
          {timelineItems.map((item, idx) => {
            const isNewSlot = item.kind === 'diet' && item.slot !== lastSlot
            if (isNewSlot) lastSlot = item.slot

            return (
              <React.Fragment key={item.kind === 'diet' ? item.data.id : item.data.id}>
                {isNewSlot && (
                  <div className="flex items-center gap-2 pb-1 pt-2 first:pt-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {SLOT_LABELS[item.slot] ?? item.slot}
                    </span>
                  </div>
                )}
                <motion.div
                  layout
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="group flex items-center gap-2 rounded-lg border border-border/50 bg-card/60 px-2 py-2"
                >
                  {item.kind === 'diet' ? (
                    <>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <UtensilsCrossed size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{item.data.food_name}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {item.data.calories} kcal
                          {item.data.protein != null && ` · P${item.data.protein}`}
                          {item.data.carbs != null && ` · C${item.data.carbs}`}
                          {item.data.fat != null && ` · F${item.data.fat}`}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1">
                        <Dumbbell size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{item.data.workout_name}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {item.data.duration_minutes ? `${item.data.duration_minutes} min` : null}
                          {item.data.calories_burned ? ` · ${item.data.calories_burned} kcal` : null}
                          {item.data.sets ? ` · ${item.data.sets} sets` : null}
                        </p>
                      </div>
                    </>
                  )}
                  {userId && (
                    <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => item.kind === 'diet' ? setEditingDiet(item.data) : setEditingWorkout(item.data)}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => item.kind === 'diet' ? handleDeleteDiet(item.data) : handleDeleteWorkout(item.data)}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </motion.div>
              </React.Fragment>
            )
          })}
        </AnimatePresence>
      </div>

      <DietLogEditDialog log={editingDiet} onClose={() => setEditingDiet(null)} onSuccess={onChange} />
      <WorkoutLogEditDialog log={editingWorkout} onClose={() => setEditingWorkout(null)} onSuccess={onChange} />
    </>
  )
}
```

- [ ] **Step 2: Add missing React import**

Note: `React.Fragment` usage requires `import React from 'react'` at the top. The file already imports from 'react' — ensure `React` is imported.

- [ ] **Step 3: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: no errors (may need to adjust import paths for `DietLogEditDialog`, `WorkoutLogEditDialog`, `deleteDietLog`, `deleteWorkoutLog`)

- [ ] **Step 4: Commit**

```bash
git add web/components/history/day-timeline.tsx
git commit -m "feat: add DayTimeline with interleaved diet and workout items"
```

---

### Task B4: Restructure HistoryCenter with new layout

**Files:**
- Modify: `web/components/history/history-center.tsx`

**Interfaces:**
- Consumes: `WeeklySummaryBar`, `DayTimeline`, `TrendCharts`
- Produces: same `HistoryCenter` export signature, new internal layout

- [ ] **Step 1: Rewrite HistoryCenter**

Replace the current `HistoryCenter` body with the new layout. The component replaces the two `DietDaySection` / `WorkoutDaySection` with `WeeklySummaryBar` + `DayTimeline`, and adds a trend sheet.

```tsx
// web/components/history/history-center.tsx (key changes)

import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useT } from '@/lib/i18n/provider'
import { toLocalDateStr } from '@/lib/utils/date'
import { getNutritionRange, getWorkoutHistory } from '@/app/actions/history'
import { WeeklySummaryBar } from './weekly-summary-bar'
import { DayTimeline } from './day-timeline'
import { TrendCharts } from './trend-charts'

// ... keep subDaysStr, toDateStr helpers unchanged ...

export function HistoryCenter({ userId, onLogSuccess }: HistoryCenterProps) {
  const t = useT()
  const qc = useQueryClient()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [trendsOpen, setTrendsOpen] = useState(false)

  const todayStr = toDateStr(new Date())
  const selectedStr = toDateStr(selectedDate)
  const isToday = selectedStr === todayStr
  const isFuture = selectedStr > todayStr
  const weekStart = useMemo(() => subDaysStr(todayStr, 6), [todayStr])

  // ... keep shiftDay, nutritionQuery, workoutQuery, useEffect cache seeding unchanged ...

  const dietData = nutritionQuery.data?.[selectedStr]
  const workoutLogs = workoutQuery.data?.[selectedStr]

  return (
    <div className="flex flex-col gap-2">
      {/* Weekly summary bar */}
      <WeeklySummaryBar
        dietWeekData={nutritionQuery.data}
        workoutWeekData={workoutQuery.data}
        todayStr={todayStr}
        onOpenTrends={() => setTrendsOpen(true)}
      />

      {/* Date selector */}
      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button" onClick={() => shiftDay(-1)} aria-label={t.nutrition.prevDay}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft size={14} />
        </button>

        <label className="relative cursor-pointer rounded-full border border-border/60 bg-secondary/50 px-3 py-1 text-center transition-colors hover:bg-secondary">
          <span className="text-xs font-medium text-foreground tabular-nums">
            {selectedDate.toLocaleDateString(t.common.locale, { month: 'short', day: 'numeric', weekday: 'short' })}
          </span>
          <input
            type="date" value={toDateStr(selectedDate)} max={toDateStr(new Date())}
            onChange={(e) => { if (e.target.value) setSelectedDate(new Date(`${e.target.value}T12:00:00`)) }}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={t.history.title}
          />
        </label>

        <button
          type="button" onClick={() => shiftDay(1)} disabled={isFuture} aria-label={t.nutrition.nextDay}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          <ChevronRight size={14} />
        </button>

        {!isToday && (
          <button
            type="button" onClick={() => setSelectedDate(new Date())} aria-label={t.nutrition.backToToday}
            className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
          >
            <CalendarDays size={14} />
          </button>
        )}
      </div>

      {/* Day timeline — fills remaining viewport */}
      <div className="glass glass-highlight max-h-[calc(100dvh-18rem)] overflow-y-auto rounded-2xl p-3">
        <DayTimeline
          date={selectedDate}
          userId={userId}
          dietData={dietData}
          workoutLogs={workoutLogs}
          onChange={onLogSuccess}
        />
      </div>

      {/* Trend charts sheet */}
      <Sheet open={trendsOpen} onOpenChange={setTrendsOpen}>
        <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl p-0">
          <SheetHeader className="px-4 pt-5 pb-2">
            <SheetTitle className="font-display text-lg">{t.history.last7Days} · {t.history.trends}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
            <TrendCharts
              date={selectedDate}
              dietWeekData={nutritionQuery.data}
              workoutWeekData={workoutQuery.data}
              todayStr={todayStr}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
```

- [ ] **Step 2: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: no errors. Fix any import path issues.

- [ ] **Step 3: Verify — lint**

```bash
cd web && npm run lint
```
Expected: no new errors. Remove unused imports (`DietDaySection`, `WorkoutDaySection`).

- [ ] **Step 4: Commit**

```bash
git add web/components/history/history-center.tsx
git commit -m "feat: restructure Record page with WeeklySummaryBar, DayTimeline, and trend sheet"
```

---

### Task B5: Clean up old diet-day-section and workout-day-section

**Files:**
- Modify: `web/components/history/diet-day-section.tsx`
- Modify: `web/components/history/workout-day-section.tsx`

**Goal**: These are no longer rendered by `HistoryCenter`. Their chart code was extracted to `TrendCharts`. They may still be imported elsewhere — if so, retain but mark deprecated. If not imported anywhere else, their removal is safe.

- [ ] **Step 1: Check for remaining imports**

```bash
cd web && grep -r "diet-day-section\|workout-day-section" --include="*.tsx" --include="*.ts"
```

- [ ] **Step 2a: If NO other imports exist** — remove both files

```bash
git rm web/components/history/diet-day-section.tsx web/components/history/workout-day-section.tsx
```

- [ ] **Step 2b: If other imports exist** — simplify to stub exports that re-export from TrendCharts

In `diet-day-section.tsx`, replace the entire file body with a re-export or deprecation comment:
```tsx
// Deprecated — chart code moved to ./trend-charts.tsx, item list moved to ./day-timeline.tsx
// This file is kept for backward compatibility with any remaining imports.
export { TrendCharts as DietDaySection } from './trend-charts'
```
(Only do this if the existing import signature is compatible — otherwise handle case-by-case.)

- [ ] **Step 3: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove deprecated diet/workout day sections after Record page restructure"
```

---

## Stream C: Today's Meals Sheet (independent — can run in parallel with A and B)

### Task C1: Replace inline meal expansion with bottom sheet

**Files:**
- Modify: `web/components/dashboard/today-overview.tsx`

**Interfaces:**
- Consumes: `Sheet` from `@/components/ui/sheet`, `MealTimeline` from `@/components/nutrition/meal-timeline`
- Produces: same `TodayOverview` export signature, different internal behavior

- [ ] **Step 1: Rewrite the meals section of TodayOverview**

Remove the `AnimatePresence` block and `dietOpen` state. Replace with a `Sheet` + compact summary trigger.

Key changes in `today-overview.tsx`:

Remove:
```tsx
const [dietOpen, setDietOpen] = useState(false)
```

Add import:
```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
```

Replace the toggle button + AnimatePresence block (lines 116–152) with:

```tsx
<Sheet>
  <SheetTrigger asChild>
    <button
      type="button"
      className="relative mt-3 flex w-full items-center justify-between rounded-xl border border-border/50 bg-card/40 px-3 py-2 text-left transition-colors hover:border-primary/40 md:py-2.5"
    >
      <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
        <UtensilsCrossed size={14} className="text-primary" aria-hidden />
        {t.dashboard.overview.todaysMeals}
      </span>
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {dietSummaryText}
        <ChevronRight size={14} />
      </span>
    </button>
  </SheetTrigger>
  <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl p-0">
    <SheetHeader className="px-4 pt-5 pb-2">
      <SheetTitle className="font-display text-lg">{t.dashboard.overview.todaysMeals}</SheetTitle>
    </SheetHeader>
    <div className="flex-1 overflow-y-auto px-4 pb-6">
      <TodayDietDetails userId={userId} onDietChanged={onDietChanged} />
    </div>
  </SheetContent>
</Sheet>
```

Where `dietSummaryText` is computed from dashboard data. You need to pass the diet summary data — either compute it from props or add a minimal query:

If `todayDietSummary` is not available as a prop, add a simple hook:
```tsx
// Add near the top of TodayOverview
const { data: dietSummary } = useQuery({
  queryKey: ['nutrition', getTodayDate()],
  queryFn: () => getNutritionByDate(getTodayDate()),
  enabled: !!userId,
  staleTime: 60_000,
})
const itemCount = dietSummary?.dietLogs?.length ?? 0
const totalCal = dietSummary?.total_calories ?? 0
const dietSummaryText = itemCount > 0
  ? `${itemCount} ${itemCount === 1 ? t.nutrition.item : t.nutrition.items} · ${totalCal.toLocaleString()} ${t.common.kcal}`
  : t.dashboard.overview.noMeals
```

Add required imports:
```tsx
import { useQuery } from '@tanstack/react-query'
import { getNutritionByDate } from '@/app/actions/history'
import { getTodayDate } from '@/lib/utils/date'
import { ChevronRight } from 'lucide-react'
```

Remove unused imports: `motion` from `framer-motion`, `AnimatePresence`, `ChevronDown` if no longer used elsewhere in this file.

- [ ] **Step 2: Add missing i18n keys**

Verify these keys exist in the i18n dictionary:
- `t.nutrition.item` — singular "item"
- `t.nutrition.items` — plural "items"
- `t.dashboard.overview.noMeals` — "No meals logged"

If missing, add to English dictionary.

- [ ] **Step 3: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: no errors

- [ ] **Step 4: Verify — lint**

```bash
cd web && npm run lint
```
Expected: no new errors

- [ ] **Step 5: Commit**

```bash
git add web/components/dashboard/today-overview.tsx
git commit -m "feat: replace inline meal expansion with bottom sheet on Today page"
```

---

## Verification (after all tasks)

- [ ] **Full typecheck**: `cd web && npm run typecheck`
- [ ] **Full lint**: `cd web && npm run lint`
- [ ] **Build**: `cd web && npm run build`
- [ ] **Visual QA**: Check on phone viewport that Today page fits one screen, Record page shows timeline items, and AI Coach has no text bleed-through

---

## Execution Order

Tasks within each stream must run sequentially (each builds on the previous). The three streams are independent and can run in parallel:

```
Wave 1 (parallel):  A1, B1, B2, B3
Wave 2 (parallel):  A2, B4, B5, C1
Wave 3 (parallel):  A3
```

If subagent-driven: dispatch A1+B1+B2+B3 as 4 parallel agents, wait, then A2+B4+B5+C1, wait, then A3.
