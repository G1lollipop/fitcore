-- Runs against the configured database and rolls back every synthetic log.
-- Requires a database-owner connection and at least one existing Auth user.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $test$
declare
  test_user uuid;
  request_id uuid := gen_random_uuid();
  failed_request_id uuid := gen_random_uuid();
  food_id uuid := gen_random_uuid();
  workout_id uuid := gen_random_uuid();
  failed_food_id uuid := gen_random_uuid();
  test_date date := date '2000-01-01';
  original_calories integer;
  saved jsonb;
  retried jsonb;
  foods jsonb;
  workouts jsonb;
  items jsonb;
begin
  select id into test_user from auth.users order by created_at limit 1;
  if test_user is null then
    raise exception 'Verification requires an existing Auth user; no account was created';
  end if;

  perform set_config('role', 'service_role', true);
  select coalesce(sum(calories), 0)::integer into original_calories
    from public.food_logs where user_id = test_user and date = test_date;
  foods := jsonb_build_array(jsonb_build_object(
    'id', food_id, 'food_name', 'FitCore migration verification',
    'calories', 130, 'protein', 3, 'carbs', 28, 'fat', 0));
  workouts := jsonb_build_array(jsonb_build_object(
    'id', workout_id, 'workout_name', 'FitCore migration verification',
    'duration_minutes', 10, 'calories_burned', 40));
  items := jsonb_build_array(
    jsonb_build_object('kind', 'food', 'id', food_id, 'name', 'verification',
      'calories', 130, 'protein', 3, 'carbs', 28, 'fat', 0),
    jsonb_build_object('kind', 'workout', 'id', workout_id, 'name', 'verification',
      'sets', null, 'durationMinutes', 10, 'caloriesBurned', 40));

  saved := public.commit_quick_log(test_user, request_id, repeat('a', 64),
    test_date, foods, workouts, items);
  retried := public.commit_quick_log(test_user, request_id, repeat('a', 64),
    test_date, foods, workouts, items);
  assert saved = retried, 'Retry must return the original result';
  assert (select count(*) = 1 from public.food_logs where id = food_id),
    'Food must be persisted once';
  assert (select count(*) = 1 from public.workout_logs where id = workout_id),
    'Workout must be persisted once';
  assert (select total_calories = original_calories + 130 from public.daily_stats
    where user_id = test_user::text and date = test_date),
    'Daily totals must match the committed food rows';
  assert public.get_quick_log_result(test_user, request_id, repeat('a', 64)) = saved,
    'Committed-result recovery must match';

  begin
    perform public.get_quick_log_result(test_user, request_id, repeat('b', 64));
    raise exception 'Reusing an ID for different input must fail';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.commit_quick_log(test_user, failed_request_id, repeat('c', 64),
      test_date,
      jsonb_build_array(jsonb_build_object('id', failed_food_id,
        'food_name', 'FitCore failed transaction verification', 'calories', 99)),
      jsonb_build_array(jsonb_build_object('id', gen_random_uuid(),
        'workout_name', 'invalid', 'duration_minutes', 'not-a-number')),
      '[]'::jsonb);
    raise exception 'Malformed workout must abort the mixed write';
  exception when invalid_text_representation then null;
  end;
  assert not exists(select 1 from public.food_logs where id = failed_food_id),
    'Failed mixed write must not leave partial food data';
  assert not exists(select 1 from public.quick_log_requests as requests where requests.request_id = failed_request_id),
    'Failed mixed write must not leave an idempotency row';

  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config('role', 'authenticated', true);
  assert (select count(*) = 1 from public.food_logs where id = food_id),
    'Authenticated users must see their own rows';
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  assert not exists(select 1 from public.food_logs where id = food_id),
    'Another authenticated user must not see the row';

  perform set_config('role', 'anon', true);
  begin
    perform id from public.food_logs limit 1;
    raise exception 'Anonymous table access must be denied';
  exception when insufficient_privilege then null;
  end;
  assert not has_function_privilege('anon', 'public.exec_sql(text)', 'execute'),
    'Anonymous arbitrary SQL execution must be denied';
end;
$test$;

rollback;
select 'mixed write, retry, totals, rollback and user isolation passed; synthetic logs rolled back' as validation;
