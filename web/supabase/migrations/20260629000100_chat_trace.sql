-- Fitcore: lightweight per-turn observability trace for the AI coach.
--
-- Run in Supabase SQL Editor (Dashboard → SQL) or via CLI link.
--
-- One row per assistant turn capturing stage latencies (plan / tools /
-- generation), total latency, a coarse token estimate, the agent mode, and the
-- tools used. Feeds a cost / latency dashboard. Best-effort: the chat route
-- inserts this AFTER answering, so a failed insert never affects the reply.

create table if not exists public.chat_trace (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  message_id uuid references public.chat_messages (id) on delete set null,
  conversation_id text,
  mode text,
  tools_used text[] not null default '{}',
  retrieval_k int,
  latency_ms int,
  plan_ms int,
  tools_ms int,
  generation_ms int,
  prompt_chars_approx int,
  completion_chars int,
  completion_tokens_approx int,
  created_at timestamptz not null default now()
);

comment on table public.chat_trace is
  'Fitcore: per-turn AI coach latency/token trace for the observability dashboard.';

create index if not exists chat_trace_user_idx on public.chat_trace (user_id);
create index if not exists chat_trace_created_idx on public.chat_trace (created_at);

-- Service-role-only access, like every other Fitcore table.
alter table public.chat_trace enable row level security;

grant select, insert, update, delete on table public.chat_trace to service_role;
