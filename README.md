# Life-RPG Protocol

> **Placeholder README.** A full write-up comes later; this page only says what the project is
> and how to run it. Archived original README: [`docs/ORIGINAL_README.md`](docs/ORIGINAL_README.md).

A gamified productivity app. Focus sessions and quests earn **Aura** and **XP**; for quests
with proof, other players act as a **jury** and vote on the photo evidence (votes are weighted
by Aura). It also has parties, a store, daily luck rolls, a leaderboard and an admin panel.

**Stack:** Next.js 14 (App Router) · TypeScript · Supabase (Postgres, Row Level Security, Auth,
Storage) · Tailwind · Framer Motion.

## What is real and what is not

- The focus "jail" runs in the browser. It is a **soft deterrent**, not tamper-proof.
- There is **no offline mode** (the app is installable, but has no service worker).
- "Generate Next-Day Plan" returns clearly labelled **sample quests** unless `OPENAI_API_KEY` is set.
- The Daily Discovery "analysis" is **simulated**; the photo is not uploaded.
- No licence has been chosen yet (all rights reserved by default).

More detail: [`docs/SECURITY.md`](docs/SECURITY.md), [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Run it locally

```bash
npm install
cp .env.example .env.local        # then fill in your own Supabase values
npm run dev                       # http://localhost:3000
```

Database: apply `supabase/migrations/*.sql` in order to **your own** Supabase project
(or a local one with `supabase start`). Never run them against a database you care about
before reading them.

To make yourself an admin, run this in the SQL editor (roles can never be changed from the app):

```sql
update public.profiles set role = 'admin' where username = 'your_username';
```

## Checks

| Command | What it does |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests (input validation, level maths) |
| `npm run test:db` | Applies every migration to a **local throwaway Postgres** and runs ~250 security tests (see below) |
| `npm run build` | Production build |

`npm run test:db` needs a local Postgres and refuses to run on anything else:

```bash
DATABASE_URL='postgres://postgres@localhost:5432/liferpg_test' npm run test:db
```

## Layout

```
app/            pages and API routes (admin routes live in app/api/admin)
components/     UI pieces
hooks/          data hooks
lib/            Supabase clients, validation schemas, server auth helpers
supabase/       migrations (001-025) and database tests
docs/           security notes, decisions, schema reference, original design docs
tests/          unit tests
```
