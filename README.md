# ⚔ Life-RPG Protocol

**A productivity app where focus and finished work earn XP, and other players verify your proof.**

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ecf8e?style=flat-square)
![Tests](https://img.shields.io/badge/DB%20security%20tests-260-brightgreen?style=flat-square)

<!-- Add 2–3 screenshots or a short GIF here: dashboard, a focus session, the jury screen.
     Put images in docs/images/ and use ![Dashboard](docs/images/dashboard.png) -->

## The problem

Productivity apps rely on honesty. You tick a box, you get a reward, and nothing stops you from ticking it without
doing the work. Streaks and points become meaningless the moment they are easy to fake.

## The idea

Life-RPG Protocol turns real effort into a game, and makes cheating costly:

- **Focus sessions** earn XP and **Aura** (the reputation currency). Leaving the tab during a session is detected and costs Aura.
- **Quests with proof**: you submit a photo as evidence. A **jury of other players** votes on it.
  Each vote is **weighted by the juror's Aura**, so established players count for more than brand-new accounts.
- Jurors who agree with the final verdict earn a small bonus, so honest judging is rewarded.
- Around that: parties, a store, a daily luck roll (critical hits), a leaderboard and an admin panel.

## What makes it different

Most "gamified to-do list" projects stop at the UI. The interesting part here is the trust model:

- **Peer verification with reputation weighting** instead of self-reporting.
- **A security-first backend.** The browser is treated as hostile; the database enforces every rule (see below).
- **Tested like a real system**: attacks are written as tests, including a race-condition test with two simultaneous votes.

## How it works (the short version)

```
Browser ──(anon key, can only READ own data)──► Supabase Postgres
   │                                              ▲
   │  game actions = one named database function  │  every function checks auth.uid(),
   │  e.g. start_quest, cast_jury_vote            │  validates input, bounds rewards
   ▼                                              │
Next.js API routes ──(service-role key, server only)──► admin actions, signed proof-image links
```

1. **No browser can write to game tables.** Permissions are revoked; the only writes are database functions.
2. **Identity comes from the login token** (`auth.uid()`), never from a parameter the client sends.
3. **Rewards are bounded and each verdict is paid exactly once**, even if two jurors vote at the same instant (row locking).
4. **Proof photos live in a private bucket**; viewers get 5-minute signed links, after the database decides they may see them.
5. **Admin power is server-side**, checked against the database role. Roles can only be changed by running SQL.

## Security work (the part I'm proudest of)

The original version had the typical mistakes of a first Supabase app: users could edit their own Aura and role,
database functions were callable by anyone, and proof photos were public. I audited it, wrote tests that exploit each
problem (**44 attack checks failed on the old schema**), fixed them, and re-ran everything (**all ~260 checks pass**).
An independent review afterwards found one more farming loop, which is also fixed and tested.

| Problem | Fix |
|---|---|
| Users could `UPDATE` their own `aura`, `xp`, `role` | Column-level grants: only `username` and `theme` are editable |
| Database functions took a `user_id` and were open to everyone | Identity from `auth.uid()`; execute rights revoked from `anon`/`authenticated` unless intended |
| A verdict could be re-run to pay rewards repeatedly | Idempotent, row-locked resolution + a two-session race test |
| Public proof photos | Private bucket, strict path/type/size policy, signed URLs |
| Unauthenticated AI endpoint | Login required, zod validation, rate limit |
| Next.js auth-bypass CVE | Upgraded; admin checks live in each route, not only middleware |

Full table, how each was verified, and the **honest limits**: [`docs/SECURITY.md`](docs/SECURITY.md).
Step-by-step per phase: [`docs/HARDENING_LOG.md`](docs/HARDENING_LOG.md).

## What I learned

- **Row Level Security alone is not enough.** Supabase gives new tables and functions to `anon` and `authenticated`
  by default, so you must `REVOKE` first and `GRANT` only what's needed, then add RLS on top.
- **Never trust the client.** Anything the browser can call, an attacker can call with any arguments, so each rule must live in the database.
- **`SECURITY DEFINER` functions are powerful and dangerous**: pin `search_path`, take identity from `auth.uid()`, validate inputs, and restrict who may execute them.
- **Race conditions are real.** Two simultaneous requests can both pass a "has this been paid?" check; row locks (`FOR UPDATE`) and idempotent logic fix that, and you can test it with two database sessions.
- **Write the attack as a test first.** Watching a test fail on the old code and pass on the new code is the only convincing proof a fix works.
- **Be honest about limits.** A client-side focus monitor is a deterrent, not a guarantee; documenting what is *not* protected is part of the job.
- **Migrations are forward-only.** Fix the past by adding a new numbered migration, never by rewriting history.
- **Keep secrets out of the browser**: the service-role key lives only in server code (`import 'server-only'`).

## Tech stack

Next.js 14 (App Router) · TypeScript · Supabase (Postgres, RLS, Auth, Storage) · Tailwind CSS · Framer Motion · Zustand · zod ·
GitHub Actions (lint, typecheck, unit tests, build, database tests).

## Run it locally

```bash
npm install
cp .env.example .env.local        # fill in your own Supabase values
npm run dev                       # http://localhost:3000
```

1. Create a Supabase project (use a fresh one, not one holding data you care about).
2. Run `supabase/migrations/*.sql` **in order** (001 → 026) in the SQL editor, or with `supabase start` locally.
3. Put the project URL, anon key and service-role key in `.env.local`.
4. Sign up in the app, then make yourself admin (roles can never be changed from the app):

```sql
update public.profiles set role = 'admin' where username = 'your_username';
```

`OPENAI_API_KEY` is optional. Without it, "Generate Next-Day Plan" returns clearly labelled sample quests.

## Run the checks

| Command | What it does |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests (input validation, level maths) |
| `npm run test:db` | Applies every migration to a throwaway local Postgres and runs ~260 security tests |
| `npm run build` | Production build |

```bash
DATABASE_URL='postgres://postgres@localhost:5432/liferpg_test' npm run test:db
```

The database test refuses to run unless the database is local and its name contains `test`.

## Project layout

```
app/            pages and API routes (admin routes in app/api/admin)
components/     UI pieces
hooks/          data hooks
lib/            Supabase clients, zod schemas, server auth helpers
supabase/       migrations 001–026 and database security tests
docs/           security model, decisions, schema reference, design docs
tests/          unit tests
```

## Known limitations

- The focus "jail" runs in the browser, so it's a soft deterrent, not tamper-proof.
- Coordinated fake accounts can still approve each other's quests; Aura-weighting and daily caps raise the cost but don't remove the risk.
- The daily discovery "analysis" is simulated, and there is no offline mode.
- Remaining `npm audit` notes need a Next.js 16 migration.
- Database security was tested on plain Postgres with stand-ins for Supabase's auth and storage, not on a live Supabase project.

More: [`docs/SECURITY.md`](docs/SECURITY.md) · [`docs/DECISIONS.md`](docs/DECISIONS.md) · [`docs/SCHEMA_SNAPSHOT.md`](docs/SCHEMA_SNAPSHOT.md)

## Roadmap

- Server-side focus heartbeat so the focus rule can be enforced, not just discouraged
- Account-age and random-juror assignment to make collusion harder
- Real image analysis for Daily Discovery
- Upgrade to Next.js 16

## License

No licence has been chosen yet, so all rights are reserved by default. Add a `LICENSE` file (for example MIT) if you want others to reuse it.
