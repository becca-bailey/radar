-- Display names are visible to people you share a group with (that is the
-- whole point of a display name) — still no public profiles.

create function public.shares_group_with (target uuid, viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships a
    join public.memberships b on a.group_id = b.group_id
    where a.user_id = target and b.user_id = viewer
  );
$$;

create policy "profiles: visible to shared-group members" on public.profiles
  for select using (public.shares_group_with (id, auth.uid ()));
