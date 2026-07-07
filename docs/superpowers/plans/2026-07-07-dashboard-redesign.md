# Dashboard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Today dashboard page: add training mode with per-set logging, simplify food card to intake-only, clean quick log to food-only two-line layout, and purge water tracking entirely.

**Architecture:** Four independent work streams. Stream A purges water tracking from 11 files. Stream B redesigns the food card (ring + macros). Stream C simplifies the quick log bar. Stream D builds the training mode (new components + server actions + integration). Streams A, C, and D can start in parallel; Stream B runs after Stream A completes (UI file overlap on today-metrics and today-overview).

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Sheet), lucide-react, framer-motion, Supabase

## Global Constraints

- Every main page must fit one phone viewport without vertical scrolling
- Match existing code patterns: glass cards (`glass glass-highlight rounded-2xl`), color tokens (`--primary`, `--border`, `--muted-foreground`), text sizes (`text-xs`, `text-[11px]`)
- No new npm dependencies
- `npm run typecheck` must pass after all changes
- `npm run lint` must pass after all changes
- Server actions always resolve `userId` internally via `authedUserId()`, never passed by callers
- File size ceiling: new files ≤ 250 LOC; extract if larger

---

## Stream A: Water Removal (11 files, independent)

### Task A1: Purge water from backend types and actions

**Files:**
- Modify: `web/app/actions/types.ts`
- Modify: `web/app/actions/dashboard.ts`

**Interfaces:**
- Consumes: `UserGoals`, `TodayStats`, `DashboardData` types; `logWater`, `getUserGoals`, `getDashboardData` functions
- Produces: Water-free types; `logWater` removed; water fields stripped from `getUserGoals` and `getDashboardData` return values

- [ ] **Step 1: Remove water types from types.ts**

In `web/app/actions/types.ts`, remove:
```typescript
// In UserGoals interface: remove water_goal
water_goal: number;

// In TodayStats interface: remove water_intake  
water_intake: number;
```

- [ ] **Step 2: Remove logWater from dashboard.ts**

In `web/app/actions/dashboard.ts`, remove the entire `logWater` function (lines 118-190). Also remove its export.

- [ ] **Step 3: Strip water from getUserGoals**

In `getUserGoals()` (around line 216), remove:
```typescript
water_goal: DEFAULT_WATER_GOAL_ML,
```
from the default goals object. Also remove the real `water_goal` field from the SELECT query return.

- [ ] **Step 4: Strip water from getDashboardData**

In `getDashboardData()` (around line 360), remove `water_goal` from the goals object, and `water_intake` from the daily stats object in the return value.

- [ ] **Step 5: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: errors in files that reference removed water fields (these will be fixed in A2/A3).

- [ ] **Step 6: Commit**

```bash
git add web/app/actions/types.ts web/app/actions/dashboard.ts
git commit -m "refactor: remove water tracking from backend types and server actions"
```

---

### Task A2: Purge water from cache, metrics, AI, and stats

**Files:**
- Modify: `web/lib/queries/dashboard.ts`
- Delete: `web/lib/metrics/water.ts`
- Modify: `web/lib/ai/user-context.ts`
- Modify: `web/lib/ai/agent.ts`
- Modify: `web/lib/stats/recompute-daily-stats.ts`

**Interfaces:**
- Consumes: `setWater` from dashboard queries; `water.ts`; `water_intake` in user-context; `log_water` in agent tools; water reset in recompute
- Produces: All water infrastructure removed

- [ ] **Step 1: Remove setWater from dashboard queries**

In `web/lib/queries/dashboard.ts`, find and remove the `setWater` function and its export from `useDashboardActions`. The function signature is `setWater: (amountMl: number) => void` — remove it from both the return type and the implementation.

- [ ] **Step 2: Delete water metrics file**

```bash
rm web/lib/metrics/water.ts
```

- [ ] **Step 3: Remove water from AI user context**

In `web/lib/ai/user-context.ts`, find the line building user context with `water: dailyStats?.water_intake` (around line 65). Remove the `water` field from the context object.

- [ ] **Step 4: Remove log_water from agent tools**

In `web/lib/ai/agent.ts`, find the `LOG_TOOLS` Set (around line 69). Remove `"log_water"` from the set.

