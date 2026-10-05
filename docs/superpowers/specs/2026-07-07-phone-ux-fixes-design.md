# Phone UX Fixes — Design Spec

**Date**: 2026-07-07
**Status**: Approved
**Scope**: Three UX issues found during real phone usage

---

## Problem Summary

1. **AI Coach transparent bottom** — `glass-strong` (82% opaque) lets text/aurora bleed through the bottom of the chat panel. Avatar is a generic `Bot` icon, not visually appealing.
2. **Record page too empty** — Only 7 number boxes visible without tapping. No item previews, no weekly context, no streaks.
3. **Today's meals pushes content off-screen** — Inline expansion (`max-h-[44vh]`) forces user to scroll past the Quick Log and AI Coach bar.

**North Star**: Every main page must fit entirely inside one phone viewport without vertical scrolling. Quick Log and AI Coach must always be accessible above the fold.

---

## Section 1: AI Coach Fixes

### 1a. Solidify Chat Panel Bottom

**Root cause**: `MobileSheet` uses `glass-strong` (light: `oklch(1 0 0 / 0.82)`, dark: `oklch(0.23 0.02 195 / 0.8)`). The `ChatInput` suggestion chips row and input container have **no background color** — they rely entirely on the parent's semi-transparent glass background.

**Fix**:
1. In `chat-window.tsx`, add `bg-background` to the inner flex-1 scroll container (line 121) so the entire content area is opaque
2. In `chat-input.tsx`, add `bg-card` or `bg-background` to the suggestion chips row (line 30) and the input container (line 44)
3. Alternatively, bump `--glass-bg-strong` opacity in `globals.css` to 96%+ (`oklch(1 0 0 / 0.96)` light, `oklch(0.23 0.02 195 / 0.95)` dark)

**Files**: `web/components/ai-chat/chat-window.tsx`, `web/components/ai-chat/chat-input.tsx`, optionally `web/app/globals.css`

**Constraint**: Keep the glass aesthetic on the outer panel border — only the content area becomes opaque.

### 1b. Mascot Coach Avatar

**Root cause**: The "avatar" is a generic `Bot` icon from `lucide-react` inside a gradient circle, used identically in 4 places. No visual personality.

