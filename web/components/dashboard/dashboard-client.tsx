'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { AppShell } from '@/components/layout/app-shell'
import { TodayOverview } from '@/components/dashboard/today-overview'
import { HomePlanSection } from '@/components/dashboard/home-plan-section'
import { WeeklyActivity } from '@/components/dashboard/weekly-activity'
import { CoachAskBar } from '@/components/dashboard/coach-ask-bar'
import { HomeLogBar } from '@/components/dashboard/home-log-bar'
import { TabActiveProvider } from '@/components/dashboard/tab-active-context'
import { HistoryCenter } from '@/components/history/history-center'
import { useDashboardData, useDashboardActions } from '@/lib/queries/dashboard'
import { useHistoryActions } from '@/lib/queries/history'
import { usePrefetchUserSettings } from '@/lib/queries/settings'
import { getTodayDate } from '@/lib/utils/date'
import type { DashboardData } from '@/app/actions/types'
import { useT } from '@/lib/i18n/provider'

/**
 * AI chat is opened on demand — defer its bundle until after first paint.
 * `ssr: false` is safe here because the widget itself only renders inside
 * the launcher button until the user clicks it.
 */
const AIChatWidget = dynamic(
  () => import('@/components/ai-chat/ai-chat-widget').then((m) => m.AIChatWidget),
  { ssr: false }
)

/**
 * Meal-photo FAB — opens a dialog that captures/uploads a meal photo, runs
 * Gemini vision to estimate macros, and saves to today's diet log after the
 * user confirms. Lazy because the dialog + image-compress code is only
 * needed when the user clicks the FAB.
 */
const MealPhotoUpload = dynamic(
  () => import('@/components/log-form/meal-photo-upload').then((m) => m.MealPhotoUpload),
  { ssr: false }
)

interface DashboardClientProps {
  userId: string
  userName: string
  /** Server-fetched dashboard payload; seeds first paint without a round-trip. */
  initialDashboardData: DashboardData | null
}

/**
 * Interactive client shell for the home experience.
 *
 * Data fetching and auth happen in the server component (`app/page.tsx`); this
 * component owns only client-side concerns: nav switching and refetching
 * dashboard data after a successful log.
 */
