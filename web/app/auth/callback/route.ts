import { NextResponse } from 'next/server'
import { createAuthServerClient } from '@/lib/supabase/server'

/**
 * OAuth / email-confirmation callback.
 *
 * Google (and the email-confirmation link) redirect here with a `code` query
 * param. We exchange it for a session — `createAuthServerClient` writes the
 * session cookies — then bounce the user into the app. Middleware takes over
 * from there to route them to /onboarding if they haven't onboarded yet.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createAuthServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth/callback] exchangeCodeForSession error:', error.message)
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth`)
}
