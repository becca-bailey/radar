# Build order and tasks

Build-first plan: Phases 1–3 of [PLAN.md](PLAN.md) as one continuous build; user
testing (the Phase 0 concierge protocol) runs later against the real app. Each stage
leaves the app deployable. Sizes: S ≲ half day, M 1–2 days, L 3–5 days.

**Stack:** Astro + React islands + TypeScript on Netlify; Supabase (Postgres +
pgvector + Auth + RLS). Embeddings via API with no-training terms.

**Design constraints:**
- Visual direction: handmade, maximalist, modern (see Becca's reference examples —
  cream background, chunky playful display type, organic shapes, candy accents).
- Stay generic beyond articles: **product recommendations must work later** without
  schema changes. Links carry `kind` (article/product/video/audio/other) from
  OpenGraph/schema.org at ingest; metadata keeps og:image and price; ranking and
  editions are kind-agnostic. Product UI treatment is deferred, not precluded.

## Stage 1 — Walking skeleton

- [x] **1.1 (S)** Scaffold: Astro + React + TS, Netlify adapter, Supabase local dev, vitest, CI.
- [x] **1.2 (M)** Schema v1 + RLS: `users`, `links`, `saves`, `categories`, `ingest_jobs`; pgvector. Users see only their own saves; `links` are shared rows, service-role write only.
- [x] **1.3 (M)** Auth: Supabase email magic link; display name only. (Apple/Google OAuth in 6.5.)
- [x] **1.4 (M)** Canonicalization module, pure + fixture-tested: redirects, AMP→canonical, `rel=canonical`, tracking-param strip, normalization. Original URL kept on the Save.
- [x] **1.5 (M)** `POST /api/saves`: URL + optional note/sentence; fast insert; per-user API token for Shortcut/bookmarklet.
- [x] **1.6 (S)** Archive list UI, mobile-first: reverse-chron, title/source/date, edit note.

## Stage 2 — Ingest pipeline

- [x] **2.1 (L)** Ingest worker (DB-table queue, idempotent on canonical URL): fetch with caps → Readability extraction → text + cleaned HTML snapshot → ready. Retries; failures read "couldn't archive, saved the link."
- [x] **2.2 (M)** Source derivation: registrable domain via public-suffix list + multi-tenant overrides (Substack, Medium, YouTube, Bluesky).
- [x] **2.3 (M)** Embedding + categorization: title + lead embedding, nearest category above threshold, LLM fallback below, cached forever. Seed 20–30 category taxonomy.
- [x] **2.4 (M)** Search: Postgres FTS + pgvector cosine over own archive, merged, one box.

## Stage 3 — Trust features

- [x] **3.1 (M)** Export: markdown + JSON incl. full text, one button.
- [x] **3.2 (S)** Privacy page: what leaves the server, which providers, what's stored.
- [x] **3.3 (S)** Bookmarklet + iOS Shortcut posting to `/api/saves`.
- [x] **3.4 (S)** Wayback Save Page Now, opt-in per save, never for login-gated pages.

## Stage 4 — Groups

- [x] **4.1 (M)** Schema v2 + RLS: `groups`, `memberships`, `invite_links`, `recommendations`. A recommendation exposes link + sentence + (if enabled) name — never the Save or note.
- [x] **4.2 (M)** Group CRUD + settings: cadence, K, names visible, contribute upward (default off), categories toggle.
- [x] **4.3 (M)** Invite links: one active token, weekly use cap with pause + owner notice, instant rotation, one-tap join.
- [x] **4.4 (S)** Member list + remove (future editions only; past editions immutable).
- [x] **4.5 (M)** Share flow: at save time (default last-used group) or later from archive; prompt for public sentence.

## Stage 5 — Editions and ranking

- [x] **5.1 (L)** Edition composition as a pure function with golden-file tests: `score = p(L) × (1 + β·w(s))`, per-source cap, ~20% reserved New-pool slots, one label each, minimum evidence (r≥2, or r≥1 under 6 active members).
- [x] **5.2 (M)** Source stats: rolling 90-day `a(s)`/`A` aggregates feeding `w(s)` and the small-source percentile.
- [x] **5.3 (M)** Edition builder scheduled function: immutable edition rows per group cadence; finite edition page.
- [x] **5.4 (M)** Edition email via transactional provider (Resend). One email per edition, nothing else.
- [x] **5.5 (M)** Roundup export: markdown with blurbs + "recommended by N readers", attribution opt-in per recommendation.

## Stage 6 — Public layer, moderation, polish

