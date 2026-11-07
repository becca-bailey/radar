# Link Share: Plan

A reading archive that happens to be shareable, not a sharing app that happens to keep a copy.

This document is the working plan for a new project. It is written so that a Claude Code session can pick it up cold: the premise, the non-negotiables, the data model, the ranking rules, the research to do before building, and the order to build in. Working name is undecided; "the app" below means this product.

---

## 1. Premise

People read things they love and have nowhere good to put them. Bookmark managers fail because managing the manager is a job. Social platforms turn sharing into performance and reading into scrolling.

The app does three things, in this order:

1. **Save.** Every link goes to the user's own archive first. Full text captured, searchable, never filed. Private by default, exportable always.
2. **Share.** Optionally, the same save goes to one or more groups with a single sentence of why.
3. **Surface.** Groups publish finite editions. Editions aggregate into public categories through a ranking designed to promote new and small sources alongside popular ones.

Useful with one user. Fun with ten. Works with the whole internet.

## 2. Non-negotiables

These are product decisions, already made. Do not reopen them in implementation without flagging it.

- **Finite editions.** A group publishes a fixed number of links per period. When you've seen them, you're done. No infinite scroll anywhere.
- **No comments, no replies, no reactions, no follows, no profiles.** A recommendation is a link plus one sentence. That sentence is the end of it.
- **Personal archive first.** Saving never requires sharing. The archive is free for everyone and never gated by group membership.
- **Export always on.** Markdown and JSON, including archived full text, from day one.
- **Transparent ranking.** Every surfaced link shows why it is there (a label). The ranking method is documented on a public page.
- **Layered privacy.** The archive sees everything. A group sees the link and the sentence. The public layer sees counts. Nothing flows upward without an explicit setting.
- **No ads. No training on content.** If a model provider is used, its terms must exclude training, and the privacy page says which provider and what is sent.
- **Platform-agnostic membership.** Groups are joined by invite link. The app never syncs with Substack, Patreon, or anyone else.

## 3. Personas

**The reader (primary).** Reads widely on a phone. Wants to keep what they loved and find it again months later. Will not tag, sort, or clean up. Will tap one extra button to share with people they trust.

**The roundup writer (first paying persona).** Runs a newsletter with a periodic links post. Collects links in tabs and notes all week, loses the "why" by Friday, loses reader submissions in chat. Wants a draft of raw material in their own voice, not a finished post. Has revenue; can pay.

**The group member.** A paid subscriber to a newsletter who joins the writer's group. Wants their recommendations to matter: to be read by the writer, to maybe land in the newsletter, to shape what the writer researches.

## 4. Concepts and data model

### Core objects

- **User.** Auth identity (Apple, Google, or email magic link). Display name. No public profile.
- **Link.** Canonical URL, title, source, archived full text, extracted metadata, category (computed once, cached), first-seen timestamp. One row per canonical URL across the whole system.
- **Save.** User × Link. Timestamp. Private note (long, optional). Public sentence (one line, optional, used when shared). Archive flags (e.g., Wayback requested).
- **Group.** Name, owner, settings: edition cadence (daily / weekly / biweekly), edition size (K), recommender names visible (bool, default true for private groups), contributes to public layer (bool, default false), categories enabled (bool, default false).
- **Membership.** User × Group. Joined via invite link. Role: owner / member.
- **Invite link.** Group, token, use cap per period, active flag, created and rotated timestamps.
- **Recommendation.** Save × Group. Created when a save is shared to a group. Carries the public sentence.
- **Edition.** Group × period. Materialized list of K links with labels and scores. Immutable once published. Has an export (markdown, HTML, JSON).
- **Category.** Fixed taxonomy entry (name, description, embedding of description). Twenty to thirty total.
- **Source.** Derived from Link. Registrable domain, except on multi-tenant platforms (Substack, Medium, YouTube, Bluesky, etc.) where source = author or publication.

### Canonicalization

