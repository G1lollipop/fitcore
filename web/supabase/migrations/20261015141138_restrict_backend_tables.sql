-- These tables are read/written only by the backend service-role client.
set local lock_timeout = '5s';
alter table public.workout_plans enable row level security;
alter table public.workout_set_logs enable row level security;
alter table public.rag_kb_chunks enable row level security;
revoke all on table public.workout_plans, public.workout_set_logs, public.rag_kb_chunks from public, anon, authenticated;
grant select, insert, update, delete on table public.workout_plans, public.workout_set_logs, public.rag_kb_chunks to service_role;
create policy backend_only on public.workout_plans for all to service_role using (true) with check (true);
create policy backend_only on public.workout_set_logs for all to service_role using (true) with check (true);
create policy backend_only on public.rag_kb_chunks for all to service_role using (true) with check (true);
