import { redirect } from 'next/navigation'
import { createAuthServerClient } from '@/lib/supabase/server'
import { DashboardClient } from '@/components/dashboard/dashboard-client'
import { CoachProvider } from '@/components/ai-chat/coach-context'
import { getDashboardData } from '@/app/actions/dashboard'
import { resolveDisplayName } from '@/lib/auth/display-name'

/**
 * Home is a server component: it resolves auth and fetches the dashboard
 * payload on the server so the first paint already has data (no client
 * round-trip / skeleton flash). All interactivity (nav switching, refetch,
 * widgets) lives in the `DashboardClient` child.
 */
export default async function DashboardPage() {
  const supabase = await createAuthServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/sign-in')
  }

  const dashboardData = await getDashboardData()
  // Fall back to a localized default in the client (DashboardClient) when empty.
  const userName = resolveDisplayName(user)

  return (
    <CoachProvider>
      <DashboardClient
        userId={user.id}
        userName={userName}
        initialDashboardData={dashboardData}
      />
    </CoachProvider>
  )
}
