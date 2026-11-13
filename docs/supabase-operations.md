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

**Pending — not yet applied or run against production:** `20261113090000_finish_training_session_atomic.sql` adds the `finish_training_session` RPC that the "Finish Training" action now calls, and two nullable `workout_logs` columns, `session_revision` and `session_snapshot_hash`, that the RPC uses to replace a stored session only with a strictly newer revision and to tell an identical retry from a different snapshot at the same revision. (A database that applied an earlier draft of this file should apply it again: it drops the first draft's function, which had no revision check, and replaces the later ones, which let an equal revision overwrite and let a retry re-create a workout deleted in Record.) It also adds the service-role-only table `training_session_closures` and two `workout_logs` triggers (`close_training_session_on_edit`, `close_training_session_on_delete`) that record when a workout saved from a training session is later edited or deleted; the RPC refuses any further save for such a session. The triggers call a `security definer` function, because signed-in users may change their own `workout_logs` rows but have no access to that table; it writes only the row's ID. Closure rows are kept after the workout is gone (that is what blocks a late retry) and hold no user data. Finally, it narrows what signed-in users may write on `workout_logs`: table-wide `INSERT`/`UPDATE` for `authenticated` is replaced by column-level grants on every normal workout field, so clients can no longer set `session_revision` or `session_snapshot_hash` (`SELECT`, `DELETE` and the service role are unchanged). Column grants do not extend themselves: a column added to `workout_logs` later must be added to that grant list if clients should write it, and the verification script fails until it is. Replaying `20261015140641_harden_data_access.sql` would restore the table-wide grants. Apply it before deploying that application code (until it exists the action fails closed and the device keeps the session), then run the verification script below; its training assertions have never been executed. The function assumes `workout_set_logs.id` and `logged_at` have defaults, as the generated types indicate — that table was created manually and has no migration here.

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

- a training session's summary and sets commit together, a repeated request ID rewrites the same workout (sets replaced, original day kept, totals not double counted), a save older than the stored revision changes nothing and is reported as `stale`, resending the stored snapshot is confirmed as `unchanged` without rewriting or duplicating anything, a different snapshot at the stored revision (or a save aimed at a workout that is not a training session) changes nothing and is reported as `conflict`, an identical retry of an untouched session is still confirmed, a retry (identical or newer) after the workout was edited in Record is a `conflict` and leaves the edit in place, a retry after the workout was deleted in Record is a `conflict` and does not re-create it, a malformed set leaves nothing behind, and another user's ID cannot rewrite the log.
- on `workout_logs`, a signed-in user can create, edit and delete their own workouts through every normal field but is refused (`insufficient_privilege`) when an insert or update names `session_revision` or `session_snapshot_hash`; no client role holds insert or update on those two columns, and the service role holds them on every column.

All synthetic writes are rolled back. This verifies the database layer; it does not measure live Gemini/Qwen quality, latency, or the mobile interface.

The knowledge retrieval RPCs were also executed successfully as `service_role` after moving pgvector. Follow any change with fresh security/performance advisors and explicit privilege checks.

## Advisor interpretation

Unused indexes are informational and depend on the observed workload. Keep them until query evidence justifies removal; adding a useful foreign-key index can initially add an unused-index notice.

The production console confirmed this organization is on Free. Leaked-password protection is available on Pro and above and remains disabled; no paid upgrade was made. The minimum password length was increased from 6 to 8 through the Email provider settings. Email confirmation and secure email change remain enabled, and anonymous sign-ins remain disabled. Settings requiring additional application integration, such as CAPTCHA, were not enabled.
