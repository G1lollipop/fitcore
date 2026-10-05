import 'server-only';

import { supabase } from '@/lib/supabaseClient';

/**
 * Recompute the `daily_stats` aggregate cache for one (user, date) through a
 * database function that serializes refreshes for the same user and date.
 *
 * After Phase 3, per-item logs live in their own tables and `daily_stats` is a
 * derived cache holding daily totals (used by the dashboard rings and the
 * weekly/monthly trend queries). Every food/workout write calls this so the
 * cache stays consistent. `water_intake` is owned separately by `logWater`
 * and is preserved here (never overwritten).
 */
export async function recomputeDailyStats(userId: string, date: string): Promise<void> {
  const { error } = await supabase.rpc('recompute_daily_stats', {
    p_user_id: userId,
    p_date: date,
  });

  if (error) {
    // Callers have already committed their log mutation before refreshing this
    // derived cache. Throwing here would invite a user retry with a new log ID
    // and create a duplicate. Keep the existing success behavior, but surface
    // the stale-cache risk in server logs for investigation.
    console.error(
      '[recomputeDailyStats] RPC error; log mutation is committed but daily_stats may be stale:',
      error.message
    );
  }
}
