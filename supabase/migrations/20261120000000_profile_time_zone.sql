-- Each person's IANA time zone ("America/Los_Angeles"), learned from the
-- browser. Pages render on the server in UTC; dates are shown and export
-- filters run in this zone. The `tz` cookie wins when present; this column
-- covers requests before it exists (a first visit from a new device).
-- Written by the middleware under the existing "profiles: update own" policy.

alter table public.profiles
  add column time_zone text
    check (time_zone is null or (char_length(time_zone) between 1 and 64));
