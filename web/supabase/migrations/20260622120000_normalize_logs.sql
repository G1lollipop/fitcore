-- FitCore Phase 3 — normalize diet/workout logs.
--
-- Moves the per-item food/workout entries out of the `daily_stats.diet_logs` /
-- `daily_stats.workout_logs` JSON columns into dedicated `food_logs` /
-- `workout_logs` tables (one row per entry → single-row insert/update, natural
-- optimistic updates). `daily_stats` is demoted to an aggregate cache (daily
-- totals + water), recomputed from the new tables on each write.
--
-- Also drops the unused set-level tracking tables (`workout_sessions`,
-- `set_logs`) that the web app never reads or writes.
--
-- NOTE: There is no data worth preserving, so this migration does not backfill
-- the new tables from the old JSON columns — it simply drops them.

create extension if not exists "pgcrypto";

-- 1. food_logs — one row per logged food item ------------------------------
create table if not exists public.food_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date not null,
  food_name  text not null,
  calories   integer not null default 0,
  protein    integer not null default 0,
  carbs      integer not null default 0,
  fat        integer not null default 0,
  logged_at  timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists food_logs_user_date_idx
  on public.food_logs (user_id, date);

-- 2. workout_logs — one row per logged workout item ------------------------
create table if not exists public.workout_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  date             date not null,
  workout_name     text not null,
  sets             integer,
  duration_minutes integer not null default 0,
  calories_burned  integer not null default 0,
  plan_id          uuid references public.workout_plans (id) on delete set null,
  day_id           uuid references public.workout_days (id) on delete set null,
  logged_at        timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create index if not exists workout_logs_user_date_idx
  on public.workout_logs (user_id, date);

-- 3. RLS — owner-only. The app uses the service-role client (which bypasses
--    RLS), but we keep parity with the other user-scoped tables for safety.
alter table public.food_logs enable row level security;
alter table public.workout_logs enable row level security;

drop policy if exists "own food_logs" on public.food_logs;
create policy "own food_logs" on public.food_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own workout_logs" on public.workout_logs;
create policy "own workout_logs" on public.workout_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. daily_stats — drop the JSON log columns + unused session link, and make
--    (user_id, date) unique so it can act as a per-day aggregate cache.
alter table public.daily_stats drop column if exists diet_logs;
alter table public.daily_stats drop column if exists workout_logs;
alter table public.daily_stats drop column if exists workout_session_id;

create unique index if not exists daily_stats_user_date_uidx
  on public.daily_stats (user_id, date);

-- 5. Drop unused set-level tracking tables (never read/written by the web app).
--    Order matters: set_logs references workout_sessions.
drop table if exists public.set_logs;
drop table if exists public.workout_sessions;