- [ ] **Step 5: Remove water_intake reset from recompute**

In `web/lib/stats/recompute-daily-stats.ts`, find and remove the line that resets `water_intake` to 0 in the daily stats recompute (around line 75).

- [ ] **Step 6: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: only pre-existing errors, or errors from UI files still passing water props (fixed in A3).

- [ ] **Step 7: Commit**

```bash
git add web/lib/queries/dashboard.ts web/lib/ai/user-context.ts web/lib/ai/agent.ts web/lib/stats/recompute-daily-stats.ts
git rm web/lib/metrics/water.ts
git commit -m "refactor: remove water tracking from cache layer, AI context, agent tools, and stats recompute"
```

---

### Task A3: Purge water from dashboard UI components

**Files:**
- Modify: `web/components/dashboard/dashboard-client.tsx`
- Modify: `web/components/dashboard/today-overview.tsx`
- Modify: `web/components/dashboard/today-metrics.tsx`
- Modify: `web/components/dashboard/nutrition-targets-dialog.tsx`

**Interfaces:**
- Consumes: Water props passed through dashboard-client → today-overview → today-metrics; water field in nutrition-targets-dialog
- Produces: Clean prop interfaces, no water props or fields

- [ ] **Step 1: Remove water props from dashboard-client.tsx**

In `web/components/dashboard/dashboard-client.tsx` (around lines 123-125), remove:
```tsx
waterMl={dashboardData?.today.water_intake}
waterGoalMl={dashboardData?.goals.water_goal}
onWaterLogged={handleLogSuccess}
```
from the `<TodayOverview>` component call.

- [ ] **Step 2: Remove water props from today-overview.tsx**

In `web/components/dashboard/today-overview.tsx`, remove from the props interface (around lines 29-31):
```typescript
waterMl?: number
waterGoalMl?: number
onWaterLogged?: () => void
```

- [ ] **Step 3: Remove water props from today-metrics.tsx**

In `web/components/dashboard/today-metrics.tsx`, remove from the props interface (around lines 20-22):
```typescript
waterMl?: number
waterGoalMl?: number
onWaterLogged?: () => void
```
Also remove the comment on lines 16-18 about water being no longer surfaced.

- [ ] **Step 4: Remove water field from nutrition-targets-dialog.tsx**

In `web/components/dashboard/nutrition-targets-dialog.tsx`, find and remove the water goal input field (around line 192-201). This is a form field for setting daily water goal — remove the entire field group including label, input, and unit text.

- [ ] **Step 5: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: clean (no new errors).

- [ ] **Step 6: Commit**

```bash
git add web/components/dashboard/dashboard-client.tsx web/components/dashboard/today-overview.tsx web/components/dashboard/today-metrics.tsx web/components/dashboard/nutrition-targets-dialog.tsx
git commit -m "refactor: remove water tracking from all dashboard UI components"
```

---

## Stream B: Food Card Redesign (depends on Stream A completion)

### Task B1: Redesign today-hero.tsx — single intake ring

**Files:**
- Modify: `web/components/dashboard/today-hero.tsx`

**Interfaces:**
- Consumes: `kcalIntake`, `kcalGoal` props (keep); `kcalBurn`, `workoutMinutes` props (remove)
- Produces: Single-ring SVG showing intake progress toward goal, center text "1,450 / 2,000 kcal", color shifts green→orange→red

- [ ] **Step 1: Remove burn and workout props**

Remove `kcalBurn?: number` and `workoutMinutes?: number` from the props interface. Remove corresponding destructuring.

- [ ] **Step 2: Replace dual-ring SVG with single ring**

The current SVG at lines 111-161 has an outer ring (`intakePct`) and inner ring (`burnPct`). Replace with a single ring that fills based on `intakePct = kcalIntake / kcalGoal` clamped to 1.0.

The ring color should shift based on progress:
- < 70%: `var(--chart-2)` (green)
- 70-100%: `var(--chart-3)` (orange)  
- > 100%: `var(--chart-5)` (red)

Use the same SVG technique (circumference-based stroke-dashoffset) as the current ring.

- [ ] **Step 3: Replace center text**

