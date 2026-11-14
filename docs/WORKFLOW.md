# Workflow

How I take a piece of work from idea to production, with several Claude
sessions running at once.

## The loop

1. **Ticket.** Every piece of work starts as a Linear issue in the Radar team.
   Ideas go to Backlog; what I mean to do this week moves to Todo.
2. **Session.** Start a new Code session with a worktree, and give it the issue
   ID (`Work on RAD-123`). Claude reads the issue through the Linear connector.
   One issue per session.
3. **PR.** The session opens a PR titled `RAD-123: …` with `Fixes RAD-123` in
   the body. Linear links it and moves the issue to In Review.
4. **Test.** CI runs check, test and build on every PR. For anything visual I
   look at it myself: the session's preview, or the Netlify deploy preview.
5. **Review.** The session runs `/code-review` before handing over. I read the
   diff, ask for changes in the same session, then squash-merge.
6. **Release.** Merging deploys. Linear moves the issue to Done, GitHub deletes
   the branch, and the app archives the session.

## Limits that keep it untangled

- At most three sessions with open work at a time. Merge or close one before
  starting a fourth.
- Only one open PR with a database migration at a time.
- Never work in `/Users/becca/radar` directly on a feature. That checkout stays
  on `main` and is only for pulling and looking around.
- A quick question that doesn't change code can skip the ticket.

## Migrations

A migration has to reach the hosted database before the code that needs it, or
production breaks for the minutes in between. For a PR with a migration:

1. Rebase on `main` and make sure the migration file sorts last.
2. Run `npx supabase db push --remote`.
3. Merge.

## How Linear is organized

- **Team** Radar (`RAD`), statuses Backlog, Todo, In Progress, In Review, Done.
- **Projects**: Beta launch, Meet members where they are, Capture beyond iOS.
- **Labels**: Bug, Feature and Improvement for code work; **Manual** for things
  only I can do (dashboards, prod migrations, phone testing). Don't hand a
  Manual issue to a Claude session.

## Things to set up once

- **Linear GitHub integration** (Linear → Settings → Integrations → GitHub),
  connected to `becca-bailey/radar`. Turn on the automations that move issues
  to In Review when a PR opens and to Done when it merges.
- **Linear connector in Claude**, so sessions can read and create issues.
- **Deploy previews.** Check which Supabase project Netlify's deploy-preview
  context uses. If it's the production one, previews write to real data, and a
  PR with a migration will break in its preview because nothing applies the
  migration there.

## History

[TASKS.md](TASKS.md) records the original build plan and what's done. New work
lives in Linear.
