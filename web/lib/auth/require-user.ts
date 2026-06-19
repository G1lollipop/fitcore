import { createAuthServerClient } from '@/lib/supabase/server';

/**
 * Server-only auth guard for Server Actions.
 *
 * Returns the Supabase-authenticated user id (a UUID), deriving it from the
 * request session cookie rather than trusting a client-supplied value. Throws
 * `UNAUTHORIZED` when there is no signed-in user so callers can map it to a
 * uniform failure response.
 *
 * `getUser()` revalidates the JWT against Supabase Auth on each call, so the
 * returned id is trustworthy. Never accept `userId` from the client and pass it
 * to the database — always resolve identity here.
 */
export async function requireUserId(): Promise<string> {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user.id;
}

/**
 * Sentinel error code thrown by {@link requireUserId} when no user is signed in.
 */
export const UNAUTHORIZED = 'UNAUTHORIZED';

/**
 * Auth template for "result-shaped" Server Actions (those returning
 * `{ success: boolean; error?: string }`).
 *
 * Usage:
 *   const a = await authedUserId();
 *   if (!a.ok) return a.result;        // -> { success: false, error: 'UNAUTHORIZED' }
 *   const userId = a.userId;
 *
 * Centralizes the previously duplicated try/catch boilerplate while keeping
 * each action's public return shape unchanged.
 */
export async function authedUserId(): Promise<
  | { ok: true; userId: string }
  | { ok: false; result: { success: false; error: string } }
> {
  try {
    return { ok: true, userId: await requireUserId() };
  } catch {
    return { ok: false, result: { success: false, error: UNAUTHORIZED } };
  }
}

/**
 * Auth template for "getter" Server Actions that degrade to a default value
 * (null / [] / defaults) when there is no signed-in user.
 *
 * Usage:
 *   const userId = await getUserIdOrNull();
 *   if (!userId) return <default>;
 */
export async function getUserIdOrNull(): Promise<string | null> {
  try {
    return await requireUserId();
  } catch {
    return null;
  }
}
