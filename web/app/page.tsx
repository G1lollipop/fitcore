'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useAuth, useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { findNavItem } from '@/components/layout/nav-items'
import { DailyLogForm } from '@/components/log-form/daily-log-form'
import { AdvancedLogDisclosure } from '@/components/log-form/advanced-log-disclosure'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { WeeklyActivity } from '@/components/dashboard/weekly-activity'
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton'
import { MyPlans } from '@/components/plans/my-plans'
import { NutritionCenter } from '@/components/nutrition/nutrition-center'
import { TrainingHistory } from '@/components/training/training-history'
import { getDashboardData } from '@/app/actions/dashboardActions'
import type { DashboardData } from '@/app/actions/types'

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

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  if (hour < 22) return '晚上好'
  return '夜深了'
}

export default function DashboardPage() {
  const { userId, isLoaded } = useAuth()
  const { user } = useUser()
  const router = useRouter()
  const [activeNav, setActiveNav] = useState('dashboard')
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [isPageLoading, setIsPageLoading] = useState(true)

  const currentUserId = userId ?? undefined
  const userName = user?.firstName || user?.fullName || '用户'

  // Greeting is computed once per render; that's fine — it's pure and cheap.
  const greeting = getGreeting()

  // Page title is derived from the shared NAV_ITEMS source, eliminating the
  // duplicate Record map that previously lived here.
  const pageTitle = useMemo(() => findNavItem(activeNav)?.label ?? '', [activeNav])

  const fetchDashboardData = useCallback(async () => {
    if (!currentUserId) return
    try {
      const data = await getDashboardData(currentUserId)
      setDashboardData(data)
    } catch (error) {
      console.error('获取仪表盘数据失败:', error)
    } finally {
      setIsPageLoading(false)
    }
  }, [currentUserId])

  useEffect(() => {
    if (isLoaded && !userId) {
      router.push('/sign-in')
    }
  }, [isLoaded, userId, router])

  useEffect(() => {
    if (isLoaded && !dashboardData) {
      fetchDashboardData()
    } else if (isLoaded) {
      setIsPageLoading(false)
    }
  }, [isLoaded, fetchDashboardData, dashboardData])

  const handleLogSuccess = useCallback(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  return (
    <AppShell
      activeNav={activeNav}
      onNavChange={setActiveNav}
      pageTitle={pageTitle}
      greeting={greeting}
      userName={userName}
      userId={currentUserId}
      onQuickLogged={handleLogSuccess}
      overlay={
        currentUserId ? (
          <>
            <AIChatWidget userId={currentUserId} />
            <MealPhotoUpload userId={currentUserId} onSuccess={handleLogSuccess} />
          </>
        ) : undefined
      }
    >
      {activeNav === 'dashboard' && (
        <>
          {isPageLoading ? (
            <DashboardSkeleton />
          ) : (
            <>
              <StatsCards
                userId={currentUserId}
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
                  userId={currentUserId}
                  onLogSuccess={handleLogSuccess}
                  initialDietLogs={dashboardData?.today.diet_logs ?? []}
                  initialWorkoutLogs={dashboardData?.today.workout_logs ?? []}
                  yesterdayWorkout={dashboardData?.yesterdayWorkout}
                  todayWorkout={dashboardData?.todayWorkout}
                  compact
                />
              </AdvancedLogDisclosure>

              <WeeklyActivity data={dashboardData?.weeklyTrend} />
            </>
          )}
        </>
      )}

      {activeNav === 'nutrition' && (
        <NutritionCenter userId={currentUserId} onLogSuccess={handleLogSuccess} />
      )}

      {activeNav === 'training' && (
        <TrainingHistory userId={currentUserId} onLogSuccess={handleLogSuccess} />
      )}

      {activeNav === 'plans' && <MyPlans />}

      {activeNav === 'knowledge' && <KnowledgeBase />}
    </AppShell>
  )
}

/** Tiny placeholder — replaced by a real KB view in a later phase step. */
function KnowledgeBase() {
  return (
    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
      <h2 className="font-display text-base font-semibold text-foreground mb-2">知识库</h2>
      <p className="text-sm text-muted-foreground">功能开发中，敬请期待。</p>
    </div>
  )
}
