-- Schema v2: groups, memberships, invite links, recommendations, editions.
-- Privacy (PLAN.md §5): a recommendation exposes the link + sentence + (if the
-- group shows names) the display name — never the underlying Save or note.

-- Links are URL-generic on purpose: articles today, product pages later.
-- `kind` is derived at ingest (og:type / schema.org) and lets the UI treat
-- products, videos, and articles differently without schema changes.
alter table public.links
  add column kind text not null default 'article'
  check (kind in ('article', 'product', 'video', 'audio', 'other'));

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid (),
  name text not null check (char_length(name) between 1 and 100),
  owner_id uuid not null references auth.users (id) on delete cascade,
  cadence text not null default 'weekly' check (cadence in ('daily', 'weekly', 'biweekly')),
  edition_size int not null default 10 check (edition_size between 1 and 25),
  names_visible boolean not null default true,
  contribute_public boolean not null default false,
  categories_enabled boolean not null default false,
  per_source_cap int not null default 1 check (per_source_cap in (1, 2)),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
create table public.memberships (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id);

-- Membership checks inside policies must bypass RLS to avoid recursion.
create function public.is_group_member (gid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = gid and m.user_id = uid
  );
$$;

create function public.is_group_owner (gid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.id = gid and g.owner_id = uid
  );
$$;

-- Owner gets a membership row automatically.
create function public.handle_new_group ()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.memberships (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger on_group_created
after insert on public.groups
for each row execute function public.handle_new_group ();

alter table public.groups enable row level security;

create policy "groups: members read" on public.groups
  for select using (public.is_group_member (id, auth.uid ()));

create policy "groups: create own" on public.groups
  for insert with check (owner_id = auth.uid ());

create policy "groups: owner updates" on public.groups
  for update using (owner_id = auth.uid ());

create policy "groups: owner deletes" on public.groups
  for delete using (owner_id = auth.uid ());

alter table public.memberships enable row level security;

create policy "memberships: members read" on public.memberships
  for select using (public.is_group_member (group_id, auth.uid ()));

-- Joining goes through the invite-link server flow (service role).
-- Leaving is yours; removing is the owner's.
create policy "memberships: leave or be removed" on public.memberships
  for delete using (
    user_id = auth.uid () or public.is_group_owner (group_id, auth.uid ())
  );

-- ---------------------------------------------------------------------------
-- invite links: one active per group, weekly use cap, instant rotation.
-- ---------------------------------------------------------------------------
create table public.invite_links (
  id uuid primary key default gen_random_uuid (),
  group_id uuid not null references public.groups (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid ()::text || gen_random_uuid ()::text, '-', ''),
  active boolean not null default true,
  weekly_cap int not null default 50 check (weekly_cap between 1 and 1000),
  uses_this_week int not null default 0,
  week_started_at timestamptz not null default now(),
  paused_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index invite_links_one_active_idx on public.invite_links (group_id)
  where active;

alter table public.invite_links enable row level security;

create policy "invite_links: owner manages" on public.invite_links
  for all using (public.is_group_owner (group_id, auth.uid ()))
  with check (public.is_group_owner (group_id, auth.uid ()));

-- ---------------------------------------------------------------------------
-- recommendations: Save × Group. Sentence copied at share time.
-- ---------------------------------------------------------------------------
create table public.recommendations (
  id uuid primary key default gen_random_uuid (),
  save_id uuid not null references public.saves (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  link_id uuid not null references public.links (id) on delete cascade,
  sentence text,
  attribution_ok boolean not null default false,
  created_at timestamptz not null default now(),
  unique (save_id, group_id)
);

create index recommendations_group_created_idx on public.recommendations (group_id, created_at desc);
create index recommendations_link_idx on public.recommendations (link_id);
create index recommendations_user_idx on public.recommendations (user_id);

alter table public.recommendations enable row level security;

create policy "recommendations: members read" on public.recommendations
  for select using (public.is_group_member (group_id, auth.uid ()));

create policy "recommendations: share own saves" on public.recommendations
  for insert with check (
    user_id = auth.uid ()
    and public.is_group_member (group_id, auth.uid ())
    and exists (
      select 1 from public.saves s
      where s.id = save_id and s.user_id = auth.uid () and s.link_id = link_id
    )
  );

create policy "recommendations: unshare own or owner removes" on public.recommendations
  for delete using (
    user_id = auth.uid () or public.is_group_owner (group_id, auth.uid ())
  );

create policy "recommendations: edit own" on public.recommendations
  for update using (user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- editions: materialized, immutable once published.
-- ---------------------------------------------------------------------------
create table public.editions (
  id uuid primary key default gen_random_uuid (),
  group_id uuid not null references public.groups (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  published_at timestamptz not null default now(),
  edition_size int not null,
  active_members int not null,
  unique (group_id, period_start)
);

create table public.edition_links (
  edition_id uuid not null references public.editions (id) on delete cascade,
  position int not null,
  link_id uuid not null references public.links (id),
  label text not null check (label in ('hot', 'first_time', 'small_source', 'rising')),
  score real not null,
  recommender_count int not null,
  proportion real not null,
  -- Snapshots, so past editions stay intact whatever happens later.
  title text,
  canonical_url text not null,
  source text,
  sentences jsonb not null default '[]'::jsonb,
  recommender_names jsonb not null default '[]'::jsonb,
  primary key (edition_id, position)
);

alter table public.editions enable row level security;
alter table public.edition_links enable row level security;

create policy "editions: members read" on public.editions
  for select using (public.is_group_member (group_id, auth.uid ()));

create policy "edition_links: members read" on public.edition_links
  for select using (
    exists (
      select 1 from public.editions e
      where e.id = edition_id and public.is_group_member (e.group_id, auth.uid ())
    )
  );

-- Editions are built by the service role; no user write policies.

-- profiles.last_shared_group_id gets its FK now that groups exist.
alter table public.profiles
  add constraint profiles_last_shared_group_fk
  foreign key (last_shared_group_id) references public.groups (id) on delete set null;
