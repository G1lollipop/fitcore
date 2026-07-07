# Dashboard Redesign — Design Spec

**Date**: 2026-07-07
**Status**: Approved
**Scope**: Redesign the "Today" dashboard page based on real phone usage feedback

---

## Problem Summary

1. **No training mode** — Can't log sets during gym workouts. The training plan card is read-only, and there's no set-by-set tracking.
2. **Quick log is food-only in practice** — But the input bar has 4 icon buttons (Mic, PencilLine, Camera, Submit) crowding the text input, and the backend `quickLog` action parses both food and workout.
3. **Food card shows net math** — The calorie ring center displays "NET INTAKE" (intake − burn). User wants to see intake only. Burn and workout minutes stats are clutter.
4. **Water record is useless** — Already removed from the dashboard UI, but 11+ files still have dead code and infrastructure.
5. **Page layout needs rebalancing** — Top = food card (Protein, Carbs, Fat), Middle = training plan with "Start Training" button.

---

## Section 1: Food Card Redesign

### Current state
- Dual-ring SVG: intake outer ring, burn inner ring
- Center: "NET INTAKE" showing `kcalIntake - kcalBurn`
- 3 stat rows: intake kcal, burn kcal, workout minutes
- 3 macro cells at bottom: Protein, Carbs, Fat (icon + value/goal)

### Proposed design

```
┌──────────────────────────────────────┐
│                                      │
│           ┌─────────────┐            │
│           │   1,450     │            │  ← intake kcal (large)
│           │  / 2,000    │            │  ← goal
│           │    kcal     │            │
│           └─────────────┘            │
│    single arc ring (0 → goal)        │
│                                      │
│  Protein   ████████░░  85 / 140g     │  ← progress bars
│  Carbs     ██████████  160 / 250g    │
│  Fat       ██████░░░░  45 / 65g      │
│                                      │
│  ▸ 4 meals logged today              │  ← tap → meal detail sheet
└──────────────────────────────────────┘
```

### Changes
- **Remove** inner ring (burn)
- **Replace** center text: "NET INTAKE" → intake / goal (e.g. "1,450 / 2,000 kcal")
- **Remove** 3 stat rows (intake kcal, burn kcal, workout minutes)
- **Replace** macro cells with horizontal progress bars (value / goal with fill)
- **Keep** the ring as a single intake-progress arc, color shifting from green → orange → red as intake approaches/exceeds goal
- **Keep** the meals summary tap target to open meal detail sheet
- **No date toggle** — Today page shows today; date browsing lives in Record

### Files touched
- `web/components/dashboard/today-hero.tsx` — remove inner ring, burn stats, net math
- `web/components/dashboard/today-metrics.tsx` — macro cells → progress bars
- `web/components/dashboard/today-overview.tsx` — remove water props, simplify prop interface

---

## Section 2: Training Mode

### Current state
- `TodayPlanCard` is read-only — shows up to 4 planned exercises with target sets/reps
- Tapping opens `PlanDetailSheet` (a plan editor, not a workout logger)
- `workout_logs` table stores one row per session with a single `sets` count (no per-set detail)
- No "active session" concept, no training mode UI, no per-set tracking

### Proposed design

**TodayPlanCard changes**: Add a prominent "Start Training" button alongside the existing "View Week" tap target.

```
┌─ Training Plan ────────────────────────┐
│  🏋️ Upper Body · 5 exercises           │
│  Bench Press 4×8, Squat 4×10, ...      │
│                                         │
│  [▶ Start Training]    View Week →     │
└─────────────────────────────────────────┘
```

**Training mode** (full-screen, opens on "Start Training" tap):