- Follow redirects, resolve AMP to canonical, honor `<link rel="canonical">`.
- Strip tracking parameters (utm_*, fbclid, ref, etc.).
- Lowercase host, drop default ports, normalize trailing slash.
- Store the original URL on the Save for the user's own record.

### Categorization

- Fixed taxonomy. Each category has a short description. Embed the descriptions.
- On first sight of a Link, embed title + lead text, assign the nearest category above a similarity threshold. Below threshold, fall back to a single LLM call. Cache forever.
- Groups may ignore categories. Public layer is organized by them.

## 5. The three layers

| Layer | What enters | Who sees what | Default |
|---|---|---|---|
| Archive | Every save, full text, private note | The user only | Always on |
| Group | Link + public sentence, recommender name if group allows | Group members | Opt-in per save (default: last used group, user can set) |
| Public | Count of recommendations by category | Anyone | Opt-in per group |

Private notes never leave the archive. Group recommendations never reveal a user's other saves. The public layer never shows who.

## 6. Features by phase

### Phase 0: Concierge (no code)

- iOS Shortcut appends shared URL + optional sentence to a shared spreadsheet.
- Owner (Becca) hand-applies the ranking rules weekly and sends an edition email to the group.
- Run with current paid Performance Anxiety subscribers for six weeks.
- Run interviews (section 11).
- Exit criterion: see section 12.

### Phase 1: Personal archive

- Web app. Sign in. Save by URL (paste, bookmarklet, Shortcut posting to an endpoint).
- Worker: canonicalize, fetch, extract readable text, embed, categorize, store.
- Semantic + keyword search over archived text.
- Private note + public sentence fields on every save.
- Export: markdown and JSON, full text included.
- Privacy page: what leaves the server, which providers, what is stored.

### Phase 2: Groups and editions

- Create group, invite link with use cap and rotation, member list with remove.
- Share a save to groups at save time or later.
- Edition builder: runs on the group's cadence, materializes K links with labels, publishes a page and an email.
- Roundup export: markdown with blurbs and "recommended by N readers" attribution (attribution opt-in per recommendation).
- Group owner settings: cadence, size, names visible, contribute upward.

### Phase 3: Ranking and the public layer

- Full ranking per section 7, replacing the hand-applied version.
- Public categories populated only by links that clear multiple independent groups.
- Moderation per section 9.
- Public "how ranking works" page and the cohort metrics dashboard.

### Phase 4: Native and personal depth

- iOS share extension ("Recommend on [app]"): Expo config plugin or Swift.
- Archive clustering: themes over a user's saves, "what do I keep coming back to," surfaced only once the archive is large enough (roughly 100+ saves).
- Year-end view: private, opt-in, exportable.
- Community data story tooling: aggregate theme and source analysis for a group, for the owner to publish.

## 7. Ranking specification

Design goal, from The Closing Window research: discovery systems that reward accumulated attention entrench incumbents. New sources that publish just as much still don't get seen. This ranking counters that on purpose.

### Definitions

