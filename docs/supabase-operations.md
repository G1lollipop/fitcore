# Supabase operations

Project: `fitcore-db` (`olrgdjojldeuihkebmvc`). Updated October 15, 2026.

## Access model

- Browser clients use Supabase Auth; business operations use authenticated Server Actions and the server-only service-role client.
- Personal tables (`daily_stats`, `chat_messages`, `user_settings`, `food_logs`, `workout_logs`) have owner-only policies for `authenticated`. Their `user_id` types differ: the first three use `text`, the last two use `uuid`. Anonymous access and client `TRUNCATE` privileges are revoked.
- Training plans, set details, knowledge tables, chat telemetry and Quick Log request storage are backend-only. Explicit `service_role` policies document that boundary; no user-facing policy is added to silence advisor notices.
- `exec_sql(text)` is not used by application code. Its execution permission is revoked from all API roles, including `service_role`.
- Knowledge RPCs are executable only by the backend. Their fixed search paths include `extensions`, where pgvector now lives. The extension was relocated without dropping vectors, tables or indexes.

## Applied migrations

The six October 15 migration versions in `web/supabase/migrations` match the production migration ledger. They restrict the arbitrary-SQL RPC, install atomic Quick Log, harden table access, pin function paths, move pgvector, cover five foreign keys and remove one verified duplicate index. The constraint-backed `daily_stats_user_id_date_key` remains.

The earlier schema was maintained manually and its five June migration versions are not recorded in the production ledger. **Do not run a blanket `db push` or replay those historical scripts.** In particular, the old plan migration deletes plan rows. Baseline reconciliation requires a separate schema review; an empty/missing historical ledger is not permission to rerun destructive SQL.

`rag/supabase/migrations` is a separate historical bootstrap directory. Its initial RAG script predates this hardening and must not be reapplied over the hardened database.

## Database verification

Run `web/supabase/tests/production_hardening.sql` with a database-owner connection. It selects an existing Auth user internally, switches to the actual service role, and verifies:

- food/workout writes commit together and recompute daily totals;
- repeated request IDs recover the original result without duplicate records;
- a reused ID with different input is rejected;
- malformed workout data leaves neither partial food data nor a request row;
- authenticated users can read their own rows and cannot read another user's rows;
- anonymous table access and arbitrary SQL execution are denied.

All synthetic writes are rolled back. This verifies the database layer; it does not measure live Gemini/Qwen quality, latency, or the mobile interface.

The knowledge retrieval RPCs were also executed successfully as `service_role` after moving pgvector. Follow any change with fresh security/performance advisors and explicit privilege checks.

## Advisor interpretation

Unused indexes are informational and depend on the observed workload. Keep them until query evidence justifies removal; adding a useful foreign-key index can initially add an unused-index notice.

The production console confirmed this organization is on Free. Leaked-password protection is available on Pro and above and remains disabled; no paid upgrade was made. The minimum password length was increased from 6 to 8 through the Email provider settings. Email confirmation and secure email change remain enabled, and anonymous sign-ins remain disabled. Settings requiring additional application integration, such as CAPTCHA, were not enabled.