- [x] **6.1 (M)** Public layer: g=3 independent groups (pairwise member overlap < 30%), public category pages, counts only.
- [x] **6.2 (M)** Moderation: Safe Browsing + blocklist at ingest with hold-for-review; flag-and-review queue; rate limits; single-source concentration down-weight.
- [x] **6.3 (S)** Public "how ranking works" page.
- [x] **6.4 (M)** Metrics dashboard (visx): cohort surfacing rate, top-10 concentration, distinct sources per edition.
- [ ] **6.5 (S)** Apple + Google OAuth (needs developer credentials).

## Stage 7 — Beta launch (small invited group)

Done (2026-11-14/15, not yet deployed):

- [x] **7.1 (M)** Export page: pick saves by date range, sort, copy as a list or download Markdown/CSV/JSON.
- [x] **7.2 (M)** Personal Explore: lenses (saved searches) stacked with previews and thumbnails; public page moved to `/highlights`.
- [x] **7.3 (M)** Links readable only when you saved them or they were shared to your group (was: any signed-in user).
- [x] **7.4 (S)** Invite-only sign-up: `beta_invites` + `ADMIN_EMAILS`, managed at `/admin/invites`.
- [x] **7.5 (S)** Account deletion in Settings, with cleanup of archived links nobody else saved.
- [x] **7.6 (S)** Profile menu in the nav; setup page linked from the save box, empty archive and footer.

Before inviting anyone (Becca, outside the code):

- [ ] **7.7 (S)** Custom SMTP for sign-in emails (Resend or similar). Supabase's built-in sender sends 2 emails/hour and only to org members, so testers get nothing without this. Then raise the email rate limit under Authentication → Rate Limits.
- [ ] **7.8 (S)** Push migrations to prod: `npx supabase db push --remote` (lenses + beta hardening).
- [ ] **7.9 (S)** Netlify env: set `ADMIN_EMAILS` (your email) and `SAFE_BROWSING_API_KEY` (the malware check at ingest is skipped without it).
- [ ] **7.10 (S)** Supabase dashboard: turn off "Allow new users to sign up". Invites keep working (accounts are created through the admin API); this closes the direct sign-up endpoint.
- [ ] **7.11 (S)** Check the Supabase plan: free tier caps the database at 500 MB and pauses after a week idle. Full text + snapshots per link will grow fast.
- [ ] **7.12 (S)** Deploy (`npx netlify deploy --build --prod`), then invite testers at `/admin/invites`.

Verify after deploy:

- [ ] **7.13 (S)** Click through what wasn't checked locally: `/admin/invites` (needs `ADMIN_EMAILS`), Sign out from the profile menu, a lens's "See all" link (needs more than 4 matches), rich-text paste from Copy list into Substack.

Should do during the beta:

- [ ] **7.14 (M)** Export paging: load 50 at a time, keep selection across loads, "select all N matching" exports on the server from the same filters. Move title sort into the database (it's only correct within the first 500 today).
- [ ] **7.15 (S)** Home archive paging: it shows the newest 200 with no "load more".
- [ ] **7.16 (S)** Block private and localhost addresses in `fetchPage`, including after redirects (SSRF).
- [ ] **7.17 (S)** Error monitoring (Sentry or similar), or at least a failed-ingest count on an admin page.
- [ ] **7.18 (S)** Feedback link in the footer (a mailto is enough).
- [ ] **7.20 (M)** Dates and time zones. Pages render on Netlify in UTC, so dates are UTC everywhere: a save made at 8pm Pacific shows as the next day, the export date filters (`/export`, `/groups/:id/export`) treat "from/to" as UTC days, and download filenames use the UTC date. Some formatters pin `timeZone: 'UTC'`, others use the server's zone by accident. Fix: learn each person's zone from the browser (a cookie set on load, saved to `profiles.time_zone` so it holds before the cookie is set, e.g. on a first visit from a new device), format every date through one helper in `src/lib/dates.ts`, and turn local "from/to" days into UTC instants for queries. Show "today"/"yesterday" for recent saves while there.

## Stage 8 — Simpler groups (PLAN.md §0)

Done (2026-11-16, migration `20261116000000_simplify_groups.sql`, not yet pushed):

- [x] **8.1 (M)** Removed scheduled editions, edition emails (Resend), the public layer (`/highlights`, `/ranking`, `/dashboard`), the flag queue, and all group settings except name and invite link.
- [x] **8.2 (S)** Anonymous shares: no names or credit anywhere; members see only their own membership row and no other profiles; display name setting removed.
- [x] **8.3 (M)** Shares replace recommendations: `shares (save_id, group_id, shared_at, removed_at)`, one save to many groups, note read from the save, no user id on the row. Members read groups only through security-definer `group_pool()` (per-link count + notes, same keyword + semantic search as the archive). Save cards show which groups a save is in, with unshare.
- [x] **8.3b (M)** Group lenses: `lenses.group_id`, owner manages, members see them stacked on the group page.
- [x] **8.4 (M)** Group export at `/groups/:id/export`: date range, most shared / newest / oldest, copy list or Markdown/CSV/JSON with "shared by N".
- [x] **8.5 (S)** Moderation: owner removes a link (marks its shares in that group removed, blocks re-sharing there), with a restore list. Saves are never touched.

Before groups ship:

- [ ] **7.19 (S)** Deleting an account that owns a group deletes the group for every member (`groups.owner_id` cascades). Decide on ownership transfer or a block.
- [x] **8.8 (M)** Shortcut asks for a note and, when you're in groups, which group to share to ("Just save" first). `GET /api/groups` gives the menu; `share_to` on `POST /api/saves` shares after saving. Tokens can now share to your groups.
- [ ] **8.9 (S)** On a Mac: `python3 scripts/make-shortcut.py` to sign the new Shortcut, then try it on an iPhone with no groups, with groups, and with a blank note. Deploy the server first: the new file calls `/api/shortcut-options` (on `claude/ux-pass`; `/api/groups` before it), and the old file keeps working against the new server.
- [ ] **8.7 (S)** Click through locally with `GROUPS_ENABLED=true`: create group, join, share, add lenses, remove/restore a link, export.

Possible later:

- Display names, opt-in credit in exports, and name visibility inside a group.
- Removing a member (needs some way for the owner to tell members apart).
- Marking exported links as used, so next week's export skips them.

## Stage 10 — UX pass (branch `claude/ux-pass`, migration `20261117000000_ux_pass.sql`)

An experiment from a UX review: help people come back to read, and give group members a reason to return without notifications.

- [x] **10.1** Home: the paste box folds to "+ Save a link" after 5 saves; one save from 30+ days ago resurfaces at the top ("From 3 months ago"), a different one each day.
- [x] **10.2** Topic chips suggest themselves as lenses ("Keep “AI” as a lens →"). Search already offered "Save as a lens".
- [x] **10.3** Save cards: Share moved into the ⋯ menu as a dialog ("Knitters will see this note"); the note editor says where the note is visible; "Shared to" chips only when shared; failed archives get an inline "Try archiving again".
- [x] **10.4** Undo instead of confirm: deleting goes to a one-day trash (`trash_save` / `restore_save`) with "Deleted. Undo"; a fresh web save offers "Saved. Undo".
- [x] **10.5** Groups: "4 new" on the Groups nav link and per group (`my_group_news`); "New since your last visit" divider on the group page (`mark_group_visited`).
- [x] **10.6** Picked: after exporting, a group owner can mark links picked; sharers see "picked" on their share chip, the group sees a Picked badge. Anonymous either way.
- [x] **10.7** Optional nickname per group (`memberships.display_name`): shown as "shared by Ana and 2 others" in that group only. Exports still carry counts, not names.
- [x] **10.8** Export pages default to "new since your last export" (recorded on copy/download), with "Show everything".
- [x] **10.9** Settings → iPhone Shortcut: turn off the note question. The Shortcut now reads `GET /api/shortcut-options` (`ask_note`, `choices`); needs re-signing on a Mac (see 8.9).
- [ ] **10.10** Try it on a phone with real data before merging; decide per item what stays.

## Capture beyond iOS

Today: the iOS Shortcut, the desktop bookmarklet and the paste box. Everything goes through `POST /api/saves`, so each of these is mostly packaging around that endpoint.

- [ ] **9.1 (M)** Android: make the site an installable PWA with a Web Share Target (manifest `share_target` posting to `/save`), so Radar shows up in Android's share sheet. Signed-in session, no token needed. Add an Android section to `/setup`.
- [ ] **9.2 (M)** Browser extension (Chrome + Firefox, one WebExtension): toolbar button and right-click "Save link to Radar", optional note, using an API token from Settings. Replaces the bookmarklet where sites' content security policies block it.
- [ ] **9.3 (M)** Save by email: a private per-user address (e.g. `save+<token>@…`) via the email provider's inbound webhook. Saves every link in the message; the subject or body becomes the note. Works from any mail app, desktop or phone, including newsletters you forward.
- [ ] **9.4 (S)** `/setup`: one section per method, chosen by detected platform, so each person sees their own first.

## Deferred

- Phase 4: native share extension (spike Expo plugin vs Swift), archive theme clustering, year-end view, data-story tooling.
- Phase 0 as validation: interviews + six-week group test, run against the real app.