export function DashboardClient({
  userId,
  userName,
  initialDashboardData,
}: DashboardClientProps) {
  const t = useT()
  const [activeNav, setActiveNav] = useState('dashboard')
  // Dashboard payload now lives in the React Query cache (seeded with the
  // server-fetched data). Logging surfaces patch this cache optimistically,
  // so the rings/totals update instantly without a blocking full refetch.
  const { data: dashboardData } = useDashboardData(initialDashboardData)
  const { invalidate } = useDashboardActions()
  const { invalidateDate } = useHistoryActions()

  // Warm the shared user-settings cache right after the home mounts so the
  // Settings sheet and Edit-targets dialog open instantly (both read the same
  // `getUserSettings()` row). Non-blocking: doesn't affect first paint.
  const prefetchUserSettings = usePrefetchUserSettings()
  useEffect(() => {
    prefetchUserSettings()
  }, [prefetchUserSettings])

  const displayName = userName || t.greeting.defaultUserName

  // Generic "something changed" hook: kick a non-blocking background refetch
  // to reconcile the cache. Surfaces that already know the delta (quick-log,
  // water) patch the cache directly and this just confirms against the server.
  //
  // Also reconciles today's History caches (`['nutrition'|'workouts', today]`),
  // so an entry logged from the home Quick Log / meal photo shows up the moment
  // the user opens History instead of staying stale until a manual refresh.
  const handleLogSuccess = useCallback(() => {
    invalidate()
    invalidateDate(getTodayDate())
  }, [invalidate, invalidateDate])

  return (
    <AppShell
      activeNav={activeNav}
      onNavChange={setActiveNav}
      userName={displayName}
      userId={userId}
      onQuickLogged={handleLogSuccess}
      onProfileSaved={handleLogSuccess}
      overlay={
        <>
          <AIChatWidget userId={userId} />
          <MealPhotoUpload userId={userId} onSuccess={handleLogSuccess} />
        </>
      }
    >
      <TabPanel
        active={activeNav === 'dashboard'}
        className="flex min-h-[calc(100dvh_-_12rem)] flex-col gap-2 md:min-h-0 md:gap-4"
      >
        {/* Status first: combined today overview (calorie ring + macros/water). */}
        <TodayOverview
          userId={userId}
          kcalIntake={dashboardData?.today.total_calories}
          kcalBurn={dashboardData?.today.calories_burned}
          kcalGoal={dashboardData?.goals.target_calories}
          workoutMinutes={dashboardData?.today.workout_duration}
          protein={dashboardData?.today.total_protein}
          proteinGoal={dashboardData?.goals.target_protein}
          carbs={dashboardData?.today.total_carbs}
          carbsGoal={dashboardData?.goals.target_carbs}
          fat={dashboardData?.today.total_fat}
          fatGoal={dashboardData?.goals.target_fat}
          waterMl={dashboardData?.today.water_intake}
          waterGoalMl={dashboardData?.goals.water_goal}
          onWaterLogged={handleLogSuccess}
          onTargetsSaved={handleLogSuccess}
          className="shrink-0"
        />

        {/* The single active plan lives on home now (the Plans tab was retired):
            today's slice by default, tap to expand the full week, or a compact
            create surface when there's no active plan yet. */}
        <HomePlanSection
          info={dashboardData?.todayWorkout ?? null}
          userId={userId}
          onLogged={handleLogSuccess}
          className="shrink-0"
        />

        {/* Secondary trend — desktop only so the mobile home stays single-screen. */}
        <WeeklyActivity data={dashboardData?.weeklyTrend} className="hidden md:block" />

        {/* Thumb zone: high-frequency logging first, then the secondary coach. */}
        <div className="mt-auto flex shrink-0 flex-col gap-2 md:mt-0 md:gap-3">
          <HomeLogBar userId={userId} onLogged={handleLogSuccess} />
          <CoachAskBar />
        </div>
      </TabPanel>

      <TabPanel active={activeNav === 'nutrition'} prefetch>
        <HistoryCenter userId={userId} onLogSuccess={handleLogSuccess} />
      </TabPanel>
    </AppShell>
  )
}

/**
 * Keep-alive tab wrapper.
 *
 * Mounts a tab's subtree the first time it becomes active, then keeps it in
 * the DOM (toggling the `hidden` attribute) instead of unmounting it. This is
 * what makes re-visiting a tab instant: no remount, no `useEffect` refetch, no
 * skeleton flash, and per-tab state (selected date/month, scroll, etc.) is
 * preserved across nav switches.
 *
 * Inactive panels render `hidden` → `display:none`, so they're out of the
 * layout and the accessibility tree. Tailwind's `space-y-*` selectors use
 * `:not([hidden])`, so a hidden sibling never injects stray margins.
 */
function TabPanel({
  active,
  prefetch = false,
  className,
  children,
}: {
  active: boolean
  /**
   * Mount this panel eagerly (hidden) at startup instead of waiting for the
   * first activation, so its data-loading effects run in the background right
   * after login and the tab is instant to open. Used for nutrition/training.
   */
  prefetch?: boolean
  className?: string
  children: ReactNode
}) {
  // Latches to true on first activation (or immediately when prefetch is set)
  // and stays mounted thereafter, so re-visiting a tab is instant (no remount /
  // refetch / skeleton flash). Uses React's "adjust state during render" pattern
  // instead of an effect.
  const [everActive, setEverActive] = useState(active || prefetch)
  if (active && !everActive) setEverActive(true)

  if (!everActive) return null

  return (
    <div hidden={!active} className={active ? className : undefined}>
      {/* Lets infinite-animation children freeze while the tab is hidden. */}
      <TabActiveProvider value={active}>{children}</TabActiveProvider>
    </div>
  )
}
