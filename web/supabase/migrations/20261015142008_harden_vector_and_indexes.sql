-- Pin function resolution before relocating pgvector; preserve its OIDs and data.
set local lock_timeout = '5s';
create schema if not exists extensions;
grant usage on schema extensions to service_role, authenticated, anon;
revoke all on function public.match_documents(public.vector, double precision, integer) from public, anon, authenticated;
revoke all on function public.match_rag_kb_chunks(public.vector, integer) from public, anon, authenticated;
alter function public.match_documents(public.vector, double precision, integer) set search_path = pg_catalog, public, extensions;
alter function public.match_rag_kb_chunks(public.vector, integer) set search_path = pg_catalog, public, extensions;
alter function public.update_updated_at_column() set search_path = pg_catalog;
alter extension vector set schema extensions;

create index if not exists chat_message_feedback_message_id_idx on public.chat_message_feedback(message_id);
create index if not exists chat_trace_message_id_idx on public.chat_trace(message_id);
create index if not exists user_settings_current_plan_id_idx on public.user_settings(current_plan_id);
create index if not exists workout_logs_plan_id_idx on public.workout_logs(plan_id);
create index if not exists workout_set_logs_workout_log_id_idx on public.workout_set_logs(workout_log_id);

-- The identical constraint-backed daily_stats_user_id_date_key is retained.
drop index if exists public.daily_stats_user_date_uidx;
notify pgrst, 'reload schema';
