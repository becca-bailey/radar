-- Moderation (PLAN.md §9): blocklist at ingest, and flags — the one
-- interaction a non-owner can take on a link besides saving it.

create table public.blocked_hosts (
  host text primary key,
  reason text not null default '',
  created_at timestamptz not null default now()
);

alter table public.blocked_hosts enable row level security;
-- No policies: service role only.

create table public.flags (
  id uuid primary key default gen_random_uuid (),
  link_id uuid not null references public.links (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (link_id, user_id)
);

alter table public.flags enable row level security;

create policy "flags: file your own" on public.flags
  for insert with check (user_id = auth.uid ());

create policy "flags: read your own" on public.flags
  for select using (user_id = auth.uid ());
