import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

/**
 * Browser-side Supabase client for auth flows (sign-in / sign-up / OAuth).
 *
 * Uses the public anon key and stores the session in cookies via `@supabase/ssr`
 * so the same session is readable server-side by middleware (`proxy.ts`) and
 * `requireUserId()`. Safe to ship to the client — it never sees the service-role
 * key (that lives only in the server-only `supabaseClient.ts`).
 */
export function createAuthBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