**Fix**: Create a new `CoachAvatar` component — a simple SVG mascot illustration (friendly fitness coach character). The illustration should be:
- Recognizable at small sizes (24–36px)
- Simple flat/minimalist vector style (consistent with the app's clean aesthetic)
- Work in both light and dark modes
- Have a circular/rounded container with the existing gradient background (`bg-gradient-to-br from-primary/25 to-accent/20`)
- **Style reference**: Think Apple Fitness+ coach avatars — clean, warm, geometric-minimal. A circular head with simple facial features (eyes, smile), maybe a headband or sweatband for character. Two-tone flat colors (use `currentColor` with `text-primary` for the primary tone, a secondary muted tone). No gradients within the SVG itself — let the container gradient provide depth.

**Replace in 4 locations**:
1. `chat-header.tsx:50-58` — chat panel header (36px)
2. `chat-message.tsx:26-28` — each assistant message bubble (28px)
3. `chat-body.tsx:60-62` — waiting/typing indicator (28px)
4. `coach-ask-bar.tsx:45-47` — home page entry bar (28px)

**New file**: `web/components/ai-chat/coach-avatar.tsx`

**Existing files to modify**: `chat-header.tsx`, `chat-message.tsx`, `chat-body.tsx`, `coach-ask-bar.tsx`

---

## Section 2: Record Page Redesign

### 2a. Weekly Summary Bar (New)

A compact stats row at the top showing week-at-a-glance metrics:

```
glass card, rounded-2xl, p-2
├── This week · 12,500 kcal · 8 workouts · 280 min
├── 🔥 5-day logging streak
```

**Data sources**: 7-day nutrition + workout aggregates from existing `getNutritionRange` + `getWorkoutHistory` queries. Streak from consecutive-day count of non-empty log days.

**New file**: `web/components/history/weekly-summary-bar.tsx`

**Layout**: Sits above the date selector in `HistoryCenter`.

**7-day trend charts**: The existing trend charts (calories bar chart, macro stacked bar, workout dual-axis bar) are preserved. A small "Trends ▶" link in the weekly summary bar opens them in a bottom sheet (reusing the chart rendering code from the current `DietDaySection` and `WorkoutDaySection` sheet content — extracted into a shared `TrendCharts` component).

### 2b. Combined Day Timeline Card (Replaces DietDaySection + WorkoutDaySection)

Replace the two separate expandable cards with a single scrollable timeline showing the day's actual items inline.

**Structure**:
```
glass card, rounded-2xl, internally scrollable
├── Breakfast
│   ├── Eggs · 220 kcal · P12/C2/F18    ✎ 🗑
│   └── Banana · 105 kcal · P1/C27/F0   ✎ 🗑
├── Lunch
│   ├── Chicken salad · 450 kcal        ✎ 🗑
│   └── Apple juice · 100 kcal          ✎ 🗑
├── 🏋️ Upper body · 45 min · 320 kcal   ✎ 🗑
├── + Add (quick-add inline toggle)
```

**Key behaviors**:
- Internally scrollable: max-height fills remaining viewport after fixed elements (`max-h-[calc(100dvh-18rem)]` — accounts for weekly bar ~44px + date pill ~32px + tab bar ~64px + page chrome ~128px). Exact value tuned during implementation with real viewport testing.
- Food items grouped by meal slot (breakfast/lunch/snack/dinner/lateNight), sorted by `logged_at`
- Workout items interleaved with food items by time of day (both sorted by `logged_at` together)
- Per-item edit/delete via inline icon buttons (reuse `DietLogEditDialog` for food, `WorkoutLogEditDialog` for workouts)
- "Add" button at bottom toggles an inline compact input row: two tabs (meal / workout), reusing the existing `HomeLogBar` AI parsing for meals and the workout quick-add pattern from `WorkoutDaySection` for workouts
- Empty state: friendly prompt with icon + "No meals or workouts logged today — tap [+] to start"

**Data sources**: Same `getNutritionRange` + `getWorkoutHistory` queries. Interleave diet logs and workout logs sorted by `logged_at`.

**New file**: `web/components/history/day-timeline.tsx`

### 2c. Layout Stack (Record Page)

```
┌─ Weekly Summary Bar ─────────────────────┐  ~44px, shrink-0
├─ Date Selector Pill ─────────────────────┤  ~32px, shrink-0
├─ Day Timeline Card ──────────────────────┤  flex-1, internally scrollable
│   (meals + workouts, scrollable)          │
└───────────────────────────────────────────┘
    ↑ bottom tab bar (fixed)
```

**Files changed**:
- `web/components/history/history-center.tsx` — restructured layout
- `web/components/history/diet-day-section.tsx` — removed/repurposed
- `web/components/history/workout-day-section.tsx` — removed/repurposed

**What stays**:
- Same data sources and React Query caching
- Same date navigation
- Same quick-add inputs (moved inline)
- Edit/delete dialogs reused (`DietLogEditDialog`, `WorkoutLogEditDialog`)

---

## Section 3: Today's Meals → Bottom Sheet

### Problem

When "Today's meals" expands inline via `AnimatePresence`, `TodayDietDetails` takes up to `44vh`, pushing the `mt-auto` section (Quick Log + Coach) below the fold. User must scroll.

### Fix

Replace the inline expand/collapse with a compact summary that opens a bottom sheet — matching the established pattern used by `PlanDetailSheet`.

**Collapsed state** (in `TodayOverview`):
```
🍽️  Today's meals    3 items · 1,250 kcal  →
```
A tappable summary row showing meal count + total calories for today. No inline expansion.

**Expanded state** (bottom sheet, `85dvh`):
Reuses `MealTimeline` inside a `Sheet` component, identical to how `DietDaySection` displays meals on the Record page. Full edit/delete capabilities inside the sheet.

**Files changed**:
- `web/components/dashboard/today-overview.tsx` — remove `AnimatePresence` expand, replace toggle button with summary + sheet trigger
- `web/components/dashboard/today-diet-details.tsx` — repurposed as sheet content, or keep as-is since it already handles the meal timeline

**What stays**:
- Same `MealTimeline` component (no changes)
- Same data loading (`getNutritionByDate`)
- Same calorie ring + macro display at top of overview card
- Edit/delete dialogs unchanged

---

## Result: Final Today Page Layout

```
┌─ TodayOverview ──────────────────────────┐  shrink-0
│   Calorie Ring + Stats                    │
│   Macros (P/C/F)                          │
│   🍽️ 3 meals · 1,250 kcal  →   (sheet)   │  ← tap opens bottom sheet
├─ TodayPlanCard ──────────────────────────┤  shrink-0
│   🏋️ Upper Body · 5 exercises  → (sheet)  │
├──────────────────────────────────────────┤  mt-auto
│   Quick Log Bar                           │  ← always visible
│   AI Coach Bar                            │  ← always visible
└──────────────────────────────────────────┘
    ↑ bottom tab bar (fixed)
```

Everything fits one viewport. No scrolling. Quick Log + Coach always accessible.

---

## Component Changes Summary

| Action | File | Change |
|--------|------|--------|
| **NEW** | `components/ai-chat/coach-avatar.tsx` | Mascot SVG avatar component |
| MODIFY | `components/ai-chat/chat-header.tsx` | Use `CoachAvatar` instead of `Bot` icon |
| MODIFY | `components/ai-chat/chat-message.tsx` | Use `CoachAvatar` in assistant bubbles |
| MODIFY | `components/ai-chat/chat-body.tsx` | Use `CoachAvatar` in waiting indicator |
| MODIFY | `components/dashboard/coach-ask-bar.tsx` | Use `CoachAvatar` in home entry bar |
| MODIFY | `components/ai-chat/chat-window.tsx` | Add opaque bg to inner scroll container |
| MODIFY | `components/ai-chat/chat-input.tsx` | Add bg to chips row + input container |
| **NEW** | `components/history/weekly-summary-bar.tsx` | Weekly stats + streak + trend chart trigger |
| **NEW** | `components/history/day-timeline.tsx` | Combined diet + workout inline timeline |
| **NEW** | `components/history/trend-charts.tsx` | Extracted 7-day trend charts (from diet/workout sections) |
| MODIFY | `components/history/history-center.tsx` | New layout: summary bar + timeline; imports restructured |
| MODIFY | `components/history/diet-day-section.tsx` | Remove item timeline + sheet logic; chart code extracted to trend-charts |
| MODIFY | `components/history/workout-day-section.tsx` | Remove item list + sheet logic; chart code extracted to trend-charts |
| MODIFY | `components/dashboard/today-overview.tsx` | Replace inline expand with sheet trigger + summary line |

## Non-Goals

- No changes to data layer, server actions, or API
- No changes to authentication or routing
- No changes to desktop layout (md+ breakpoints)
- No new dependencies
- No changes to RAG backend
