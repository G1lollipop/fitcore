-- Retire the arbitrary-SQL API endpoint. No application code uses this RPC.
-- Keep the function for database-owner recovery, but no API role may invoke it.
revoke all on function public.exec_sql(text) from public, anon, authenticated, service_role;
alter function public.exec_sql(text) set search_path = pg_catalog, public, extensions;
