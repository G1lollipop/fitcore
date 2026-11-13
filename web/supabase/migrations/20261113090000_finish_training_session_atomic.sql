-- Finishing an in-app training session writes one summary row
-- (`workout_logs`) plus one row per completed set (`workout_set_logs`). They are
-- one logical operation, so they are saved — together with the daily aggregate
-- refresh — in a single transaction: either the whole session is stored or
-- nothing is.
--
-- The call is idempotent. `p_request_id` is generated once per session on the
-- device and becomes the summary row's primary key, so repeating the call (for
-- example after a lost response) never adds a second workout.
--
-- Writes are ordered by `p_revision`, a counter the device bumps on every edit
-- to the session, and identified by a fingerprint of what was sent (workout
-- name + sets). The stored session is only ever replaced by a strictly newer
-- revision. Every other call changes nothing and reports why in `status`:
--
--   saved      this snapshot was written (first save, or newer than the stored one)
--   unchanged  this exact snapshot is already stored (a lost-response retry)
--   stale      a newer revision is stored; this older snapshot was ignored
--   conflict   the same revision is stored with different content (two copies
--              of the session were edited separately), the id belongs to a
--              workout that was not saved from a training session, or the
--              saved workout has since been edited or deleted in Record
--
-- Only `saved` and `unchanged` mean the caller's snapshot is what is stored.
-- A replaced session keeps its original `date` and `logged_at`.
--
-- Record has the last word. Once a workout saved from a session is edited or
-- deleted there, the session is closed: a retry from Training — identical,
-- older or newer — is a conflict. It never re-creates the deleted workout,
-- never overwrites the edit, and never reports the edited row as `unchanged`.
-- Triggers on `workout_logs` record the closure, so this holds for every path
-- that changes or removes the row, not only the app's own actions.

-- Both are null for workouts that were not saved from an in-app training session.
alter table public.workout_logs
  add column if not exists session_revision integer,
  add column if not exists session_snapshot_hash text;

comment on column public.workout_logs.session_revision is
  'Device edit counter of the training session this row was saved from; finish_training_session only replaces the row with a newer revision.';
comment on column public.workout_logs.session_snapshot_hash is
  'SHA-256 of the workout name and sets last saved by finish_training_session; tells an identical retry from a different snapshot at the same revision.';

-- Those two columns decide which training save wins, so only the service-role
-- save below may set them. Signed-in users keep direct access to their own
-- rows (RLS), but their INSERT and UPDATE rights become column-level: every
-- normal workout field, and neither session column. SELECT and DELETE stay
-- table-wide. Revoking the table-level right also clears any column-level
-- grants, so this is safe to re-apply.
--
-- Column grants do not extend themselves: a column added to workout_logs later
-- is not client-writable until it is added to this list (the verification
-- script fails until that decision is made).
revoke insert, update on table public.workout_logs from authenticated;
grant
  insert (id, user_id, date, workout_name, sets, duration_minutes,
          calories_burned, plan_id, day_id, logged_at, created_at),
  update (id, user_id, date, workout_name, sets, duration_minutes,
          calories_burned, plan_id, day_id, logged_at, created_at)
  on table public.workout_logs to authenticated;

-- Sessions closed to further training saves. The row outlives the workout it
-- refers to — that is what stops a late retry from re-creating a deleted
-- workout. It holds no user data: only the session's request id.
create table if not exists public.training_session_closures (
  request_id uuid primary key,
  reason     text not null check (reason in ('edited', 'deleted')),
  closed_at  timestamptz not null default now()
);

alter table public.training_session_closures enable row level security;
revoke all on table public.training_session_closures from public, anon, authenticated;
grant select on table public.training_session_closures to service_role;
drop policy if exists backend_only on public.training_session_closures;
create policy backend_only on public.training_session_closures
  for select to service_role using (true);

-- Runs as its owner so that it can record the closure whichever role edited or
-- deleted the workout (signed-in users may change their own rows directly, but
-- have no access to the closures table). It writes nothing but the row's id.
create or replace function public.close_training_session_on_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.training_session_closures as closures (request_id, reason)
  values (old.id, case tg_op when 'DELETE' then 'deleted' else 'edited' end)
  on conflict (request_id) do update
    set reason = excluded.reason,
        closed_at = pg_catalog.now()
    where closures.reason = 'edited' and excluded.reason = 'deleted';
  return null;
