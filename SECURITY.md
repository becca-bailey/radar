# Security

Radar stores people's private reading archives, so security reports are very
welcome.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub instead:
go to the repository's **Security** tab and choose **Report a vulnerability**.

Helpful things to include:

- what an attacker could do (for example, read another user's saves or a
  group they aren't in),
- steps to reproduce,
- the affected page, API route, or migration, if you know it.

You'll get a reply as soon as possible. Please give a reasonable amount of time for
a fix before disclosing anything publicly.

## Scope

In scope: the code in this repository and the hosted app at onyourradar.app.
Especially:

- row-level security and access to other users' archives, notes, or groups,
- authentication, invite links, and API tokens,
- server-side fetching of saved URLs (for example, reaching internal addresses).

Out of scope: denial-of-service, spam, social engineering, and problems in
third-party services (Supabase, Netlify, Resend) themselves.

Please test only against your own accounts and data.
