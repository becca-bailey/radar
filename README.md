# Rabbit Hole (working name)

A reading archive that happens to be shareable, not a sharing app that happens to
keep a copy. Every link you save goes to your own archive first: full text captured,
searchable, exportable, private by default. Optionally the same save goes to a group
with one sentence of why, groups publish finite editions, and editions aggregate into
public categories through a ranking designed to surface new and small sources.

- Product plan: [docs/PLAN.md](docs/PLAN.md)
- Task breakdown and build order: [docs/TASKS.md](docs/TASKS.md)

## Stack

Astro + React islands + TypeScript, deployed on Netlify (functions, background
functions, scheduled functions). Supabase: Postgres + pgvector + Auth, with Row Level
Security enforcing the three-layer privacy model (archive / group / public).

## Local development

```bash
npm install
supabase start   # local Postgres + Auth (needs Docker)
npm run dev
```

```bash
npm test         # vitest
npm run check    # typecheck
```
