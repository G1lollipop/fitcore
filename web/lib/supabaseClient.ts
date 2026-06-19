import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server-only Supabase client backed by the service-role key.
 *
 * The service-role key BYPASSES row-level security, so this module must never
 * reach the browser bundle — `import 'server-only'` enforces that at build
 * time (any client component importing it fails the build). The anon key is
 * no longer shipped to the client at all.
 *
 * Consequently, ALL access control is the caller's responsibility: every query
 * must run inside a server action that scopes rows by the Supabase-authenticated
 * `userId` (see `lib/auth/require-user.ts`). Never interpolate untrusted input
 * into PostgREST filters.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