Remove the "NET INTAKE" label and net math. Replace center text (lines 163-180) with:
```tsx
<div className="absolute inset-0 flex flex-col items-center justify-center">
  <span className="text-2xl font-bold tabular-nums text-foreground">
    {displayIntake.toLocaleString()}
  </span>
  <span className="text-[11px] text-muted-foreground">
    / {kcalGoal.toLocaleString()} kcal
  </span>
</div>
```

- [ ] **Step 4: Remove 3 stat rows**

Delete the three `<Stat>` rows (lines 183-205) showing intake kcal, burn kcal, and workout minutes.

- [ ] **Step 5: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: errors in today-overview.tsx (removed props) — will be fixed in B3.

- [ ] **Step 6: Commit**

```bash
git add web/components/dashboard/today-hero.tsx
git commit -m "feat: redesign calorie ring to single intake-progress arc with color shifts"
```

---

### Task B2: Redesign today-metrics.tsx — macro progress bars

**Files:**
- Modify: `web/components/dashboard/today-metrics.tsx`

**Interfaces:**
- Consumes: `protein`, `carbs`, `fat` (current values); `proteinGoal`, `carbsGoal`, `fatGoal` (targets) — add goal props
- Produces: Horizontal progress bars replacing the current 3-column macro cell grid

- [ ] **Step 1: Add goal props to interface**

Add `proteinGoal?: number`, `carbsGoal?: number`, `fatGoal?: number` to the props interface. These come from `dashboardData.goals` in today-overview.

- [ ] **Step 2: Replace MacroCell grid with progress bars**

Replace the `grid grid-cols-3 gap-1.5` layout (lines 43-73) with a vertical stack of 3 progress bars:

```tsx
<div className="flex flex-col gap-1.5">
  {[
    { label: t.nutrition.rings.protein, value: protein, goal: proteinGoal, color: 'var(--chart-1)' },
    { label: t.nutrition.rings.carbs, value: carbs, goal: carbsGoal, color: 'var(--chart-2)' },
    { label: t.nutrition.rings.fat, value: fat, goal: fatGoal, color: 'var(--chart-3)' },
  ].map(({ label, value, goal, color }) => {
    const pct = goal && goal > 0 ? Math.min((value / goal) * 100, 100) : 0
    return (
      <div key={label} className="flex items-center gap-2">
        <span className="w-14 text-[10px] font-medium text-muted-foreground">{label}</span>
        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground w-16 text-right">
          {value} / {goal ?? '—'}g
        </span>
      </div>
    )
  })}
</div>
```

- [ ] **Step 3: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: errors in today-overview.tsx (new goal props need passing) — will be fixed in B3.

- [ ] **Step 4: Commit**

```bash
git add web/components/dashboard/today-metrics.tsx
git commit -m "feat: replace macro cells with horizontal progress bars"
```

---

### Task B3: Update today-overview.tsx — wire redesigned components

**Files:**
- Modify: `web/components/dashboard/today-overview.tsx`

**Interfaces:**
- Consumes: Redesigned `TodayHero` (fewer props), redesigned `TodayMetrics` (needs goal props)
- Produces: Updated `<TodayOverview>` passing correct props to redesigned children

- [ ] **Step 1: Remove water, burn, workout props from interface**

Remove `waterMl?`, `waterGoalMl?`, `onWaterLogged?`, `kcalBurn?`, `workoutMinutes?` from the TodayOverview props interface.

- [ ] **Step 2: Pass goal props to TodayMetrics**

Add `proteinGoal`, `carbsGoal`, `fatGoal` to the destructured props. Pass them to `<TodayMetrics>`:
```tsx
<TodayMetrics
  protein={protein} carbs={carbs} fat={fat}
  proteinGoal={proteinGoal} carbsGoal={carbsGoal} fatGoal={fatGoal}
/>
```

- [ ] **Step 3: Update TodayHero call**

Remove `kcalBurn` and `workoutMinutes` props from `<TodayHero>`. Keep `kcalIntake` and `kcalGoal`.

- [ ] **Step 4: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: clean (no errors).

- [ ] **Step 5: Commit**

```bash
git add web/components/dashboard/today-overview.tsx
git commit -m "feat: wire redesigned food card components and pass macro goal props"
```

---

## Stream C: Quick Log Redesign (independent)

### Task C1: Modify quickLog.ts — food-only parsing

**Files:**
- Modify: `web/app/actions/quickLog.ts`

