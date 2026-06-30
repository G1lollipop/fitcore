-- Make the daily water target user-configurable.
-- Previously the goal was hard-coded to 2500 ml in the app; this stores it on
-- the user's profile so it can be edited in Settings and read by the dashboard.

alter table public.user_settings
  add column if not exists water_goal integer not null default 2500;
