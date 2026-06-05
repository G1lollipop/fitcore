-- Fitcore RAG: knowledge chunks + pgvector similarity search.
-- Run in Supabase SQL Editor (Dashboard → SQL) or via CLI link.
--
-- IMPORTANT: vector(768) must match the configured Gemini embedding output
-- length (gemini-embedding-001 truncated to EMBEDDING_DIM=768). If you change
-- EMBEDDING_DIM, change 768 everywhere below and recreate the table / RPC.

create extension if not exists vector;

create table if not exists public.rag_kb_chunks (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  chunk_index int not null,
  title text,
  content text not null,
  embedding vector(768) not null,
  doc_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source, chunk_index)
);

alter table public.rag_kb_chunks disable row level security;

comment on table public.rag_kb_chunks is 'Fitcore seed KB / uploaded chunks for Python RAG (pgvector).';

-- Optional: create after first ingest if index creation on empty table fails in your project.
create index if not exists rag_kb_chunks_embedding_hnsw
  on public.rag_kb_chunks
  using hnsw (embedding vector_cosine_ops);

create index if not exists rag_kb_chunks_source_idx on public.rag_kb_chunks (source);

-- RPC for PostgREST: used by RAG service (service_role).
create or replace function public.match_rag_kb_chunks(
  query_embedding vector(768),
  match_count int default 10
)
returns table (
  id uuid,
  source text,
  title text,
  content text,
  doc_metadata jsonb,
  distance double precision
)
language sql
stable
parallel safe
as $$
  select
    c.id,
    c.source,
    coalesce(nullif(trim(c.title), ''), c.source) as title,
    c.content,
    c.doc_metadata,
    (c.embedding <=> query_embedding)::double precision as distance
  from public.rag_kb_chunks c
  order by c.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 10), 50));
$$;

grant select, insert, update, delete on table public.rag_kb_chunks to service_role;

grant execute on function public.match_rag_kb_chunks(vector, int) to service_role;
