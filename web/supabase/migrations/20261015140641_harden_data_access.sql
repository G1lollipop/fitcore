-- Owner-scoped access for personal data; preserve service-role server actions.
set local lock_timeout = '5s';

alter table public.daily_stats enable row level security;
revoke all on table public.daily_stats from public, anon, authenticated;
grant select, insert, update, delete on table public.daily_stats to authenticated, service_role;
drop policy if exists "Allow all" on public.daily_stats;
drop policy if exists "own daily_stats" on public.daily_stats;
create policy "own daily_stats" on public.daily_stats for all to authenticated
  using ((select auth.uid())::text = user_id) with check ((select auth.uid())::text = user_id);

alter table public.chat_messages enable row level security;
revoke all on table public.chat_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.chat_messages to authenticated, service_role;
drop policy if exists "Allow all" on public.chat_messages;
drop policy if exists "own chat_messages" on public.chat_messages;
create policy "own chat_messages" on public.chat_messages for all to authenticated
  using ((select auth.uid())::text = user_id) with check ((select auth.uid())::text = user_id);

alter table public.user_settings enable row level security;
revoke all on table public.user_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.user_settings to authenticated, service_role;
drop policy if exists "Allow all" on public.user_settings;
drop policy if exists "own user_settings" on public.user_settings;
create policy "own user_settings" on public.user_settings for all to authenticated
  using ((select auth.uid())::text = user_id) with check ((select auth.uid())::text = user_id);

alter table public.food_logs enable row level security;
revoke all on table public.food_logs from public, anon, authenticated;
grant select, insert, update, delete on table public.food_logs to authenticated, service_role;
drop policy if exists "Allow all" on public.food_logs;
drop policy if exists "own food_logs" on public.food_logs;
create policy "own food_logs" on public.food_logs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.workout_logs enable row level security;
revoke all on table public.workout_logs from public, anon, authenticated;
grant select, insert, update, delete on table public.workout_logs to authenticated, service_role;
drop policy if exists "Allow all" on public.workout_logs;
drop policy if exists "own workout_logs" on public.workout_logs;
create policy "own workout_logs" on public.workout_logs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
