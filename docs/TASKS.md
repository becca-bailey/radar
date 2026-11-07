# Build order and tasks

Build-first plan: Phases 1–3 of [PLAN.md](PLAN.md) as one continuous build; user
testing (the Phase 0 concierge protocol) runs later against the real app. Each stage
leaves the app deployable. Sizes: S ≲ half day, M 1–2 days, L 3–5 days.

**Stack:** Astro + React islands + TypeScript on Netlify; Supabase (Postgres +
pgvector + Auth + RLS). Embeddings via API with no-training terms.

## Stage 1 — Walking skeleton

- [ ] **1.1 (S)** Scaffold: Astro + React + TS, Netlify adapter, Supabase local dev, vitest, CI.
- [ ] **1.2 (M)** Schema v1 + RLS: `users`, `links`, `saves`, `categories`, `ingest_jobs`; pgvector. Users see only their own saves; `links` are shared rows, service-role write only.
- [ ] **1.3 (M)** Auth: Supabase email magic link; display name only. (Apple/Google OAuth in 6.5.)
- [ ] **1.4 (M)** Canonicalization module, pure + fixture-tested: redirects, AMP→canonical, `rel=canonical`, tracking-param strip, normalization. Original URL kept on the Save.
- [ ] **1.5 (M)** `POST /api/saves`: URL + optional note/sentence; fast insert; per-user API token for Shortcut/bookmarklet.
- [ ] **1.6 (S)** Archive list UI, mobile-first: reverse-chron, title/source/date, edit note.

## Stage 2 — Ingest pipeline

- [ ] **2.1 (L)** Ingest worker (DB-table queue, idempotent on canonical URL): fetch with caps → Readability extraction → text + cleaned HTML snapshot → ready. Retries; failures read "couldn't archive, saved the link."
- [ ] **2.2 (M)** Source derivation: registrable domain via public-suffix list + multi-tenant overrides (Substack, Medium, YouTube, Bluesky).
- [ ] **2.3 (M)** Embedding + categorization: title + lead embedding, nearest category above threshold, LLM fallback below, cached forever. Seed 20–30 category taxonomy.
- [ ] **2.4 (M)** Search: Postgres FTS + pgvector cosine over own archive, merged, one box.

## Stage 3 — Trust features

- [ ] **3.1 (M)** Export: markdown + JSON incl. full text, one button.
- [ ] **3.2 (S)** Privacy page: what leaves the server, which providers, what's stored.
- [ ] **3.3 (S)** Bookmarklet + iOS Shortcut posting to `/api/saves`.
- [ ] **3.4 (S)** Wayback Save Page Now, opt-in per save, never for login-gated pages.

## Stage 4 — Groups

- [ ] **4.1 (M)** Schema v2 + RLS: `groups`, `memberships`, `invite_links`, `recommendations`. A recommendation exposes link + sentence + (if enabled) name — never the Save or note.
- [ ] **4.2 (M)** Group CRUD + settings: cadence, K, names visible, contribute upward (default off), categories toggle.
- [ ] **4.3 (M)** Invite links: one active token, weekly use cap with pause + owner notice, instant rotation, one-tap join.
- [ ] **4.4 (S)** Member list + remove (future editions only; past editions immutable).
- [ ] **4.5 (M)** Share flow: at save time (default last-used group) or later from archive; prompt for public sentence.

## Stage 5 — Editions and ranking

- [ ] **5.1 (L)** Edition composition as a pure function with golden-file tests: `score = p(L) × (1 + β·w(s))`, per-source cap, ~20% reserved New-pool slots, one label each, minimum evidence (r≥2, or r≥1 under 6 active members).
- [ ] **5.2 (M)** Source stats: rolling 90-day `a(s)`/`A` aggregates feeding `w(s)` and the small-source percentile.
- [ ] **5.3 (M)** Edition builder scheduled function: immutable edition rows per group cadence; finite edition page.
- [ ] **5.4 (M)** Edition email via transactional provider (Resend). One email per edition, nothing else.
- [ ] **5.5 (M)** Roundup export: markdown with blurbs + "recommended by N readers", attribution opt-in per recommendation.

## Stage 6 — Public layer, moderation, polish

- [ ] **6.1 (M)** Public layer: g=3 independent groups (pairwise member overlap < 30%), public category pages, counts only.
- [ ] **6.2 (M)** Moderation: Safe Browsing + blocklist at ingest with hold-for-review; flag-and-review queue; rate limits; single-source concentration down-weight.
- [ ] **6.3 (S)** Public "how ranking works" page.
- [ ] **6.4 (M)** Metrics dashboard (visx): cohort surfacing rate, top-10 concentration, distinct sources per edition.
- [ ] **6.5 (S)** Apple + Google OAuth (needs developer credentials).

## Deferred

- Phase 4: native share extension (spike Expo plugin vs Swift), archive theme clustering, year-end view, data-story tooling.
- Phase 0 as validation: interviews + six-week group test, run against the real app.
- Production accounts + deploy: Supabase project, Netlify site, Resend key, embeddings API key.
