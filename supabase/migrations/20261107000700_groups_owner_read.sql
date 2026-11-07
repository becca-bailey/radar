-- INSERT … RETURNING evaluates before the owner-membership trigger's row is
-- visible to the member-read policy, so creating a group as its owner failed
-- to return the row. Owners can always read their own groups.

drop policy "groups: members read" on public.groups;

create policy "groups: members read" on public.groups
  for select using (
    owner_id = auth.uid () or public.is_group_member (id, auth.uid ())
  );
