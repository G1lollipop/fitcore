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
  training_id uuid := gen_random_uuid();
  failed_training_id uuid := gen_random_uuid();
  edited_training_id uuid := gen_random_uuid();
  deleted_training_id uuid := gen_random_uuid();
  client_workout_id uuid := gen_random_uuid();
  burned_before integer;
  trained jsonb;
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

  -- Training sessions: the summary row and its sets commit together; only a
  -- newer revision replaces a stored session; the stored snapshot sent again is
  -- confirmed without a second workout; an older revision, or other content at
  -- the same revision, changes nothing.
  select coalesce(max(calories_burned), 0)::integer into burned_before
    from public.daily_stats where user_id = test_user::text and date = test_date;
  trained := public.finish_training_session(test_user, training_id, 2, test_date,
    gen_random_uuid(), 'FitCore training verification', 30, 50,
    jsonb_build_array(
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 1, 'weight_kg', 60, 'reps', 5),
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 2, 'weight_kg', 60, 'reps', 5)));
  assert trained ->> 'workout_log_id' = training_id::text,
    'Training save must confirm the request id it stored';
  assert trained ->> 'status' = 'saved' and (trained ->> 'revision')::integer = 2,
    'A first training save must be stored at the revision it was sent with';
  assert (select count(*) = 2 from public.workout_set_logs where workout_log_id = training_id),
    'Every completed set must be stored with the summary';
  assert (select plan_id is null and sets = 2 and session_revision = 2
    from public.workout_logs where id = training_id),
    'An unknown plan must not block the save';
  assert (select calories_burned = burned_before + 50 from public.daily_stats
    where user_id = test_user::text and date = test_date),
    'Daily totals must include the training session';

  -- A newer snapshot (one more set) sent on a later day: still one workout,
  -- sets replaced.
  trained := public.finish_training_session(test_user, training_id, 3, test_date + 1,
    gen_random_uuid(), 'FitCore training verification', 35, 60,
    jsonb_build_array(
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 1, 'weight_kg', 60, 'reps', 5),
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 2, 'weight_kg', 60, 'reps', 5),
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 3, 'weight_kg', 60, 'reps', 4)));
  assert trained ->> 'status' = 'saved' and (trained ->> 'revision')::integer = 3,
    'A newer training save must be stored';
  assert (select count(*) = 1 from public.workout_logs
    where user_id = test_user and workout_name = 'FitCore training verification'),
    'A newer training save must not create a second workout';
  assert (select sets = 3 and date = test_date from public.workout_logs where id = training_id),
    'A newer training save must update the summary and keep its original day';
  assert (select count(*) = 3 from public.workout_set_logs where workout_log_id = training_id),
    'A newer training save must replace the stored sets, not append to them';
  assert (select calories_burned = burned_before + 60 from public.daily_stats
    where user_id = test_user::text and date = test_date),
    'Daily totals must follow the newer save without double counting';

  -- The delayed retry of the older snapshot arrives last: it must change nothing
  -- and must say which revision is stored.
  trained := public.finish_training_session(test_user, training_id, 2, test_date,
    gen_random_uuid(), 'FitCore training verification', 30, 50,
    jsonb_build_array(
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 1, 'weight_kg', 60, 'reps', 5),
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 2, 'weight_kg', 60, 'reps', 5)));
  assert trained ->> 'workout_log_id' = training_id::text
    and trained ->> 'status' = 'stale'
    and (trained ->> 'revision')::integer = 3
    and (trained ->> 'set_count')::integer = 3,
    'A stale training save must be reported as stale, with the stored revision';
  assert (select sets = 3 and session_revision = 3 and duration_minutes = 35
      and calories_burned = 60 from public.workout_logs where id = training_id),
    'A stale training save must not overwrite the newer summary';
  assert (select count(*) = 3 and count(*) filter (where set_number = 3 and reps = 4) = 1
    from public.workout_set_logs where workout_log_id = training_id),
    'A stale training save must not replace the newer sets';
  assert (select calories_burned = burned_before + 60 from public.daily_stats
    where user_id = test_user::text and date = test_date),
    'A stale training save must not change the daily totals';

  -- Lost response: the stored snapshot is sent again, later (other day, longer
  -- duration). It is confirmed as already stored and nothing is rewritten.
  trained := public.finish_training_session(test_user, training_id, 3, test_date + 2,
    gen_random_uuid(), 'FitCore training verification', 95, 60,
    jsonb_build_array(
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 1, 'weight_kg', 60, 'reps', 5),
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 2, 'weight_kg', 60, 'reps', 5),
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 3, 'weight_kg', 60, 'reps', 4)));
  assert trained ->> 'status' = 'unchanged' and (trained ->> 'revision')::integer = 3,
    'Resending the stored snapshot must be confirmed as already stored';
  assert (select count(*) = 1 from public.workout_logs
    where user_id = test_user and workout_name = 'FitCore training verification'),
    'A lost-response retry must not create a second workout';
  assert (select date = test_date and duration_minutes = 35
    from public.workout_logs where id = training_id),
    'A lost-response retry must not rewrite the stored summary';
  assert (select count(*) = 3 from public.workout_set_logs where workout_log_id = training_id),
    'A lost-response retry must not duplicate the sets';
  assert (select calories_burned = burned_before + 60 from public.daily_stats
    where user_id = test_user::text and date = test_date),
    'A lost-response retry must not double count the daily totals';

  -- Conflict: another copy of the session reached the same revision with
  -- different sets. The first save stays; the second is told it conflicts.
  trained := public.finish_training_session(test_user, training_id, 3, test_date,
    gen_random_uuid(), 'FitCore training verification', 40, 90,
    jsonb_build_array(
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 1, 'weight_kg', 100, 'reps', 3),
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 2, 'weight_kg', 100, 'reps', 3),
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 3, 'weight_kg', 100, 'reps', 3)));
  assert trained ->> 'workout_log_id' = training_id::text
    and trained ->> 'status' = 'conflict'
    and (trained ->> 'revision')::integer = 3,
    'A different snapshot at the stored revision must be reported as a conflict';
  assert (select sets = 3 and session_revision = 3 and duration_minutes = 35
      and calories_burned = 60 from public.workout_logs where id = training_id),
    'A conflicting training save must not overwrite the stored summary';
  assert (select count(*) = 3 and count(*) filter (where weight_kg = 60) = 3
    from public.workout_set_logs where workout_log_id = training_id),
    'A conflicting training save must not replace the stored sets';
  assert (select calories_burned = burned_before + 60 from public.daily_stats
    where user_id = test_user::text and date = test_date),
    'A conflicting training save must not change the daily totals';
  -- The same sets under another name are a different snapshot too.
  trained := public.finish_training_session(test_user, training_id, 3, test_date,
    gen_random_uuid(), 'FitCore renamed training verification', 35, 60,
    jsonb_build_array(
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 1, 'weight_kg', 60, 'reps', 5),
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 2, 'weight_kg', 60, 'reps', 5),
      jsonb_build_object('exercise_name', 'Squat', 'set_number', 3, 'weight_kg', 60, 'reps', 4)));
  assert trained ->> 'status' = 'conflict'
    and (select workout_name = 'FitCore training verification'
      from public.workout_logs where id = training_id),
    'A renamed snapshot at the stored revision must conflict and change nothing';

  -- A workout that was not saved from a training session (the quick-log row
  -- above) is never replaced, whatever revision is offered.
  trained := public.finish_training_session(test_user, workout_id, 7, test_date,
    null, 'FitCore training verification', 1, 1, '[]'::jsonb);
  assert trained ->> 'status' = 'conflict'
    and (select workout_name = 'FitCore migration verification' and session_revision is null
      from public.workout_logs where id = workout_id),
    'A workout that is not a training session must not be replaced';

  begin
    perform public.finish_training_session(test_user, failed_training_id, 0, test_date,
      null, 'FitCore failed training verification', 10, 10,
      jsonb_build_array(
        jsonb_build_object('exercise_name', 'Squat', 'set_number', 1, 'reps', 5),
        jsonb_build_object('exercise_name', 'Squat', 'set_number', 'not-a-number')));
    raise exception 'A malformed set must abort the whole training save';
  exception when invalid_text_representation then null;
  end;
  assert not exists(select 1 from public.workout_logs where id = failed_training_id),
    'A failed set insert must not leave a summary row behind';
  assert not exists(select 1 from public.workout_set_logs where workout_log_id = failed_training_id),
    'A failed set insert must not leave partial sets behind';

  -- A newer revision does not help another user take over the id.
  begin
    perform public.finish_training_session(gen_random_uuid(), training_id, 99, test_date,
      null, 'FitCore training verification', 1, 1, '[]'::jsonb);
    raise exception 'Another user must not be able to rewrite the workout';
  exception when invalid_parameter_value then null;
  end;
  assert (select count(*) = 3 from public.workout_set_logs where workout_log_id = training_id)
    and (select session_revision = 3 from public.workout_logs where id = training_id),
    'A rejected rewrite must leave the stored session untouched';

  -- Record has the last word over a saved session. While the saved workout is
  -- untouched, the identical retry is still confirmed.
  perform public.finish_training_session(test_user, edited_training_id, 1, test_date,
    null, 'FitCore record-edit verification', 20, 30,
    jsonb_build_array(
      jsonb_build_object('exercise_name', 'Row', 'set_number', 1, 'weight_kg', 40, 'reps', 8)));
  trained := public.finish_training_session(test_user, edited_training_id, 1, test_date,
    null, 'FitCore record-edit verification', 20, 30,
    jsonb_build_array(
      jsonb_build_object('exercise_name', 'Row', 'set_number', 1, 'weight_kg', 40, 'reps', 8)));
  assert trained ->> 'status' = 'unchanged',
    'An identical retry of an untouched session must still be confirmed';

  -- Edited in Record: the same retry is no longer "unchanged", and a newer
  -- training revision does not overwrite the edit.
  update public.workout_logs set duration_minutes = 45, calories_burned = 80
    where id = edited_training_id;
  trained := public.finish_training_session(test_user, edited_training_id, 1, test_date,
    null, 'FitCore record-edit verification', 20, 30,
    jsonb_build_array(
      jsonb_build_object('exercise_name', 'Row', 'set_number', 1, 'weight_kg', 40, 'reps', 8)));
  assert trained ->> 'status' = 'conflict',
    'A training retry after a Record edit must not be reported as unchanged';
  trained := public.finish_training_session(test_user, edited_training_id, 2, test_date,
    null, 'FitCore record-edit verification', 25, 60,
    jsonb_build_array(
      jsonb_build_object('exercise_name', 'Row', 'set_number', 1, 'weight_kg', 40, 'reps', 8),
      jsonb_build_object('exercise_name', 'Row', 'set_number', 2, 'weight_kg', 40, 'reps', 8)));
  assert trained ->> 'status' = 'conflict'
    and (select duration_minutes = 45 and calories_burned = 80 and sets = 1 and session_revision = 1
      from public.workout_logs where id = edited_training_id)
    and (select count(*) = 1 from public.workout_set_logs where workout_log_id = edited_training_id),
    'A newer training save must not overwrite a workout edited in Record';

  -- Deleted in Record: no retry, identical or newer, brings the workout back.
  perform public.finish_training_session(test_user, deleted_training_id, 1, test_date,
    null, 'FitCore record-delete verification', 20, 30,
    jsonb_build_array(
      jsonb_build_object('exercise_name', 'Row', 'set_number', 1, 'weight_kg', 40, 'reps', 8)));
  delete from public.workout_logs where id = deleted_training_id;
  trained := public.finish_training_session(test_user, deleted_training_id, 1, test_date,
    null, 'FitCore record-delete verification', 20, 30,
    jsonb_build_array(
      jsonb_build_object('exercise_name', 'Row', 'set_number', 1, 'weight_kg', 40, 'reps', 8)));
  assert trained ->> 'status' = 'conflict'
    and not exists(select 1 from public.workout_logs where id = deleted_training_id),
    'A training retry must not re-create a workout deleted in Record';
  trained := public.finish_training_session(test_user, deleted_training_id, 2, test_date,
    null, 'FitCore record-delete verification', 25, 60,
    jsonb_build_array(
      jsonb_build_object('exercise_name', 'Row', 'set_number', 1, 'weight_kg', 40, 'reps', 8),
      jsonb_build_object('exercise_name', 'Row', 'set_number', 2, 'weight_kg', 40, 'reps', 8)));
  assert trained ->> 'status' = 'conflict'
    and not exists(select 1 from public.workout_logs where id = deleted_training_id),
    'A newer training save must not re-create a workout deleted in Record';

  -- Column privileges on workout_logs: signed-in clients may write the normal
  -- workout fields of their own rows and delete them, but only service-role
  -- saves may set the training-session columns.
  assert has_table_privilege('authenticated', 'public.workout_logs', 'select')
    and has_table_privilege('authenticated', 'public.workout_logs', 'delete'),
    'Signed-in users must keep read and delete access to workout_logs';
  assert not has_table_privilege('authenticated', 'public.workout_logs', 'insert')
    and not has_table_privilege('authenticated', 'public.workout_logs', 'update'),
    'Signed-in users must not hold whole-table write access to workout_logs';
  assert (select count(*) = 2 from pg_catalog.pg_attribute as a
    where a.attrelid = 'public.workout_logs'::regclass and not a.attisdropped
      and a.attname in ('session_revision', 'session_snapshot_hash')),
    'Both training-session columns must exist';
  assert not exists(
    select 1
      from pg_catalog.pg_attribute as a
      cross join unnest(array['authenticated', 'anon', 'public']) as r(role_name)
      cross join unnest(array['insert', 'update']) as p(privilege)
     where a.attrelid = 'public.workout_logs'::regclass and not a.attisdropped
       and a.attname in ('session_revision', 'session_snapshot_hash')
       and has_column_privilege(r.role_name, a.attrelid, a.attname, p.privilege)),
    'Clients must not be able to set the training-session columns';
  assert not exists(
    select 1
      from pg_catalog.pg_attribute as a
      cross join unnest(array['insert', 'update']) as p(privilege)
     where a.attrelid = 'public.workout_logs'::regclass and a.attnum > 0 and not a.attisdropped
       and a.attname not in ('session_revision', 'session_snapshot_hash')
       and not has_column_privilege('authenticated', a.attrelid, a.attname, p.privilege)),
    'Signed-in users must be able to write every normal workout field';
  assert not exists(
    select 1
      from pg_catalog.pg_attribute as a
      cross join unnest(array['insert', 'update', 'select']) as p(privilege)
     where a.attrelid = 'public.workout_logs'::regclass and a.attnum > 0 and not a.attisdropped
       and not has_column_privilege('service_role', a.attrelid, a.attname, p.privilege)),
    'The service role must be able to write every workout_logs column';
  assert has_table_privilege('service_role', 'public.workout_logs', 'delete'),
    'The service role must be able to delete workouts';

  -- The same, as a signed-in user actually writing their own rows.
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.workout_logs (
    id, user_id, date, workout_name, sets, duration_minutes, calories_burned)
    values (client_workout_id, test_user, test_date, 'FitCore client write verification', 3, 15, 70);
  update public.workout_logs
    set workout_name = 'FitCore client write verification (edited)', sets = 4,
        duration_minutes = 20, calories_burned = 90
    where id = client_workout_id;
  assert (select workout_name like '%(edited)' and sets = 4 and duration_minutes = 20
      and session_revision is null and session_snapshot_hash is null
    from public.workout_logs where id = client_workout_id),
    'A signed-in user must be able to create and edit a normal workout';
  begin
    insert into public.workout_logs (id, user_id, date, workout_name, session_revision)
      values (gen_random_uuid(), test_user, test_date, 'FitCore client write verification', 1);
    raise exception 'A client insert must not set session_revision';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.workout_logs (id, user_id, date, workout_name, session_snapshot_hash)
      values (gen_random_uuid(), test_user, test_date, 'FitCore client write verification',
        repeat('a', 64));
    raise exception 'A client insert must not set session_snapshot_hash';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.workout_logs set session_revision = 99 where id = training_id;
    raise exception 'A client update must not set session_revision';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.workout_logs set session_snapshot_hash = repeat('a', 64) where id = training_id;
    raise exception 'A client update must not set session_snapshot_hash';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.workout_logs set session_revision = null, session_snapshot_hash = null
      where id = client_workout_id;
    raise exception 'A client update must not clear the session columns';
  exception when insufficient_privilege then null;
  end;
  -- A workout saved from a training session stays editable and deletable by
  -- its owner; only its session columns are out of reach.
  update public.workout_logs set duration_minutes = 36 where id = training_id;
  assert (select duration_minutes = 36 and session_revision = 3
    from public.workout_logs where id = training_id),
    'A signed-in user must be able to edit the normal fields of a training workout';
  delete from public.workout_logs where id in (training_id, client_workout_id);
  assert not exists(select 1 from public.workout_logs
    where id in (training_id, client_workout_id)),
    'A signed-in user must be able to delete their own workouts';
  perform set_config('role', 'service_role', true);
  assert (select closures.reason = 'deleted' from public.training_session_closures as closures
    where closures.request_id = training_id),
    'A workout deleted by its owner must close the training session';

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
  assert not has_function_privilege('anon',
    'public.finish_training_session(uuid, uuid, integer, date, uuid, text, integer, integer, jsonb)',
    'execute'),
    'Anonymous training saves must be denied';
end;
$test$;

rollback;
select 'mixed write, training save, retry, stale-write and conflict rejection, Record edit and delete protection, totals, rollback and user isolation passed; synthetic logs rolled back' as validation;
