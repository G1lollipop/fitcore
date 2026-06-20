'use client'

import { useCallback, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { AppShell } from '@/components/layout/app-shell'
import { findNavItem } from '@/components/layout/nav-items'
import { DailyLogForm } from '@/components/log-form/daily-log-form'
import { AdvancedLogDisclosure } from '@/components/log-form/advanced-log-disclosure'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { WeeklyActivity } from '@/components/dashboard/weekly-activity'
import { MyPlans } from '@/components/plans/my-plans'
import { NutritionCenter } from '@/components/nutrition/nutrition-center'
import { TrainingHistory } from '@/components/training/training-history'
import { getDashboardData } from '@/app/actions/dashboard'
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
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    initialDashboardData
  )
  const [, startTransition] = useTransition()

  // Greeting is computed once per render; that's fine — it's pure and cheap.
  const greeting = getGreeting(t)

  // Page title is derived from the shared NAV_ITEMS source via the active
  // dictionary, eliminating the duplicate Record map that lived here.
  const pageTitle = useMemo(() => {
    const item = findNavItem(activeNav)
    return item ? t.nav[item.labelKey] : ''
  }, [activeNav, t])

  const displayName = userName || t.greeting.defaultUserName

  const refreshDashboardData = useCallback(() => {
    startTransition(async () => {
      try {
        const data = await getDashboardData()
        setDashboardData(data)
      } catch (error) {
        console.error('Failed to refresh dashboard data:', error)
      }
    })
  }, [])

  const handleLogSuccess = useCallback(() => {
    refreshDashboardData()
  }, [refreshDashboardData])

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

      <TabPanel active={activeNav === 'knowledge'}>
        <KnowledgeBase />
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
  // Latches to true on first activation and stays mounted thereafter.
  const everActive = useRef(active)
  if (active) everActive.current = true
  if (!everActive.current) return null

  return (
    <div hidden={!active} className={active ? className : undefined}>
      {children}
    </div>
  )
}

/** Tiny placeholder — replaced by a real KB view in a later phase step. */
function KnowledgeBase() {
  const t = useT()
  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
      <h2 className="font-display text-base font-semibold text-foreground mb-2">
        {t.knowledge.title}
      </h2>
      <p className="text-sm text-muted-foreground">{t.knowledge.comingSoon}</p>
    </div>
  )
}