```
┌──────────────────────────────────────────┐
│ ← Back     🏋️ Upper Body    00:32 elapsed │  ← header with timer
├──────────────────────────────────────────┤
│                                          │
│  Bench Press                             │
│  Target: 4 sets × 6-8 reps @ 80kg        │
│                                          │
│  ✓ Set 1  [80] kg × [8] reps  (12:01)   │  ← completed sets
│  ✓ Set 2  [80] kg × [7] reps  (12:04)   │
│  ● Set 3  [__] kg × [__] reps  [✓]      │  ← current set
│                                          │
│  ⏱ Rest: 1:22    [Skip]                 │  ← auto rest timer
│                                          │
├──────────────────────────────────────────┤
│  ── Next: Squat                          │  ← upcoming exercise
│  ── Deadlift                             │
│                                          │
│  [Finish Training]                       │  ← saves all sets
└──────────────────────────────────────────┘
```

### Flow
1. Tap "Start Training" → full-screen mode opens, exercise list from `calculateTodayWorkout()`
2. First exercise expanded, target weight pre-filled from plan
3. Enter actual weight + reps per set, tap ✓ to complete the set
4. Auto rest timer starts (configurable: 60s/90s/120s, skippable)
5. After all sets for an exercise → auto-advance to next
6. "Finish Training" → batch-save all sets + summary workout_log row → invalidate dashboard cache

### Data model (new)

**`workout_set_logs` table**:
```sql
id: string (PK, uuid)
workout_log_id: string (FK → workout_logs.id)
exercise_name: string
set_number: integer
weight_kg: number | null
reps: integer | null
logged_at: timestamptz
```

Training session state lives client-side (React state/context) until "Finish Training". On completion: batch-insert set logs, insert summary `workout_logs` row, invalidate dashboard cache.

### Reused from existing code
- `calculateTodayWorkout()` → exercise list with targets
- `createWorkoutLog()` / `batchLogWorkouts()` → save summary
- `useDashboardActions().applyWorkoutLog()` → instant dashboard update
- `PlanExercise` / `TodayWorkoutExercise` types

### New files
- `web/components/training/training-mode.tsx` — full-screen training session component
- `web/components/training/set-logger.tsx` — per-set weight×reps input row
- `web/components/training/rest-timer.tsx` — auto rest countdown
- `web/lib/training/session-state.ts` — client-side session state management
- `web/app/actions/training.ts` — server actions: `startTrainingSession`, `logCompletedSet`, `finishTrainingSession`

### Files modified
- `web/components/dashboard/today-plan-card.tsx` — add "Start Training" button
- `web/components/dashboard/home-plan-section.tsx` — wire training mode open/close
- `web/components/dashboard/dashboard-client.tsx` — add training mode overlay

---

## Section 3: Quick Log Redesign

### Current state
- Single row: text input + 4 icon buttons (Mic, PencilLine, Camera, Submit) at 28×28px each
- `quickLog` server action parses both food and workout from natural language
- Camera opens meal photo, PencilLine opens manual food dialog

### Proposed design

Two-line layout that collapses to one line on very narrow screens:

```
┌──────────────────────────────────────┐
│  What did you eat?................[→] │  ← line 1: input + send, full width
│  📷 Photo    ✏️ Manual                │  ← line 2: camera + manual form
└──────────────────────────────────────┘
```

- **Line 1**: Full-width text input + send button — the fast path
- **Line 2**: Two compact labeled icon buttons — alternatives, not competing for space
- **Removed**: Mic (voice) button
- **Changed**: `quickLog` action → food-only parsing (remove workout branch)

### Files modified
- `web/components/dashboard/home-log-bar.tsx` — restructure to two-line layout, remove Mic, simplify buttons
- `web/app/actions/quickLog.ts` — remove workout parsing branch, food-only prompt

---

## Section 4: Water Removal

### Current state
Water is already removed from the dashboard UI (`today-metrics.tsx:16-18` confirms), but all support infrastructure remains: server actions, types, cache patches, agent tools, utility file.

### Cleanup list (11 files)

