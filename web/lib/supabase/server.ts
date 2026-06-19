import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

/**
 * Request-scoped Supabase client backed by the anon key + the session cookie.
 *
 * Use this in Server Components, Server Actions and route handlers to resolve
 * the authenticated user (`supabase.auth.getUser()`) and to read/write the
 * session cookie during the auth flow. Identity is always derived here from the
 * cookie — never trust a client-supplied user id (see `require-user.ts`).
 *
 * `getAll`/`setAll` bridge Supabase's cookie store to Next's. The `setAll`
 * try/catch is intentional: when this client is created inside a Server
 * Component, cookies are read-only and writes throw — that's fine because the
 * middleware (`proxy.ts`) refreshes the session cookie on every request.
 */
export async function createAuthServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component (read-only cookies) — ignore;
            // middleware keeps the session cookie fresh.
          }
        },
      },
    }
  )
}
