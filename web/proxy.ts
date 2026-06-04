import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/profile(.*)',
  '/settings(.*)',
  '/workout(.*)',
  '/nutrition(.*)',
  '/plans(.*)',
  '/exercises(.*)',
  '/analytics(.*)',
])

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api(.*)',
])

const isOnboardingRoute = createRouteMatcher([
  '/onboarding(.*)',
])

async function checkUserOnboarded(userId: string): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return true
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/user_settings?user_id=eq.${userId}&select=user_id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    )

    if (!response.ok) {
      return true
    }

    const data = await response.json()
    return data && data.length > 0
  } catch (error) {
    console.error('[Proxy] Error checking onboarding status:', error)
    return true
  }
}

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()

  if (isPublicRoute(req)) {
    return
  }

  if (isProtectedRoute(req)) {
    await auth.protect()

    if (userId && !isOnboardingRoute(req)) {
      const hasOnboarded = await checkUserOnboarded(userId)

      if (!hasOnboarded) {
        const onboardingUrl = new URL('/onboarding', req.url)
        return NextResponse.redirect(onboardingUrl)
      }
    }
  }

  if (isOnboardingRoute(req) && userId) {
    const hasOnboarded = await checkUserOnboarded(userId)

    if (hasOnboarded) {
      const url = new URL(req.url)
      const isReassess = url.searchParams.get('reassess') === 'true'
      if (!isReassess) {
        const homeUrl = new URL('/', req.url)
        return NextResponse.redirect(homeUrl)
      }
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
