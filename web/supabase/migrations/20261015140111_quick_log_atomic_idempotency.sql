-- Quick logs are a single logical operation even when they contain both food
-- and workout entries. Keep their idempotency record, normalized rows, and
-- daily aggregate update in one transaction.

create table public.quick_log_requests (
  user_id       uuid not null references auth.users (id) on delete cascade,
  request_id    uuid not null,
  request_hash  text not null,
  result        jsonb,
  created_at    timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.quick_log_requests enable row level security;
revoke all on table public.quick_log_requests from anon, authenticated;
grant select, insert, update on table public.quick_log_requests to service_role;

-- All aggregate refreshes use the same transaction lock. This keeps the
-- daily_stats cache correct when ordinary log actions and quick logs overlap.
create or replace function public.recompute_daily_stats(
  p_user_id uuid,
  p_date date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_user_id is null or p_date is null then
    raise exception 'invalid daily stats refresh request' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_date::text, 0)
  );

  insert into public.daily_stats (
    user_id,
    date,
    water_intake,
    total_calories,
    total_protein,
    total_carbs,
    total_fat,
    calories_burned,
    workout_duration
  )
  select p_user_id,
         p_date,
         0,
         coalesce(food.total_calories, 0)::integer,
         coalesce(food.total_protein, 0)::integer,
         coalesce(food.total_carbs, 0)::integer,
         coalesce(food.total_fat, 0)::integer,
         coalesce(workout.calories_burned, 0)::integer,
         coalesce(workout.duration_minutes, 0)::integer
    from (
      select sum(calories) as total_calories,
             sum(protein) as total_protein,
             sum(carbs) as total_carbs,
             sum(fat) as total_fat
        from public.food_logs
       where user_id = p_user_id and date = p_date
    ) as food
    cross join (
      select sum(calories_burned) as calories_burned,
             sum(duration_minutes) as duration_minutes
        from public.workout_logs
       where user_id = p_user_id and date = p_date
    ) as workout
  on conflict (user_id, date) do update
    set total_calories = excluded.total_calories,
        total_protein = excluded.total_protein,
        total_carbs = excluded.total_carbs,
        total_fat = excluded.total_fat,
        calories_burned = excluded.calories_burned,
        workout_duration = excluded.workout_duration;
end;
$$;

revoke all on function public.recompute_daily_stats(uuid, date)
  from public, anon, authenticated;
grant execute on function public.recompute_daily_stats(uuid, date) to service_role;

-- A retry that cannot reach the AI parser can still recover an already
-- committed quick-log response. Missing keys return NULL; a key reused for a
-- different input fails closed.
create or replace function public.get_quick_log_result(
  p_user_id uuid,
  p_request_id uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.quick_log_requests%rowtype;
begin
  if p_user_id is null
    or p_request_id is null
    or p_request_hash is null
    or p_request_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception 'invalid quick log lookup request' using errcode = '22023';
  end if;

  select *
    into v_request
    from public.quick_log_requests
   where user_id = p_user_id
     and request_id = p_request_id;

  if not found then
    return null;
  end if;

  if v_request.request_hash <> p_request_hash then
    raise exception 'quick log request id reused with different input' using errcode = '22023';
  end if;

  return v_request.result;
end;
$$;

revoke all on function public.get_quick_log_result(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_quick_log_result(uuid, uuid, text) to service_role;

create or replace function public.commit_quick_log(
  p_user_id uuid,
  p_request_id uuid,
  p_request_hash text,
  p_date date,
  p_food_rows jsonb,
  p_workout_rows jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.quick_log_requests%rowtype;
begin
  if p_user_id is null
    or p_request_id is null
    or p_date is null
    or p_request_hash is null
    or p_request_hash !~ '^[a-f0-9]{64}$'
    or pg_catalog.jsonb_typeof(p_food_rows) is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_workout_rows) is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_items) is distinct from 'array'
  then
    raise exception 'invalid quick log request' using errcode = '22023';
  end if;

  -- The unique key serializes duplicate requests. A concurrent duplicate waits
  -- for the first transaction, then reads its committed result below.
  insert into public.quick_log_requests (user_id, request_id, request_hash)
  values (p_user_id, p_request_id, p_request_hash)
  on conflict (user_id, request_id) do nothing;

  select *
    into v_request
    from public.quick_log_requests
   where user_id = p_user_id
     and request_id = p_request_id
   for update;

  if not found then
    raise exception 'quick log idempotency record unavailable' using errcode = '40001';
  end if;

  if v_request.request_hash <> p_request_hash then
    raise exception 'quick log request id reused with different input' using errcode = '22023';
  end if;

  if v_request.result is not null then
    return v_request.result;
  end if;

  insert into public.food_logs (
    id, user_id, date, food_name, calories, protein, carbs, fat, logged_at
  )
  select f.id,
         p_user_id,
         p_date,
         f.food_name,
         coalesce(f.calories, 0),
         coalesce(f.protein, 0),
         coalesce(f.carbs, 0),
         coalesce(f.fat, 0),
         coalesce(f.logged_at, pg_catalog.now())
    from pg_catalog.jsonb_to_recordset(p_food_rows) as f(
      id uuid,
      food_name text,
      calories integer,
      protein integer,
      carbs integer,
      fat integer,
      logged_at timestamptz
    );

  insert into public.workout_logs (
    id, user_id, date, workout_name, sets, duration_minutes, calories_burned, logged_at
  )
  select w.id,
         p_user_id,
         p_date,
         w.workout_name,
         w.sets,
         coalesce(w.duration_minutes, 0),
         coalesce(w.calories_burned, 0),
         coalesce(w.logged_at, pg_catalog.now())
    from pg_catalog.jsonb_to_recordset(p_workout_rows) as w(
      id uuid,
      workout_name text,
      sets integer,
      duration_minutes integer,
      calories_burned integer,
      logged_at timestamptz
    );

  perform public.recompute_daily_stats(p_user_id, p_date);

  update public.quick_log_requests
     set result = pg_catalog.jsonb_build_object('items', p_items)
   where user_id = p_user_id
     and request_id = p_request_id
  returning * into v_request;

  return v_request.result;
end;
$$;

revoke all on function public.commit_quick_log(uuid, uuid, text, date, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_quick_log(uuid, uuid, text, date, jsonb, jsonb, jsonb)
  to service_role;
