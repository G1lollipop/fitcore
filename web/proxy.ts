import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Routes that never require authentication.
 *   - /sign-in, /sign-up : auth screens
 *   - /auth/*            : OAuth callback (code → session exchange)
 *   - /api/*             : API routes do their own auth (see /api/ai/chat)
 */
function isPublicRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api')
  )
}

function isOnboardingRoute(pathname: string): boolean {
  return pathname.startsWith('/onboarding')
}

/**
 * Per-user cache of the onboarding flag. Onboarding is one-way (once completed
 * it never reverts), so after the first confirmation we stamp the user's id
 * into this httpOnly cookie and skip the Supabase lookup on later requests.
 * Keyed by user id so a different account on the same browser re-checks rather
 * than inheriting a stale "true".
 */
const ONBOARDED_COOKIE = 'fc_onboarded'

async function resolveOnboarded(
  request: NextRequest,
  response: NextResponse,
  userId: string
): Promise<boolean> {
  if (request.cookies.get(ONBOARDED_COOKIE)?.value === userId) {
    return true
  }
  const onboarded = await checkUserOnboarded(userId)
  if (onboarded) {
    response.cookies.set(ONBOARDED_COOKIE, userId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  return onboarded
}

/**
 * Has the user completed onboarding? Checked via a direct PostgREST call with
 * the service-role key — this runs server-side in middleware (never shipped to
 * the browser) and is scoped to the authenticated `userId`.
 *
 * Fails open (returns `true`) on any error so a transient Supabase hiccup never
 * traps a legitimate user in a redirect loop.
 */
async function checkUserOnboarded(userId: string): Promise<boolean> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return true
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/user_settings?user_id=eq.${userId}&select=user_id`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    )

    if (!response.ok) {
      return true
    }

    const data = await response.json()
    return Array.isArray(data) && data.length > 0
  } catch (error) {
    console.error('[Proxy] Error checking onboarding status:', error)
    return true
  }
}

export default async function proxy(request: NextRequest) {
  // Start with a passthrough response we can attach refreshed cookies to.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: getUser() refreshes the session and writes new cookies via
  // setAll above. Do not run logic between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (isPublicRoute(pathname)) {
    return response
  }

  // Everything else requires a signed-in user.
  if (!user) {
    const signInUrl = new URL('/sign-in', request.url)
    return NextResponse.redirect(signInUrl)
  }

  // Onboarding gating only affects real page navigations. Server actions and
  // RSC data fetches (non-GET, e.g. the POST that loads each tab) authenticate
  // inside the action itself, so we skip the onboarding lookup + redirect for
  // them — that removes a Supabase round-trip from every tab data load.
  if (request.method !== 'GET') {
    return response
  }

  const hasOnboarded = await resolveOnboarded(request, response, user.id)

  // Unonboarded users are funneled to /onboarding (except while already there).
  if (!hasOnboarded && !isOnboardingRoute(pathname)) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  // Onboarded users hitting /onboarding bounce home, unless re-assessing.
  if (hasOnboarded && isOnboardingRoute(pathname)) {
    const isReassess = request.nextUrl.searchParams.get('reassess') === 'true'
    if (!isReassess) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