**Interfaces:**
- Consumes: LLM-based natural language parsing prompt
- Produces: Food-only parsing (remove workout segment handling)

- [ ] **Step 1: Update LLM prompt to food-only**

In the system/user prompt (around lines 56-84), remove workout-related instructions. Change the prompt to only identify food items. Remove `kind: 'workout'` from the JSON schema instruction.

- [ ] **Step 2: Remove workout result types and insert logic**

Remove `QuickLogWorkoutResult` type if no longer used. Remove the workout insert block (around lines 207-223) that inserts into `workout_logs`. Remove workout-related cache invalidation.

- [ ] **Step 3: Update return type**

The action should return only `QuickLogFoodResult[]` — no workout results. Update the return type signature.

- [ ] **Step 4: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: errors in home-log-bar.tsx (summarize function references workout results) — will be fixed in C2.

- [ ] **Step 5: Commit**

```bash
git add web/app/actions/quickLog.ts
git commit -m "refactor: simplify quickLog to food-only parsing"
```

---

### Task C2: Redesign home-log-bar.tsx — two-line layout

**Files:**
- Modify: `web/components/dashboard/home-log-bar.tsx`

**Interfaces:**
- Consumes: Redesigned layout (two-line: input+send on top, camera+manual on bottom)
- Produces: Food-only quick log with cleaner interface, no Mic button, workout-free summarization

- [ ] **Step 1: Remove Mic button and workout summary**

Remove the Mic button (lines 207-222) — the speech-to-text toggle. Also update the `summarize()` function (lines 300-315) to only handle food results, removing workout count/burned text.

- [ ] **Step 2: Restructure to two-line layout**

Current single-row form (lines 189-256) — restructure into two rows:

**Line 1**: Text input (flex-1) + Submit button (with CornerDownLeft icon). No icons inside the input row.

**Line 2**: Two compact labeled buttons placed below the input:
```tsx
<div className="flex gap-2">
  <button onClick={handleCamera} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors">
    <Camera size={13} />
    Photo
  </button>
  <button onClick={() => setEditOpen(true)} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors">
    <PencilLine size={13} />
    Manual
  </button>
</div>
```

- [ ] **Step 3: Verify — typecheck + lint**

```bash
cd web && npm run typecheck && npm run lint
```
Expected: clean (no new errors).

- [ ] **Step 4: Manual QA — verify layout**

Build and visually check that the two-line layout renders correctly on mobile viewport:
```bash
cd web && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add web/components/dashboard/home-log-bar.tsx
git commit -m "feat: redesign quick log bar to two-line food-only layout"
```

---

## Stream D: Training Mode (independent of A/B/C)

### Task D1: Create client-side session state

**Files:**
- Create: `web/lib/training/session-state.ts`

**Interfaces:**
- Produces: `TrainingSession` type, `useTrainingSession(plan)` hook, `createTrainingSession(plan)`, `logSet(session, exerciseIdx, setNumber, weight, reps)`, `completeSet(session, exerciseIdx, setNumber)`, `getSessionSummary(session)`
- Consumes: `PlanDay`, `PlanExercise` from `@/lib/plans/types`

- [ ] **Step 1: Define TrainingSession types**

```typescript
// web/lib/training/session-state.ts
import type { PlanDay, PlanExercise } from '@/lib/plans/types'

export interface CompletedSet {
  setNumber: number
  weightKg: number | null
  reps: number | null
  loggedAt: Date
}

export interface ExerciseProgress {
  exercise: PlanExercise
  completedSets: CompletedSet[]
}

export interface TrainingSession {
  planId: string
  dayId: string
  dayName: string
  startedAt: Date
  exercises: ExerciseProgress[]
}
```

- [ ] **Step 2: Create session helpers**

