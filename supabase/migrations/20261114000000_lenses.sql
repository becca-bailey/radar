-- Lenses (2026-11-14): saved searches on the personal Explore page. A lens
-- is a name plus a search query; viewing it runs search_archive, so it keeps
-- picking up new saves without any tagging. The query embedding is stored
-- at create/edit time so viewing a lens costs no embedding call.

create table public.lenses (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null default auth.uid () references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  query text not null check (char_length(query) between 1 and 200),
  query_embedding vector (1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lenses_user_created_idx on public.lenses (user_id, created_at);

alter table public.lenses enable row level security;

create policy "lenses: all own" on public.lenses
  for all using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

create trigger lenses_set_updated_at
  before update on public.lenses
  for each row execute function public.set_updated_at ();
