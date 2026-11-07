-- Schema v1: personal archive (users, links, saves, categories, ingest queue).
-- Privacy model: RLS enforces the archive layer — a user sees only their own
-- saves; links are shared rows (one per canonical URL system-wide) readable by
-- any signed-in user but written only by the service role.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user. Display name only — no public profile.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  -- default group for the one-tap share flow ("last used group"); FK added in
  -- schema v2 when groups exist
  last_shared_group_id uuid,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select using (auth.uid () = id);

create policy "profiles: update own" on public.profiles
  for update using (auth.uid () = id);

-- Auto-create a profile when an auth user is created.
create function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user ();

-- ---------------------------------------------------------------------------
-- api_tokens: per-user tokens for the Shortcut / bookmarklet. Only the hash is
-- stored; the plaintext is shown once at creation.
-- ---------------------------------------------------------------------------
create table public.api_tokens (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  label text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index api_tokens_user_idx on public.api_tokens (user_id);

alter table public.api_tokens enable row level security;

create policy "api_tokens: read own" on public.api_tokens
  for select using (auth.uid () = user_id);

create policy "api_tokens: delete own" on public.api_tokens
  for delete using (auth.uid () = user_id);

-- Creation happens server-side (service role) so the hash is computed there.

-- ---------------------------------------------------------------------------
-- categories: fixed taxonomy, 20–30 rows, seeded by migration. Embeddings of
-- the descriptions are filled by a one-off job (service role).
-- ---------------------------------------------------------------------------
create table public.categories (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  description text not null,
  embedding vector (1536)
);

alter table public.categories enable row level security;

create policy "categories: readable by all" on public.categories
  for select using (true);

-- ---------------------------------------------------------------------------
-- links: one row per canonical URL across the whole system. Written only by
-- the service role (save endpoint + ingest worker).
-- status: pending → ready | failed; 'held' reserved for moderation holds.
-- ---------------------------------------------------------------------------
create table public.links (
  id uuid primary key default gen_random_uuid (),
  canonical_url text not null unique,
  title text,
  source text,
  lead_text text,
  full_text text,
  html_snapshot text,
  metadata jsonb not null default '{}'::jsonb,
  category_id smallint references public.categories (id),
  embedding vector (1536),
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed', 'held')),
  first_seen_at timestamptz not null default now(),
  archived_at timestamptz,
  search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(lead_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(full_text, '')), 'C')
  ) stored
);

create index links_source_idx on public.links (source);
create index links_search_idx on public.links using gin (search_tsv);
create index links_embedding_idx on public.links
  using hnsw (embedding vector_cosine_ops);

alter table public.links enable row level security;

create policy "links: readable when signed in" on public.links
  for select using (auth.role () = 'authenticated');

-- No insert/update/delete policies: service role only.

-- ---------------------------------------------------------------------------
-- saves: User × Link. The archive layer. Private note never leaves this table;
-- sentence is the one line used when shared.
-- ---------------------------------------------------------------------------
create table public.saves (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  link_id uuid not null references public.links (id) on delete cascade,
  original_url text not null,
  note text,
  sentence text,
  wayback_requested boolean not null default false,
  wayback_saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, link_id)
);

create index saves_user_created_idx on public.saves (user_id, created_at desc);
create index saves_link_idx on public.saves (link_id);

alter table public.saves enable row level security;

create policy "saves: all own" on public.saves
  for all using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

create function public.set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger saves_set_updated_at
before update on public.saves
for each row execute function public.set_updated_at ();

-- ---------------------------------------------------------------------------
-- ingest_jobs: DB-table queue for the ingest worker. Service role only.
-- One job per link (idempotent on canonical URL).
-- ---------------------------------------------------------------------------
create table public.ingest_jobs (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.links (id) on delete cascade unique,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ingest_jobs_pending_idx on public.ingest_jobs (run_after)
  where status = 'queued';

alter table public.ingest_jobs enable row level security;
-- No policies: service role only.

create trigger ingest_jobs_set_updated_at
before update on public.ingest_jobs
for each row execute function public.set_updated_at ();