```typescript
export function createTrainingSession(planId: string, day: PlanDay): TrainingSession {
  return {
    planId,
    dayId: day.id ?? '',
    dayName: day.name,
    startedAt: new Date(),
    exercises: day.exercises.map((ex) => ({
      exercise: ex,
      completedSets: [],
    })),
  }
}

export function logSet(
  session: TrainingSession,
  exerciseIdx: number,
  setNumber: number,
  weightKg: number | null,
  reps: number | null
): TrainingSession {
  const updated = { ...session, exercises: [...session.exercises] }
  const ex = { ...updated.exercises[exerciseIdx], completedSets: [...updated.exercises[exerciseIdx].completedSets] }
  ex.completedSets.push({ setNumber, weightKg, reps, loggedAt: new Date() })
  updated.exercises[exerciseIdx] = ex
  return updated
}

export function isSessionComplete(session: TrainingSession): boolean {
  return session.exercises.every((ex) =>
    ex.completedSets.length >= (ex.exercise.sets ?? 0)
  )
}

export function getSessionSummary(session: TrainingSession) {
  const totalSets = session.exercises.reduce((sum, ex) => sum + ex.completedSets.length, 0)
  const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 1000)
  return { totalSets, elapsed }
}
```

- [ ] **Step 3: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: clean for this file.

- [ ] **Step 4: Commit**

```bash
git add web/lib/training/session-state.ts
git commit -m "feat: add client-side training session state management"
```

---

### Task D2: Create training server actions

**Files:**
- Create: `web/app/actions/training.ts`

**Interfaces:**
- Produces: `finishTrainingSession(input)` — batch-saves completed sets + summary workout_log row
- Consumes: `authedUserId` from `@/lib/auth/require-user`; Supabase client from `@/lib/supabaseClient`

- [ ] **Step 1: Create the server action**

```typescript
// web/app/actions/training.ts
'use server'

import { revalidatePath } from 'next/cache'
import { authedUserId } from '@/lib/auth/require-user'
import { supabase } from '@/lib/supabaseClient'
import type { CompletedSet } from '@/lib/training/session-state'
import { recomputeDailyStats } from '@/lib/stats/recompute-daily-stats'

interface FinishTrainingInput {
  planId: string
  dayId: string
  workoutName: string
  startedAt: string  // ISO
  exercises: {
    name: string
    completedSets: { setNumber: number; weightKg: number | null; reps: number | null }[]
  }[]
}

export async function finishTrainingSession(input: FinishTrainingInput) {
  const userId = await authedUserId()

  // Compute totals
  const totalSets = input.exercises.reduce((sum, ex) => sum + ex.completedSets.length, 0)
  const totalWeight = input.exercises.reduce(
    (sum, ex) => sum + ex.completedSets.reduce((s, set) => s + ((set.weightKg ?? 0) * (set.reps ?? 0)), 0),
    0
  )
  const estimatedCalories = Math.round(totalWeight * 0.1) // rough estimate
  const durationMinutes = Math.round(
    (Date.now() - new Date(input.startedAt).getTime()) / 60000
  )

  // Insert summary workout_log row
  const { data: workoutLog, error } = await supabase
    .from('workout_logs')
    .insert({
      user_id: userId,
      date: new Date().toISOString().split('T')[0],
      workout_name: input.workoutName,
      sets: totalSets,
      duration_minutes: Math.max(durationMinutes, 1),
      calories_burned: estimatedCalories,
      plan_id: input.planId,
      day_id: input.dayId,
      logged_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !workoutLog) return { success: false, error: 'Failed to save workout' }

  // Batch-insert set logs
  const setLogs = input.exercises.flatMap((ex) =>
    ex.completedSets.map((set) => ({
      workout_log_id: workoutLog.id,
      exercise_name: ex.name,
      set_number: set.setNumber,
      weight_kg: set.weightKg,
      reps: set.reps,
      logged_at: new Date().toISOString(),
    }))
  )

  if (setLogs.length > 0) {
    await supabase.from('workout_set_logs').insert(setLogs)
  }

  await recomputeDailyStats(userId)
  revalidatePath('/')

  return { success: true, workoutLogId: workoutLog.id }
}
```

- [ ] **Step 2: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: clean for this file (may need to check `recomputeDailyStats` import path).

- [ ] **Step 3: Commit**

```bash
git add web/app/actions/training.ts
git commit -m "feat: add finishTrainingSession server action with batch set logging"
```

---

### Task D3: Create set-logger and rest-timer components

**Files:**
- Create: `web/components/training/set-logger.tsx`
- Create: `web/components/training/rest-timer.tsx`

