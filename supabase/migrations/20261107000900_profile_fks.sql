-- PostgREST can only embed across FKs between exposed tables. memberships and
-- recommendations referenced auth.users, so joining display names failed.
-- Every auth user has a profile (trigger), so these FKs are safe to add.

alter table public.memberships
  add constraint memberships_profile_fk
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.recommendations
  add constraint recommendations_profile_fk
  foreign key (user_id) references public.profiles (id) on delete cascade;
