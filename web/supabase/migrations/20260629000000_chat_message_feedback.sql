-- Fitcore: per-message feedback (thumbs up / down) on AI coach answers.
--
-- Run in Supabase SQL Editor (Dashboard → SQL) or via CLI link.
--
-- Purpose: capture an explicit relevance signal on each assistant reply, plus a
-- snapshot of the query + retrieved citations at answer time. This feeds the
-- reranker training flywheel (rag/training/export_feedback.py): thumbs-down
-- rows become hard-negative mining queries and eval-set candidates.

create table if not exists public.chat_message_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  -- The assistant message this rating applies to. Cascades if the message is
  -- deleted (e.g. conversation cleared).
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  conversation_id text,
  -- +1 = thumbs up, -1 = thumbs down.
  rating smallint not null check (rating in (-1, 1)),
  -- Snapshot of the exchange at rating time (the message rows may change/clear).
  query text,
  answer text,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  -- One (latest) rating per user per message; upsert toggles it.
  unique (user_id, message_id)
);

comment on table public.chat_message_feedback is
  'Fitcore: thumbs up/down on AI coach answers; feeds the reranker training flywheel.';

create index if not exists chat_message_feedback_rating_idx
  on public.chat_message_feedback (rating);

create index if not exists chat_message_feedback_user_idx
  on public.chat_message_feedback (user_id);

-- Access is exclusively via the server-side service-role client
-- (web/lib/supabaseClient.ts), matching every other Fitcore table. RLS on with
-- no policies denies the anon / authenticated roles any direct access; the
-- service role bypasses RLS.
alter table public.chat_message_feedback enable row level security;

grant select, insert, update, delete on table public.chat_message_feedback to service_role;
