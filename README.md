# Radar (working name)

"Put it on your radar." A notes tool for yourself, a sharing tool for a group.

A reading archive that happens to be shareable, not a sharing app that happens to
keep a copy. Every link you save goes to your own archive first: full text captured,
searchable, exportable, private by default. Optionally the same save goes to a group
with one sentence of why, groups publish finite editions, and editions aggregate into
public categories through a ranking designed to surface new and small sources.

- Product plan: [docs/PLAN.md](docs/PLAN.md)
- Original build plan and history: [docs/TASKS.md](docs/TASKS.md)
- How work moves from ticket to release: [docs/WORKFLOW.md](docs/WORKFLOW.md)

## Stack

Astro + React islands + TypeScript, styled with Tailwind and shadcn/ui components
(`src/components/ui`), deployed on Netlify (functions, background
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

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first: it covers
setup, the checks CI runs, and the product decisions that aren't up for change.
Report security problems privately, as described in [SECURITY.md](SECURITY.md).

## License

[GNU Affero General Public License v3.0 or later](LICENSE). You're free to use,
change and self-host Radar. If you run a modified version as a service for other
people, you must offer them its source code.
