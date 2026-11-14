# Working on Radar

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code layout and conventions,
and [docs/WORKFLOW.md](docs/WORKFLOW.md) for how tickets, branches and releases
fit together. The rules below are the parts every session must follow.

## One ticket, one session, one PR

- Work comes from a Linear issue (`RAD-123`). If the prompt doesn't name one,
  ask for it, or offer to create one with the Linear connector before starting.
- Work in this session's own worktree and branch. Never commit to `main` or
  check out another branch in `/Users/becca/radar` itself: other sessions may
  be using that checkout.
- Keep the PR to that one issue. If you find unrelated work, propose it as a
  new Linear issue instead of folding it in.

## Before opening a PR

1. `npm run check`, `npm test` and `npm run build` pass.
2. For UI changes, check the page in the preview at phone width, light and dark.
3. Run `/code-review` on the diff and fix what it finds.
4. Open the PR (draft if anything is unverified):
   - Title: `RAD-123: <what changed>`
   - Body starts with `Fixes RAD-123`, then fills in the PR template.

## Releasing

Merging to `main` deploys to production (Netlify). So:

- Never push to `main` directly.
- A PR that adds a migration needs the migration pushed to the hosted database
  (`npx supabase db push --remote`) **before** it merges. Becca runs that step;
  say so in the PR and stop.
- Half-built features ship behind an env flag (like `GROUPS_ENABLED`), off in
  production until they're ready.

## Migrations and parallel work

- Before adding a migration, check open PRs for one already in flight:
  `gh pr list --json number,title,files --jq '.[] | select(.files[].path | startswith("supabase/migrations"))'`.
  If there is one, say so; two migration PRs at once tend to collide.
- Name the file one step after the newest one in `supabase/migrations`. If
  `main` gains a newer migration before you merge, rename yours to come after it.
- The local Supabase stack is shared by every worktree. A migration you apply
  locally is visible to all other sessions, so mention it when you do.

## Dev server

Use the `radar-dev` preview config (port 4321). If it's taken by another
session, use `radar-dev-alt` (port 4322).