**Interfaces:**
- Produces: `SetLogger({ exerciseName, targetSets, targetWeight, completedSets, onLogSet })` — per-set input row
- Produces: `RestTimer({ onSkip, onComplete, duration? })` — countdown timer with skip

- [ ] **Step 1: Create set-logger.tsx**

```tsx
// web/components/training/set-logger.tsx
'use client'

import { Check } from 'lucide-react'
import { useState } from 'react'
import type { CompletedSet } from '@/lib/training/session-state'

interface SetLoggerProps {
  exerciseName: string
  targetSets: number
  targetWeight?: number | null
  targetRepsMin?: number | null
  targetRepsMax?: number | null
  completedSets: CompletedSet[]
  onLogSet: (weightKg: number | null, reps: number | null) => void
}

export function SetLogger({
  exerciseName: _exerciseName,
  targetSets,
  targetWeight,
  targetRepsMin,
  targetRepsMax,
  completedSets,
  onLogSet,
}: SetLoggerProps) {
  const [weight, setWeight] = useState(targetWeight?.toString() ?? '')
  const [reps, setReps] = useState(targetRepsMin?.toString() ?? '')

  const nextSetNumber = completedSets.length + 1
  const isDone = nextSetNumber > targetSets

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const w = weight ? Number(weight) : null
    const r = reps ? Number(reps) : null
    if (w === null && r === null) return
    onLogSet(w, r)
    // Keep weight pre-filled for next set, clear reps
    setReps(targetRepsMin?.toString() ?? '')
  }

  return (
    <div className="space-y-2">
      {/* Completed sets */}
      {completedSets.map((set) => (
        <div key={set.setNumber} className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2">
          <Check size={14} className="text-primary" />
          <span className="text-xs text-foreground">
            Set {set.setNumber}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {set.weightKg != null && `${set.weightKg}kg`}
            {set.weightKg != null && set.reps != null && ' × '}
            {set.reps != null && `${set.reps} reps`}
          </span>
        </div>
      ))}

      {/* Current set input */}
      {!isDone && (
        <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">Set {nextSetNumber}</span>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="kg"
            className="w-14 rounded-md border border-border/50 bg-background px-1.5 py-1 text-center text-xs tabular-nums"
          />
          <span className="text-[11px] text-muted-foreground">×</span>
          <input
            type="number"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            placeholder="reps"
            className="w-14 rounded-md border border-border/50 bg-background px-1.5 py-1 text-center text-xs tabular-nums"
          />
          <button
            type="submit"
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Check size={14} />
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create rest-timer.tsx**

```tsx
// web/components/training/rest-timer.tsx
'use client'

import { useEffect, useState, useRef } from 'react'

interface RestTimerProps {
  duration?: number  // seconds, default 90
  onSkip: () => void
  onComplete: () => void
}

