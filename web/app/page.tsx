import { redirect } from 'next/navigation'
import { auth, currentUser } from '@clerk/nextjs/server'
import { DashboardClient } from '@/components/dashboard/dashboard-client'
import { getDashboardData } from '@/app/actions/dashboard'

/**
 * Home is a server component: it resolves auth and fetches the dashboard
 * payload on the server so the first paint already has data (no client
 * round-trip / skeleton flash). All interactivity (nav switching, refetch,
 * widgets) lives in the `DashboardClient` child.
 */
export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) {
    redirect('/sign-in')
  }

  const [dashboardData, user] = await Promise.all([getDashboardData(), currentUser()])
  const userName = user?.firstName || user?.fullName || '用户'

  return (
    <DashboardClient
      userId={userId}
      userName={userName}
      initialDashboardData={dashboardData}
    />
  )
}
