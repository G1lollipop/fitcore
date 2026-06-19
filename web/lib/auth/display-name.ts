import type { User } from '@supabase/supabase-js'

/**
 * Best-effort display name for a Supabase-authenticated user.
 *
 * OAuth providers (Google) populate `user_metadata.full_name` / `name`;
 * email/password sign-ups have neither, so we fall back to the email local
 * part. Returns '' when nothing is available so callers can apply a localized
 * default.
 */
export function resolveDisplayName(user: Pick<User, 'email' | 'user_metadata'> | null): string {
  if (!user) return ''
  const meta = user.user_metadata ?? {}
  const fromMeta =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    ''
  if (fromMeta) return fromMeta
  if (user.email) return user.email.split('@')[0]
  return ''
}