| File | Change |
|------|--------|
| `web/components/dashboard/dashboard-client.tsx` | Remove `waterMl`/`waterGoalMl`/`onWaterLogged` props from TodayOverview |
| `web/components/dashboard/today-overview.tsx` | Remove stale water props from interface |
| `web/components/dashboard/today-metrics.tsx` | Remove stale water props from interface |
| `web/components/dashboard/nutrition-targets-dialog.tsx` | Remove water goal field from targets editor |
| `web/app/actions/dashboard.ts` | Remove `logWater()` action, remove water from `getUserGoals()` defaults and `getDashboardData()` return |
| `web/app/actions/types.ts` | Remove `water_goal` from `UserGoals`, `water_intake` from `TodayStats` |
| `web/lib/queries/dashboard.ts` | Remove `setWater()` cache patch |
| `web/lib/metrics/water.ts` | **Delete entire file** |
| `web/lib/ai/user-context.ts` | Remove `water_intake` from user context builder |
| `web/lib/ai/agent.ts` | Remove `log_water` from `LOG_TOOLS` set |
| `web/lib/stats/recompute-daily-stats.ts` | Remove `water_intake` reset to 0 |

---

## Section 5: Final Today Page Layout

```
┌─ Food Card ─────────────────────────────┐  shrink-0
│   Calorie Ring (single arc, intake→goal) │
│   Macro Progress Bars (P/C/F)            │
│   ▸ 4 meals · 1,450 kcal   →   (sheet)  │  ← tap opens bottom sheet
├─ Training Plan Card ────────────────────┤  shrink-0
│   🏋️ Today's workout summary             │
│   [▶ Start Training]    View Week →     │  ← new CTA button
├─────────────────────────────────────────┤  desktop only
│   Weekly Activity (hidden md:block)      │
├─────────────────────────────────────────┤  mt-auto (thumb zone)
│   Quick Log (food only)                  │  ← always visible
│   [📷 Photo]  [✏️ Manual]                │  ← secondary row
│   AI Coach Bar                           │  ← always visible
└─────────────────────────────────────────┘
    ↑ bottom tab bar (fixed)
```

Everything fits one phone viewport. No scrolling required. Quick Log and AI Coach always above the fold.

---

## Component Changes Summary

| Action | File | Change |
|--------|------|--------|
| MODIFY | `today-hero.tsx` | Single intake ring, remove net math and burn stats |
| MODIFY | `today-metrics.tsx` | Macro cells → progress bars, remove water props |
| MODIFY | `today-overview.tsx` | Remove water props, simplify interface |
| MODIFY | `today-plan-card.tsx` | Add "Start Training" CTA button |
| MODIFY | `home-plan-section.tsx` | Wire training mode open/close |
| MODIFY | `dashboard-client.tsx` | Add training mode overlay, remove water props |
| MODIFY | `home-log-bar.tsx` | Two-line layout, food-only, remove Mic |
| MODIFY | `app/actions/quickLog.ts` | Food-only parsing |
| MODIFY | `nutrition-targets-dialog.tsx` | Remove water goal field |
| MODIFY | `app/actions/dashboard.ts` | Remove `logWater()`, water from queries |
| MODIFY | `app/actions/types.ts` | Remove water types |
| MODIFY | `lib/queries/dashboard.ts` | Remove `setWater()` |
| DELETE | `lib/metrics/water.ts` | Entire file |
| MODIFY | `lib/ai/user-context.ts` | Remove water from context |
| MODIFY | `lib/ai/agent.ts` | Remove `log_water` from tools |
| MODIFY | `lib/stats/recompute-daily-stats.ts` | Remove water reset |
| **NEW** | `components/training/training-mode.tsx` | Full-screen training session |
| **NEW** | `components/training/set-logger.tsx` | Per-set weight×reps input |
| **NEW** | `components/training/rest-timer.tsx` | Auto rest countdown |
| **NEW** | `lib/training/session-state.ts` | Client-side session state |
| **NEW** | `app/actions/training.ts` | Training session server actions |

## Non-Goals

- No changes to Record page or History tab
- No changes to AI coach or chat
- No changes to desktop layout (md+ breakpoints)
- No changes to authentication or routing
- No new npm dependencies
- No changes to RAG backend
- No changes to plan editing (PlanDetailSheet remains as-is)
