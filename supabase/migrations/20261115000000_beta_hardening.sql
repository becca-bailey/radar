-- Beta hardening (2026-11-15).
--
-- 1. Links were readable by any signed-in user, so with open sign-up anyone
--    could list every URL (and archived text) saved by anyone. Now a link is
--    readable only if you saved it, or it was shared to a group you're in
--    (as a recommendation or in a published edition).
-- 2. beta_invites: the emails allowed to create an account. No policies, so
--    only the service role (the sign-in endpoint, the admin page) can touch it.
-- 3. delete_orphan_links: account deletion removes archived links nobody else
--    still references. Service role only.

drop policy "links: readable when signed in" on public.links;

create policy "links: saved or shared with you" on public.links
  for select using (
    exists (
      select 1 from public.saves s
      where s.link_id = links.id and s.user_id = auth.uid ()
    )
    or exists (
      select 1 from public.recommendations r
      where r.link_id = links.id and public.is_group_member (r.group_id, auth.uid ())
    )
    or exists (
      select 1 from public.edition_links el
      join public.editions e on e.id = el.edition_id
      where el.link_id = links.id and public.is_group_member (e.group_id, auth.uid ())
    )
  );

create index if not exists edition_links_link_idx on public.edition_links (link_id);

create table public.beta_invites (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.beta_invites enable row level security;

create function public.delete_orphan_links (link_ids uuid[])
returns integer
language sql
as $$
  with gone as (
    delete from public.links l
    where l.id = any (link_ids)
      and not exists (select 1 from public.saves s where s.link_id = l.id)
      and not exists (select 1 from public.edition_links el where el.link_id = l.id)
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke execute on function public.delete_orphan_links (uuid[]) from public, anon, authenticated;