end;
$$;

revoke all on function public.close_training_session_on_record_change()
  from public, anon, authenticated;

-- An edit is any change to what Record shows that did not come from a training
-- save. A training save always moves `session_revision`, so it never closes its
-- own session; neither does a change that leaves these columns alone (such as
-- the plan link being cleared when a plan is deleted).
drop trigger if exists close_training_session_on_edit on public.workout_logs;
create trigger close_training_session_on_edit
  after update on public.workout_logs
  for each row
  when (
    old.session_revision is not null
    and new.session_revision is not distinct from old.session_revision
    and (new.workout_name, new.sets, new.duration_minutes, new.calories_burned,
         new.date, new.logged_at)
      is distinct from
        (old.workout_name, old.sets, old.duration_minutes, old.calories_burned,
         old.date, old.logged_at)
  )
  execute function public.close_training_session_on_record_change();

drop trigger if exists close_training_session_on_delete on public.workout_logs;
create trigger close_training_session_on_delete
  after delete on public.workout_logs
  for each row
  when (old.session_revision is not null)
  execute function public.close_training_session_on_record_change();

-- The first draft of this migration had no p_revision. Remove that overload so
-- the unguarded version cannot linger next to the current function. (Later
-- drafts share the current signature and are replaced below.)
drop function if exists public.finish_training_session(
  uuid, uuid, date, uuid, text, integer, integer, jsonb
);