- `W`: the edition window (the group's period).
- `r(L)`: distinct members who recommended Link `L` in `W`.
- `m`: members of the group active in `W` (saved or opened anything). Floor at a small constant to avoid tiny-group blowups.
- `p(L) = r(L) / m`: proportion. This is the base signal. Proportion, not totals, so nothing accumulates and the mechanic reads the same at 12 members and 12,000.
- `a(s)`: recommendations of source `s` across the system in the last 90 days.
- `A`: total recommendations across the system in the last 90 days.
- `w(s) = min(log((1 + A) / (1 + a(s))), cap)`: inverse-frequency weight. A recommendation of a rarely seen source counts for more.
- `score(L) = p(L) × (1 + β · w(s(L)))`, with `β` tunable (start around 0.3).

For "hot right now" between editions, apply exponential decay to `r(L)` with a half-life around one third of the window.

### Edition composition

Given edition size `K` (default 10 for weekly, 5 for daily):

1. **Per-source cap.** At most 1 link per source per edition (owner can raise to 2).
2. **Reserved slots.** Roughly 20% of `K` (at least 1) are reserved for the New pool: links whose source has never appeared in this group before ("First time here") or whose `a(s)` is below the 25th percentile ("Small source"). Fill reserved slots by `score` within that pool.
3. **Remaining slots** by `score` across all eligible links.
4. **Labels.** Every surfaced link gets exactly one: `Hot this week` (top by `p`), `First time here`, `Small source`, or `Rising` (highest velocity in the last third of the window).
5. **Minimum evidence.** A link needs `r(L) >= 2` to be eligible unless the group has fewer than 6 active members, in which case `r(L) >= 1`.

### Public layer

A link enters a public category when it is recommended in at least `g` independent groups within the window (start with `g = 3`). Independence: pairwise member overlap below a threshold (start with 30%). Public ranking uses the same `score` with `p` computed over contributing groups rather than members.

### Measure what the research measured

Publish a dashboard, updated monthly:

- **Surfacing rate by cohort.** Of sources first seen in month M, what share reached N recommendations within 90 days.
- **Concentration.** Share of edition slots held by the top 10 sources.
- **Diversity.** Distinct sources per edition, median, over time.

If the window is closing on this platform too, the dashboard will show it.

## 8. Membership and invite links

- A group has one active invite link at a time. Token in the URL. One tap from an email.
- Use cap per week (default 50, owner adjustable). Cap exceeded: link pauses, owner notified.
- Owner can rotate the link; old token dies immediately; existing members unaffected.
- Optional annual re-up: owner can require members to enter the current link to stay. Handles churn without any external sync.
- Owner can remove a member. Removal deletes their recommendations from future editions; past editions are immutable.
- The app stores nothing about where a member came from (no Substack email, no payment data).

Delivery pattern for newsletter writers: put the invite link in the platform's paid welcome email. New paying subscribers get access automatically with zero sync.

## 9. Moderation

With no comments and no profiles there is no harassment surface. What remains:

- **Promotion.** Canonical dedupe; per-account rate limits; down-weight accounts whose recommendations concentrate in one source; new sources need several independent recommenders before surfacing publicly (section 7 already does this through `g`).
- **Illegal or abusive content at URLs.** Run every new Link through Safe Browsing and a block list at ingest. Hold for review on hit.
- **Group-level.** The owner is the moderator. Remove member, rotate link.
- **Public-level.** A small flag-and-review queue. Flagging is the one interaction a non-owner can take on a link besides saving it.
- **Gated growth.** Public layer stays invite-only or sign-in-with-Apple-plus-account-age for a long time. Small scale is where this lives for years, and small scale solves most of it.

## 10. Stack

Suggestions, not requirements. Pick the boring option.

- **Web:** Astro + React (matches existing projects), Netlify.
- **Database:** Postgres with pgvector (Supabase is fine). Links, saves, embeddings all in one place.
- **Worker:** a queue-backed job per new Link: fetch → Readability-style extraction → embed → categorize → optional Wayback save. Idempotent on canonical URL.
- **Embeddings:** either a self-hosted open model (nomic-embed, bge-small) or an API with no-training terms. Decision recorded on the privacy page.
- **Archiving:** store extracted text and a cleaned HTML snapshot. Wayback Save Page Now is opt-in per save and never for pages that required login.
- **Capture:** Phase 1 is a Shortcut posting to an authenticated endpoint plus a bookmarklet. Phase 4 is a native share extension.
- **Email:** editions via a transactional provider. One email per edition, nothing else. No notification system.

## 11. Research before building

### Interviews: newsletter writers who already do roundups (3 to 5)

1. Walk me through how your last links post got made, start to finish. How long did it take?
2. Where do links live between finding them and publishing? What falls through?
3. Do readers send you things? Where, and what happens to them?
4. If readers' recommendations appeared with their names in your post, would that feel like community or noise?
5. What would you do with a Friday draft that had the links and blurbs but not your voice?
6. What do you refuse to add to your newsletter, and why?

### Interviews: readers (5 to 6, drawn from paid subscribers)

1. Where did the last link you loved go? Can you find it now?
2. When did you last try to find something you'd read and fail?
3. Who do you send links to, and how? What happens after?
4. Would you join a group of strangers who read the same newsletter? What would make you leave it?
5. If a writer you pay for read your recommendations and sometimes quoted them, would that change what you share?
6. What's the most you'd want to do when saving something? One tap? A sentence?

### Observation

Spend an hour each in: a Substack chat, a Discord links channel, a family or friends group text. Note the gap between "shared" and "found again."

### Concierge protocol (Phase 0)

1. Build the Shortcut and sheet. Test on yourself for a week.
2. Post the invite in a paid-only post and the paid welcome email. State the cadence (biweekly is safer than weekly).
3. Each period: hand-apply the ranking, including reserved slots for first-time and small sources. Write a short editorial frame connecting a few links to current research. Send.
4. Keep a log: saves per period, distinct savers, sources, which labels got clicked if trackable.
5. After six weeks, apply the exit criteria below.

## 12. Success criteria

For the concierge test with the paid subscriber list:

| Monthly share of paid subscribers who save at least once | Reading |
|---|---|
| Under 1 in 10 | A pleasant perk. Keep it manual or stop. |
| 1 in 10 to 1 in 3 | Build Phase 1 and 2. Keep it a perk. |
| Over 1 in 3 | There is a product here. Plan for other writers. |

Secondary signals: the writer (you) publishes a roundup drawn from the group with light edits; at least one "First time here" link gets more clicks than a "Hot this week" link in any edition; members ask to export their own saves.

## 13. Making the paid group worth paying for

The perk is the writer's attention, not the software. Two promises, kept on a fixed cadence:

1. **Your recommendation can land in the newsletter.** Attribution opt-in per link.
2. **Your recommendation can shape the research.** Standing prompts tied to current work ("send me careers pages that say 'we're not for everyone'"). Contributors credited in published studies.

Supporting features: the group archive compounds into a searchable library; once or twice a year the owner publishes a data story about what the group reads. Pick a cadence you would keep in a bad month and write it down before promising it.

## 14. Things we will refuse

Written down now so the first request doesn't reopen it:

- Comments, replies, threads
- Reactions, likes, upvotes visible to others
- Follow or friend graphs
- Member profiles beyond a display name inside a private group
- Infinite scroll or "load more" on any edition
- Push notifications beyond edition delivery
- Engagement-tuned ranking
- Ads, sponsored links, affiliate rewriting
- Using saved content to train models

## 15. Open decisions

- Product name. Candidates so far: Rabbit Hole (current working name), Headcanon, Canon Club, Commonplace (after the commonplace book), Canon / Canonize (note: trademark collisions with Canon Inc. and Canonical Ltd.).
- Embeddings: self-hosted model vs API provider. **Decided for the build: API provider with no-training terms, named on the privacy page; pgvector keeps it swappable.**
- Native capture: Expo share extension vs Swift.
- Default for recommender names in private groups (current lean: visible). **Build default: visible.**
- Default edition cadence for new groups (current lean: weekly, K = 10). **Build default: weekly, K = 10.**
- Whether Wayback saving is default-on for public pages or opt-in everywhere (current lean: opt-in). **Build default: opt-in everywhere.**
- Whether the personal archive clusters themes before Phase 4 if the owner's own archive is large enough to test on.

## 16. Related prior work (Becca's)

- **The Closing Window.** Ravelry designer cohorts; the discovery dynamics this ranking is designed against. Source: github.com/becca-bailey/ravelry-study
- **The Language of Work.** Embedding + LLM content analysis with human validation; the methods-disclosure stance the privacy and ranking pages inherit. Source: github.com/becca-bailey/language-of-work
- **Living Hive.** Embedding clustering and hive visualization; basis for the Phase 4 theme view.
- **Victory / visx.** Charting for the ranking dashboard and year-end view.
