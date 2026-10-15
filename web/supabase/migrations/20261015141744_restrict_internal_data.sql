-- Keep internal tables accessible only to the backend, with explicit RLS policies.
revoke all on table public.knowledge_base, public.chat_message_feedback, public.chat_trace, public.quick_log_requests from public, anon, authenticated;
alter policy "Allow all" on public.knowledge_base to service_role;
alter policy "Allow all" on public.knowledge_base rename to backend_only;
create policy backend_only on public.chat_message_feedback for all to service_role using (true) with check (true);
create policy backend_only on public.chat_trace for all to service_role using (true) with check (true);
create policy backend_only on public.quick_log_requests for all to service_role using (true) with check (true);