export function RestTimer({ duration = 90, onSkip, onComplete }: RestTimerProps) {
  const [remaining, setRemaining] = useState(duration)
  const completedRef = useRef(false)

  useEffect(() => {
    if (remaining <= 0) {
      if (!completedRef.current) {
        completedRef.current = true
        onComplete()
      }
      return
    }
    const id = setInterval(() => setRemaining((r) => r - 1), 1000)
    return () => clearInterval(id)
  }, [remaining, onComplete])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60

  return (
    <div className="flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2">
      <span className="text-xs text-muted-foreground">Rest</span>
      <span className="text-sm font-mono tabular-nums text-foreground">
        {minutes}:{seconds.toString().padStart(2, '0')}
      </span>
      <button
        type="button"
        onClick={onSkip}
        className="text-[11px] font-medium text-primary hover:underline"
      >
        Skip
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: clean for these files.

- [ ] **Step 4: Commit**

```bash
git add web/components/training/set-logger.tsx web/components/training/rest-timer.tsx
git commit -m "feat: add SetLogger and RestTimer training mode components"
```

---

### Task D4: Create training-mode.tsx — full-screen session

**Files:**
- Create: `web/components/training/training-mode.tsx`

**Interfaces:**
- Produces: `TrainingMode({ planId, day, onClose, onFinish, userId })` — full-screen training session UI
- Consumes: `useTrainingSession`, `SetLogger`, `RestTimer`, `finishTrainingSession`

- [ ] **Step 1: Create the component**

```tsx
// web/components/training/training-mode.tsx
'use client'

import { ArrowLeft, Dumbbell } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PlanDay } from '@/lib/plans/types'
import {
  createTrainingSession,
  logSet,
  useTrainingSession,
  type TrainingSession,
} from '@/lib/training/session-state'
import { finishTrainingSession } from '@/app/actions/training'
import { SetLogger } from './set-logger'
import { RestTimer } from './rest-timer'

interface TrainingModeProps {
  planId: string
  day: PlanDay
  onClose: () => void
  onFinish: () => void
}

export function TrainingMode({ planId, day, onClose, onFinish }: TrainingModeProps) {
  const [session, setSession] = useState<TrainingSession>(() => createTrainingSession(planId, day))
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0)
  const [showingRest, setShowingRest] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)

  // Elapsed timer
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.round((Date.now() - session.startedAt.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [session.startedAt])

  const currentEx = session.exercises[currentExerciseIdx]
  const isLastExercise = currentExerciseIdx >= session.exercises.length - 1
  const isCurrentExerciseDone =
    currentEx.completedSets.length >= (currentEx.exercise.sets ?? 0)

  const handleLogSet = useCallback((weightKg: number | null, reps: number | null) => {
    const nextSet = currentEx.completedSets.length + 1
    setSession((s) => logSet(s, currentExerciseIdx, nextSet, weightKg, reps))
    setShowingRest(true)
  }, [currentExerciseIdx])

  const handleRestComplete = useCallback(() => {
    setShowingRest(false)
    // Auto-advance if current exercise is done
    const ex = session.exercises[currentExerciseIdx]
    if (ex.completedSets.length >= (ex.exercise.sets ?? 0) && !isLastExercise) {
      setCurrentExerciseIdx((i) => i + 1)
    }
  }, [currentExerciseIdx, isLastExercise, session.exercises])

  const handleFinish = useCallback(async () => {
    setSaving(true)
    const exercises = session.exercises.map((ex) => ({
      name: ex.exercise.name,
      completedSets: ex.completedSets.map((s) => ({
        setNumber: s.setNumber,
        weightKg: s.weightKg,
        reps: s.reps,
      })),
    }))

    await finishTrainingSession({
      planId: session.planId,
      dayId: session.dayId,
      workoutName: session.dayName,
      startedAt: session.startedAt.toISOString(),
      exercises,
    })

    setSaving(false)
    onFinish()
  }, [session, onFinish])

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button onClick={onClose} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <Dumbbell size={16} className="text-primary" />
          <span className="text-sm font-medium text-foreground">{session.dayName}</span>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
      </div>

      {/* Exercise list + current exercise */}
      <div className="flex-1 overflow-y-auto px-4">
        {/* Exercise tabs */}
        <div className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none]">
          {session.exercises.map((ex, idx) => {
            const done = ex.completedSets.length >= (ex.exercise.sets ?? 0)
            return (
              <button
                key={idx}
                onClick={() => { if (!showingRest) setCurrentExerciseIdx(idx) }}
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                  idx === currentExerciseIdx
                    ? 'bg-primary text-primary-foreground'
                    : done
                      ? 'bg-primary/10 text-primary'
                      : 'bg-secondary text-muted-foreground'
                }`}
              >
                {ex.exercise.name}
              </button>
            )
          })}
        </div>

        {/* Current exercise */}
        <div className="mt-4">
          <h2 className="font-display text-lg text-foreground">{currentEx.exercise.name}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Target: {currentEx.exercise.sets} sets
            {currentEx.exercise.reps_min != null && ` × ${currentEx.exercise.reps_min}${currentEx.exercise.reps_max != null ? `-${currentEx.exercise.reps_max}` : ''} reps`}
            {currentEx.exercise.weight != null && ` @ ${currentEx.exercise.weight}kg`}
          </p>

          <div className="mt-4">
            <SetLogger
              exerciseName={currentEx.exercise.name}
              targetSets={currentEx.exercise.sets ?? 1}
              targetWeight={currentEx.exercise.weight}
              targetRepsMin={currentEx.exercise.reps_min}
              targetRepsMax={currentEx.exercise.reps_max}
              completedSets={currentEx.completedSets}
              onLogSet={handleLogSet}
            />
          </div>
        </div>

        {/* Rest timer */}
        <AnimatePresence>
          {showingRest && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-4"
            >
              <RestTimer
                onSkip={handleRestComplete}
                onComplete={handleRestComplete}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Show next exercise if current is done */}
        {isCurrentExerciseDone && !showingRest && !isLastExercise && (
          <button
            onClick={() => setCurrentExerciseIdx((i) => i + 1)}
            className="mt-4 w-full rounded-xl bg-primary/10 py-3 text-center text-sm font-medium text-primary hover:bg-primary/15 transition-colors"
          >
            Next: {session.exercises[currentExerciseIdx + 1].exercise.name} →
          </button>
        )}
      </div>

      {/* Finish button */}
      <div className="shrink-0 px-4 pb-6 pt-2">
        <button
          onClick={handleFinish}
          disabled={saving}
          className="w-full rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Finish Training'}
        </button>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: clean for this file. Fix any import issues.

