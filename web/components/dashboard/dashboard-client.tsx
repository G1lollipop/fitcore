'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { AppShell } from '@/components/layout/app-shell'
import { findNavItem } from '@/components/layout/nav-items'
import { DailyLogForm } from '@/components/log-form/daily-log-form'
import { AdvancedLogDisclosure } from '@/components/log-form/advanced-log-disclosure'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { WeeklyActivity } from '@/components/dashboard/weekly-activity'
import { CoachHomeCard } from '@/components/dashboard/coach-home-card'
import { TabActiveProvider } from '@/components/dashboard/tab-active-context'
import { MyPlans } from '@/components/plans/my-plans'
import { NutritionCenter } from '@/components/nutrition/nutrition-center'
import { TrainingHistory } from '@/components/training/training-history'
import { useDashboardData, useDashboardActions } from '@/lib/queries/dashboard'
import type { DashboardData } from '@/app/actions/types'
import { useT } from '@/lib/i18n/provider'
import type { Dictionary } from '@/lib/i18n'

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

function getGreeting(t: Dictionary): string {
  const hour = new Date().getHours()
  if (hour < 6) return t.greeting.lateNight
  if (hour < 12) return t.greeting.morning
  if (hour < 14) return t.greeting.noon
  if (hour < 18) return t.greeting.afternoon
  if (hour < 22) return t.greeting.evening
  return t.greeting.lateNight
}

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
 * component owns only client-side concerns: nav switching, the greeting (local
 * clock), and refetching dashboard data after a successful log.
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

  // Greeting is computed once per render; that's fine — it's pure and cheap.
  const greeting = getGreeting(t)

  // Page title is derived from the shared NAV_ITEMS source via the active
  // dictionary, eliminating the duplicate Record map that lived here.
  const pageTitle = useMemo(() => {
    const item = findNavItem(activeNav)
    return item ? t.nav[item.labelKey] : ''
  }, [activeNav, t])

  const displayName = userName || t.greeting.defaultUserName

  // Generic "something changed" hook: kick a non-blocking background refetch
  // to reconcile the cache. Surfaces that already know the delta (quick-log,
  // water) patch the cache directly and this just confirms against the server.
  const handleLogSuccess = useCallback(() => {
    invalidate()
  }, [invalidate])

  return (
    <AppShell
      activeNav={activeNav}
      onNavChange={setActiveNav}
      pageTitle={pageTitle}
      greeting={greeting}
      userName={displayName}
      userId={userId}
      onQuickLogged={handleLogSuccess}
      overlay={
        <>
          <AIChatWidget userId={userId} />
          <MealPhotoUpload userId={userId} onSuccess={handleLogSuccess} />
        </>
      }
    >
      <TabPanel active={activeNav === 'dashboard'} className="space-y-6">
        <CoachHomeCard />

        <StatsCards
          userId={userId}
          kcalIntake={dashboardData?.today.total_calories}
          kcalBurn={dashboardData?.today.calories_burned}
          kcalGoal={dashboardData?.goals.target_calories}
          workoutMinutes={dashboardData?.today.workout_duration}
          waterIntake={dashboardData?.today.water_intake}
          waterGoal={dashboardData?.goals.water_goal}
          onWaterLogged={handleLogSuccess}
        />

        <AdvancedLogDisclosure>
          <DailyLogForm
            userId={userId}
            onLogSuccess={handleLogSuccess}
            initialDietLogs={dashboardData?.today.diet_logs ?? []}
            initialWorkoutLogs={dashboardData?.today.workout_logs ?? []}
            yesterdayWorkout={dashboardData?.yesterdayWorkout}
            todayWorkout={dashboardData?.todayWorkout}
            compact
          />
        </AdvancedLogDisclosure>

        <WeeklyActivity data={dashboardData?.weeklyTrend} />
      </TabPanel>

      <TabPanel active={activeNav === 'nutrition'}>
        <NutritionCenter userId={userId} onLogSuccess={handleLogSuccess} />
      </TabPanel>

      <TabPanel active={activeNav === 'training'}>
        <TrainingHistory userId={userId} onLogSuccess={handleLogSuccess} />
      </TabPanel>

      <TabPanel active={activeNav === 'plans'}>
        <MyPlans userId={userId} />
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
  className,
  children,
}: {
  active: boolean
  className?: string
  children: ReactNode
}) {
  // Latches to true on first activation and stays mounted thereafter, so
  // re-visiting a tab is instant (no remount / refetch / skeleton flash).
  const [everActive, setEverActive] = useState(active)
  useEffect(() => {
    if (active && !everActive) setEverActive(true)
  }, [active, everActive])

  if (!everActive) return null

  return (
    <div hidden={!active} className={active ? className : undefined}>
      {/* Lets infinite-animation children freeze while the tab is hidden. */}
      <TabActiveProvider value={active}>{children}</TabActiveProvider>
    </div>
  )
}