create or replace function public.finish_training_session(
  p_user_id uuid,
  p_request_id uuid,
  p_revision integer,
  p_date date,
  p_plan_id uuid,
  p_workout_name text,
  p_duration_minutes integer,
  p_calories_burned integer,
  p_sets jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_date date;
  v_set_count integer;
  v_hash text;
  v_owner text;
  v_stored_revision integer;
  v_stored_hash text;
  v_status text;
  v_written boolean := false;
  v_closed boolean := false;
begin
  if p_user_id is null
    or p_request_id is null
    or p_revision is null
    or p_revision < 0
    or p_date is null
    or p_workout_name is null
    or pg_catalog.btrim(p_workout_name) = ''
    or p_duration_minutes is null
    or p_duration_minutes < 0
    or p_calories_burned is null
    or p_calories_burned < 0
    or pg_catalog.jsonb_typeof(p_sets) is distinct from 'array'
  then
    raise exception 'invalid training session request' using errcode = '22023';
  end if;

  v_set_count := pg_catalog.jsonb_array_length(p_sets);

  -- What identifies this snapshot: the name and the sets, in order. jsonb text
  -- is canonical, so the same sets always give the same fingerprint. Duration
  -- and date are left out — they depend on when the call is made, not on what
  -- the user logged.
  v_hash := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(p_workout_name || E'\n' || p_sets::text, 'UTF8')
    ),
    'hex'
  );

  -- The primary key serializes saves of one session: a concurrent save waits
  -- for the first transaction, then meets the row it committed. The WHERE
  -- clause is evaluated against that committed row, so it both keeps one
  -- user's id from ever rewriting another user's log and only lets a strictly
  -- newer revision replace what is stored. A row with no revision was not
  -- saved from a training session and is never replaced.
  --
  -- The write sits in its own block so that it can be taken back: whether the
  -- session has been closed by Record is only known for certain once this
  -- statement holds the row. An edit or delete that committed first is visible
  -- to the check that follows (a delete in flight is waited for, after which
  -- this statement inserts a fresh row); one that comes later waits for this
  -- transaction and then applies on top of it.
  begin
    insert into public.workout_logs as logs (
      id, user_id, date, workout_name, sets, duration_minutes, calories_burned,
      plan_id, day_id, logged_at, session_revision, session_snapshot_hash
    )
    values (
      p_request_id,
      p_user_id,
      p_date,
      p_workout_name,
      v_set_count,
      p_duration_minutes,
      p_calories_burned,
      -- Keep the link only while the plan still exists and belongs to the caller;
      -- a plan deleted mid-session must not make the workout unsavable. Compared
      -- as text because owner-id columns are not uniformly uuid in this schema.
      (select plans.id
         from public.workout_plans as plans
        where plans.id = p_plan_id
          and plans.creator_id::text = p_user_id::text),
      -- JSON-structure plans have no per-day rows.
      null,
      pg_catalog.now(),
      p_revision,
      v_hash
    )
    on conflict (id) do update
      set workout_name = excluded.workout_name,
          sets = excluded.sets,
          duration_minutes = excluded.duration_minutes,
          calories_burned = excluded.calories_burned,
          session_revision = excluded.session_revision,
          session_snapshot_hash = excluded.session_snapshot_hash
      where logs.user_id = excluded.user_id
        and logs.session_revision < excluded.session_revision
    returning logs.date into v_date;
    v_written := found;

    if exists (
      select 1
        from public.training_session_closures as closures
       where closures.request_id = p_request_id
    ) then
      -- Undo whatever the statement above did (re-created a deleted workout,
      -- or replaced an edited one) and leave Record's version as it is.
      raise exception 'training session is closed' using errcode = 'TS409';
    end if;
  exception when sqlstate 'TS409' then
    v_closed := true;
  end;

  if v_closed then
    -- Another user's id must still be refused outright, not answered.
    if exists (
      select 1
        from public.workout_logs as logs
       where logs.id = p_request_id
         and logs.user_id::text is distinct from p_user_id::text
    ) then
      raise exception 'training session id is already used by another log'
        using errcode = '22023';
    end if;

    return pg_catalog.jsonb_build_object(
      'workout_log_id', p_request_id,
      'status', 'conflict',
      'date', null,
      'set_count', null,
      'revision', null
    );
  end if;

  if not v_written then
    -- Nothing was written. The conflicting row stays locked by this
    -- transaction, so what is read here cannot change underneath it.
    select logs.user_id::text, logs.date, logs.sets,
           logs.session_revision, logs.session_snapshot_hash
      into v_owner, v_date, v_set_count, v_stored_revision, v_stored_hash
      from public.workout_logs as logs
     where logs.id = p_request_id;

    if v_owner is distinct from p_user_id::text then
      raise exception 'training session id is already used by another log'
        using errcode = '22023';
    end if;

    if v_stored_revision = p_revision and v_stored_hash = v_hash then
      -- The very snapshot that is stored, sent again: confirm it as is.
      v_status := 'unchanged';
    elsif v_stored_revision > p_revision then
      v_status := 'stale';
    else
      -- Same revision, different content — or not a training session row.
      v_status := 'conflict';
    end if;

    -- In all three cases the stored session and its sets are left untouched;
    -- `revision` and `set_count` describe what is stored.
    return pg_catalog.jsonb_build_object(
      'workout_log_id', p_request_id,
      'status', v_status,
      'date', v_date,
      'set_count', v_set_count,
      'revision', v_stored_revision
    );
  end if;

  -- Replace rather than append, so a newer save never doubles the sets.
  delete from public.workout_set_logs
   where workout_log_id = p_request_id;

  insert into public.workout_set_logs (
    workout_log_id, exercise_name, set_number, weight_kg, reps
  )
  select p_request_id,
         s.exercise_name,
         s.set_number,
         s.weight_kg,
         s.reps
    from pg_catalog.jsonb_to_recordset(p_sets) as s(
      exercise_name text,
      set_number integer,
      weight_kg numeric,
      reps integer
    );

  perform public.recompute_daily_stats(p_user_id, v_date);

  return pg_catalog.jsonb_build_object(
    'workout_log_id', p_request_id,
    'status', 'saved',
    'date', v_date,
    'set_count', v_set_count,
    'revision', p_revision
  );
end;
$$;

revoke all on function public.finish_training_session(
  uuid, uuid, integer, date, uuid, text, integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.finish_training_session(
  uuid, uuid, integer, date, uuid, text, integer, integer, jsonb
) to service_role;
