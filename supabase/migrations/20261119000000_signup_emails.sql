-- Sign-up emails sent from group invite links (TASKS 13.2b).
--
-- People arriving from an invite link get a sign-up email Radar sends itself;
-- their account is created only when they click it. This table rate-limits
-- those sends per network address and per email. It holds keyed one-way
-- hashes, never the raw values, and rows older than a day are deleted on the
-- next send. No policies: only the service role (the sign-in endpoint) uses it.

create table public.signup_emails (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  email_hash text not null,
  sent_at timestamptz not null default now()
);

create index signup_emails_ip_idx on public.signup_emails (ip_hash, sent_at);
create index signup_emails_email_idx on public.signup_emails (email_hash, sent_at);

alter table public.signup_emails enable row level security;

-- Does an account exist for this email? Used by /auth/signup so a sign-up
-- link never signs anyone into an account that already existed.
-- Service role only.
create function public.auth_user_exists (p_email text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (select 1 from auth.users where lower(email) = lower(p_email));
$$;

revoke all on function public.auth_user_exists (text) from public, anon, authenticated;
grant execute on function public.auth_user_exists (text) to service_role;