- [ ] **Step 3: Commit**

```bash
git add web/components/training/training-mode.tsx
git commit -m "feat: add full-screen training mode with per-set logging and rest timer"
```

---

### Task D5: Integrate training mode into dashboard

**Files:**
- Modify: `web/components/dashboard/today-plan-card.tsx`
- Modify: `web/components/dashboard/home-plan-section.tsx`
- Modify: `web/components/dashboard/dashboard-client.tsx`

**Interfaces:**
- Consumes: `TrainingMode` from `@/components/training/training-mode`
- Produces: "Start Training" button on plan card; training mode overlay in dashboard

- [ ] **Step 1: Add "Start Training" button to today-plan-card.tsx**

Add a new `onStartTraining?: () => void` prop to `TodayPlanCard`. In the workout day state (around lines 93-170), add a prominent button below the exercise list:

```tsx
{onStartTraining && (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onStartTraining() }}
    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
  >
    <Play size={16} />
    Start Training
  </button>
)}
```

Add `Play` to lucide-react imports. The `e.stopPropagation()` ensures tapping the button doesn't also trigger the `onExpand` (open detail sheet) action on the parent card.

- [ ] **Step 2: Wire training mode in home-plan-section.tsx**

Add state:
```tsx
const [trainingOpen, setTrainingOpen] = useState(false)
```

Pass `onStartTraining={() => setTrainingOpen(true)}` to `TodayPlanCard`.

Render `TrainingMode` when open:
```tsx
<AnimatePresence>
  {trainingOpen && todayWorkout && todayWorkout.todayDay && (
    <TrainingMode
      planId={todayWorkout.plan.id}
      day={todayWorkout.todayDay}
      onClose={() => setTrainingOpen(false)}
      onFinish={() => {
        setTrainingOpen(false)
        refreshPlan()
      }}
    />
  )}
</AnimatePresence>
```

Add imports for `TrainingMode` and `AnimatePresence` from framer-motion.

- [ ] **Step 3: Verify — typecheck**

```bash
cd web && npm run typecheck
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add web/components/dashboard/today-plan-card.tsx web/components/dashboard/home-plan-section.tsx
git commit -m "feat: integrate training mode into dashboard plan card"
```

---

## Verification (after all streams complete)

- [ ] **Full typecheck**: `cd web && npm run typecheck`
- [ ] **Full lint**: `cd web && npm run lint`
- [ ] **Build**: `cd web && npm run build`
- [ ] **Manual QA — Today page layout**: Check on phone viewport (375px) that all cards fit without scrolling
- [ ] **Manual QA — Training mode flow**: Tap "Start Training", log a set, verify rest timer, finish, verify dashboard updates
- [ ] **Manual QA — Quick log**: Verify two-line layout, food-only parsing, camera and manual buttons work
- [ ] **Manual QA — Water**: Verify no water references remain in dashboard UI or types

---

## Execution Order

```
Wave 1 (parallel):  A1, A2, C1, D1, D2, D3
Wave 2 (parallel):  A3, C2, D4
Wave 3 (sequential): B1 → B2 → B3  (depends on A3)
Wave 4 (parallel):  D5  (depends on D4)
Wave 5: Verification
```

If subagent-driven: dispatch A1+A2+C1+D1+D2+D3 as 6 parallel agents, wait, then A3+C2+D4, wait, then B1→B2→B3 sequentially, then D5, then verify.
