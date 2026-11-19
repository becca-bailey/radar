# Contributing to Radar

Thanks for wanting to help. Radar is a small project with a few firm opinions.
Reading this first will save us both time.

## What Radar is (and isn't)

Radar is a reading archive that happens to be shareable, not a sharing app that
happens to keep a copy. Save a link, Radar keeps the full text, and you can pass
the best of it to a small group with one sentence about why.

Some product decisions are settled and won't be reopened in a pull request. They're
listed in [docs/PLAN.md §2](docs/PLAN.md#2-non-negotiables). In short:

- **No infinite scroll**, anywhere.
- **No comments, replies, reactions, follows or profiles.** A recommendation is a
  link and a note.
- **Your archive comes first.** Saving never requires sharing, and the archive is
  never gated.
- **Export always works**: Markdown and JSON, full text included.
- **No ads, and no training on content.**
- **Layered privacy**: the archive sees everything, a group sees the link and the
  note, and nothing goes further without an explicit choice.

If you'd like to change one of these, open an issue to talk about it. Please don't
send code for it first.

## Before you start

- **Small fixes** (typos, bugs with an obvious fix, accessibility, tests): just
  open a pull request.
- **Anything bigger** (new features, schema changes, new dependencies, new
  third-party services): open an issue first, so we can agree on the shape before
  you spend time on it. [docs/TASKS.md](docs/TASKS.md) lists what's planned.

## Local setup

You'll need Node 24, npm, and Docker (for the local Supabase stack).

```bash
npm install
cp .env.example .env     # fill in the keys `supabase start` prints
npx supabase start       # local Postgres + Auth
npm run dev
```

With `ADMIN_EMAILS` set to your email in `.env`, you can sign in locally and
invite other test accounts at `/admin/invites`. Local sign-in emails land in the
Supabase mail viewer that `supabase start` prints (port 55324 by default).

`OPENAI_API_KEY` and `SAFE_BROWSING_API_KEY` are optional. Without them, links are
archived but not categorized or semantically searchable, and the malware check
is skipped.

## Checks

CI runs these three. Please run them before opening a pull request:

```bash
npm run check   # typecheck (astro check)
npm test        # vitest
npm run build
```

CI also builds Storybook (`npm run build-storybook`), so it can't quietly break.

## Storybook

Storybook shows the components and a few whole screens in every theme, light
and dark. Use it to build and check themes, and to demo them.

```bash
npm run storybook        # http://localhost:6006
npm run build-storybook  # static build in storybook-static/
```

It runs with sample content only: no Supabase, no `.env` needed. Pick the theme
and mode (system, light or dark) in the toolbar. The Accessibility panel runs
axe on every story. **Gallery** shows one screen in every theme side by side,
and **Tokens** lists each theme's palette, type, radii and shadows, read
straight from `src/styles/global.css`.

Stories live in `src/stories`. Sample data is in `src/stories/fixtures.ts` (and
`src/stories/astro/screens.ts` for whole screens): made up, never real user
data.

### Adding a story

- **A React component** (`.tsx`): write a normal story next to the others, e.g.
  `src/stories/components/Button.stories.tsx`.
- **An Astro component or page** (`.astro`): Storybook can't run `.astro` files,
  so they're rendered to HTML first with Astro's Container API
  (`scripts/storybook/render-astro.ts`). Add an entry to
  `src/stories/astro/renders.ts` with the component and its props, then show it
  with `astroStory('<id>')`. For a component that needs a wrapper (a card goes in
  a `CardList`), add a small story-only `.astro` file in `src/stories/astro/`.
  A page also needs the data its queries read, in `src/stories/astro/screens.ts`;
  the fake Supabase client fails loudly, naming the query, if something's
  missing.
- `npm run storybook` renders the Astro stories on start. After changing an
  `.astro` file, run `npm run storybook:astro` and reload.
- Astro output is static: React islands inside it show but don't respond. Give
  an island its own `.tsx` story if it needs to be interactive.
- Styles in `.astro` files must be `<style is:global>` (or Tailwind classes) to
  show in Storybook; the render step fails on a scoped `<style>`.

### Adding a theme

Add the theme in `src/lib/theme.ts` (`THEMES`, `THEME_COLORS`, `THEME_FONTS`)
and its tokens in `src/styles/global.css`: copy the Playful block (light
tokens, then `@variant dark` with the ones that change) under the selector
`:root[data-theme='name']` alone, and keep its families and order. The
comment at the top of that file explains how the colours relate and which
names to use in markup. Storybook picks it up from there: it
appears in the toolbar and the gallery, the token pages list its values, and
the Astro stories are rendered once per theme, so anything that differs by
theme on the server (like the background) shows correctly.

## How the code is organized

- `src/pages`: Astro pages and API routes (`src/pages/api`).
- `src/components`: Astro components and React islands; shadcn/ui primitives
  live in `src/components/ui`.
- `src/lib`: logic, ideally as pure functions with tests next to them
  (`*.test.ts`).
- `supabase/migrations`: the database schema and row-level security policies.
- `docs/`: the product plan and the task list.

## Conventions

- **Privacy is enforced in the database.** Access rules belong in row-level
  security policies or security-definer functions, not only in page code. If a
  change lets anyone see data they couldn't see before, say so in the pull
  request.
- **Keep the privacy page true.** If you change what's stored, what leaves the
  server, or which providers receive data, update `src/pages/privacy.astro` in the
  same pull request.
- **Migrations are new files.** Add a timestamped file to `supabase/migrations`
  and never edit one that has already been merged.
- **Test the logic.** New logic in `src/lib` should come with tests. Bug fixes
  should come with a test that fails without the fix.
- **Phones first.** Most saving and reading happens on phones. Check new UI at
  about 390px wide, and in both light and dark mode.
- **Plain, specific copy.** Say what happened ("Saved.", "Removed from your
  archive.") rather than cheerleading. Keep exclamation points to a minimum.
- **Boring dependencies.** Prefer what's already in `package.json`. A new
  dependency or service needs a reason in the pull request.

## Pull requests

- Keep each pull request to one change, and explain the why as well as the what.
- Include screenshots (phone width) for anything visual.
- Note any migration, new environment variable, or privacy-relevant change at the
  top of the description.

## Reporting security issues

Please don't open a public issue for a security problem. See
[SECURITY.md](SECURITY.md).

## Conduct

Be kind, assume good faith, and keep criticism about the work. Harassment,
personal attacks and discriminatory language aren't welcome in issues, pull
requests or anywhere else in the project. The maintainer may remove comments or
block participants who don't follow this.

## License

Radar is licensed under the [GNU Affero General Public License v3.0 or
later](LICENSE). By contributing, you agree your contributions are licensed under
the same terms. There's no separate contributor agreement to sign.
