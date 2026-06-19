'use server'

import { redirect } from 'next/navigation'
import { createAuthServerClient } from '@/lib/supabase/server'

/**
 * Sign the current user out and send them to the sign-in screen.
 *
 * Runs as a Server Action so the auth cookies are cleared server-side via the
 * SSR client before the redirect.
 */
export async function signOut() {
  const supabase = await createAuthServerClient()
  await supabase.auth.signOut()
  redirect('/sign-in')
}
