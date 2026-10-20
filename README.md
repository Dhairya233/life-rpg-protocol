# ⚔ Life-RPG Protocol

> **Transform your focus sessions into legendary quests. Earn Aura. Level up for real.**

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ecf8e?style=flat-square)
![Tailwind](https://img.shields.io/badge/Tailwind-CSS-9b59ff?style=flat-square)
![DB tests](https://img.shields.io/badge/DB%20security%20tests-260%20passing-39ff6b?style=flat-square)
![Status](https://img.shields.io/badge/status-portfolio%20project-4af7ff?style=flat-square)

<!-- Add 2–3 screenshots or a short GIF here (dashboard, focus session, jury screen).
     Save them in docs/images/ and use: ![Dashboard](docs/images/dashboard.png) -->

---

## 📖 What is Life-RPG Protocol?

Life-RPG Protocol is a **gamified productivity app** where real-world focus sessions and finished work are converted
into in-game XP and a reputation currency called **Aura**. It is built on two ideas:

1. **The Jail**: a focus monitor that detects tab switching, window blur and the mouse leaving the page. Leave
   your focus session for more than 10 seconds and you lose Aura.
2. **The Jury**: a reputation-weighted peer review. Other players look at the proof photo for your quest and vote.
   Players with more Aura count for more.

Around these sit parties, a store, a daily luck roll (critical hits), a leaderboard, a skill tree and an admin panel.

## 🎯 The problem it solves

Productivity apps run on the honour system. You tick a box and get a reward, and nothing stops you ticking it without
doing the work. Streaks and points lose their meaning the moment they are easy to fake, so people stop caring.

Life-RPG tries to make progress **earned and checked**: your effort is monitored while you work, and your results are
judged by other people who have something to lose if they judge badly.

## ✨ What makes it different

- **Peer verification instead of self-reporting.** A quest only pays out when a jury approves the proof.
- **Reputation-weighted voting.** `Verdict = Σ(vote × juror Aura) / Σ(juror Aura)`. Established players outweigh fresh accounts.
- **Honest judging is rewarded.** Jurors who agree with the final verdict get a small bonus (capped per day to prevent farming).
- **A trust-nothing backend.** The browser is treated as hostile, so the database enforces every rule (see [Security](#-security-work)).
- **Attacks written as tests**, including a race-condition test where two jurors cast the deciding vote at the same instant.

---

## 🗺 User Flow

```
 Sign up / Log in (Supabase Auth) ──► a profile row is created (aura 0, xp 0, luck 50)
                                          │
                                          ▼
                                     /dashboard   (Aura ring, XP bar, streak, luck)
                                          │
                                  Browse and start a quest
                                          ▼
                          ┌──── /dashboard/focus  (THE JAIL) ────┐
                          │   Visibility API · Window blur ·     │
                          │   Mouse-leave all feed one monitor   │
                          └───────┬─────────────────┬────────────┘
                     away > 10 s  │                 │  session done
                                  ▼                 ▼
                          −5 Aura (logged)     Upload proof photo
                                                    │  status → pending_verification
                                                    ▼
                                          /dashboard/jury  (other players, ≥ 100 Aura)
                                                    │  one weighted vote each
                                                    ▼
                                             Verdict engine
                                   ≥ 0.6 approved │ < 0.4 rejected │ else stays pending
                                         │                       │
                           XP + Aura (maybe a critical hit)   −20 Aura, status failed
```

Quest status machine: `active → pending_verification → completed | completed_critical | failed`
(a failed quest can be retried; a completed or pending one cannot be restarted).

Jury rules: **quorum of 3 votes**, jurors need **≥ 100 Aura**, **one vote each**, **no voting on your own quest**,
and the vote weight is read from the database, never sent by the browser.

---

## 🛠 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 14 (App Router) | File routing, server routes, middleware |
| Language | TypeScript (strict) | Catches mistakes at build time |
| Database | Supabase (PostgreSQL) | Row Level Security, Auth, Storage, SQL functions |
| Auth | Supabase Auth | JWT sessions in cookies; identity is `auth.uid()` in SQL |
| Validation | zod | Server routes reject malformed input and strip unknown fields |
| Styling | Tailwind CSS | Utility-first |
| Animation | Framer Motion | Aura ring and XP bar |
| Tests | Node test runner + plain SQL | Unit tests and ~260 database security checks |
| CI | GitHub Actions | Lint, types, tests, build, DB tests on every push |
| Deployment | Vercel | Preview URLs, easy env vars |

---

## 🔒 Security work

The original version had the classic mistakes of a first Supabase app. I audited it, wrote tests that exploit each
problem (**44 attack checks failed on the old schema**), fixed them, and re-ran everything (**all ~260 checks pass**).
A separate independent review afterwards found one more farming loop, which is also fixed and tested.

| What was wrong | What an attacker could do | Fix |
|---|---|---|
| Users could `UPDATE` their own profile freely | Set their own Aura, XP, role = admin, un-ban themselves | Column-level grants: only `username` and `theme` are editable |
| Database functions took a `user_id` and were open to everyone | Grant or deduct Aura for any user, even logged out | Identity from `auth.uid()`; execute rights revoked unless intended |
| A verdict could be re-run, or two votes could race | Collect a quest reward more than once | Idempotent, row-locked resolution + two-session race test |
| Quest rows and votes were client-writable | Insert a "completed" quest, fake vote weights | No client writes; `start_quest`, `submit_quest_proof`, `cast_jury_vote` only |
| Proof photos were public | Anyone could open anyone's photo | Private bucket, strict path/type/size policy, 5-minute signed links |
| Unauthenticated AI endpoint | Burn the API budget | Login required, zod validation, rate limit |
| Old Next.js version | Middleware auth bypass (CVE-2025-29927) | Upgraded; admin checks live in each route |
| Jury bonus had no cap | Farm XP with friendly accounts | Capped at 10 bonuses per juror per day |

The model in one sentence: **the browser can only read its own data; every game action is a database function that
takes the user from the login, validates input and bounds rewards; admin power lives in server routes.**

Full details and the **honest limits**: [`docs/SECURITY.md`](docs/SECURITY.md) · per-phase log with verify and rollback steps: [`docs/HARDENING_LOG.md`](docs/HARDENING_LOG.md)

---

## 🧠 What I learned

- **Row Level Security alone is not enough.** Supabase grants new tables and functions to `anon` and `authenticated` by default.
  You `REVOKE` first, `GRANT` only what is needed, and then add RLS on top.
- **Never trust the client.** Anything the browser can call, an attacker can call with any arguments, so each rule must live in the database.
- **`SECURITY DEFINER` functions are powerful and dangerous.** Pin `search_path`, take identity from `auth.uid()`, validate inputs and limit who can execute them.
- **Race conditions are real.** Two simultaneous requests can both pass a "was this paid yet?" check. Row locks (`FOR UPDATE`) plus idempotent logic fix it, and you can test it with two database sessions.
- **Write the attack as a test.** Watching a test fail on the old code and pass on the new code is the only convincing proof a fix works.
- **Be honest about limits.** A browser-side focus monitor is a deterrent, not a guarantee; documenting what is *not* protected is part of the job.
- **Migrations are forward-only.** You fix the past by adding a new numbered migration, never by rewriting history.
- **Keep secrets out of the browser.** The service-role key lives only in server code (`import 'server-only'`).
- **Game design is security design.** Rewards, caps and cooldowns decide whether a system can be farmed.

---

## 🚀 Getting Started

**Prerequisites:** Node.js 18.17+ (22 recommended), npm, a free [Supabase](https://supabase.com) account. Use a
**fresh** Supabase project, not one that holds data you care about.

```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPO.git
cd YOUR-REPO
npm install
cp .env.example .env.local
```

Fill in `.env.local` (Supabase → Project Settings → API):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # SECRET: server only, never commit it
OPENAI_API_KEY=                                   # optional
```

Create the database: open the Supabase **SQL editor** and run every file in `supabase/migrations/` **in numeric order
(001 → 026)**, or use the Supabase CLI (`supabase link` then `supabase db push`).

```bash
npm run dev          # http://localhost:3000
```

Sign up in the app, then make yourself an admin (roles can never be changed from the app):

```sql
update public.profiles set role = 'admin' where username = 'your_username';
```

`OPENAI_API_KEY` is optional. Without it, "Generate Next-Day Plan" returns clearly labelled sample quests.

---

## 📂 Project Structure

```
├── app/                 pages and API routes
│   ├── dashboard/       focus, quests, jury, party, store, dailies, journal, leaderboard, profile, admin
│   └── api/             admin/*, proofs/[id], luck/*, generate-plan, discovery/analyze
├── components/          AuraRing, XPBar, FocusTimer, JuryCard, ProofUpload, Toast ...
├── context/             ThemeContext
├── hooks/               useProfile, useFocusMonitor, useJuryQueue ...
├── lib/                 rpg-engine, focus-monitor, zod schemas, Supabase clients, server auth helpers
├── supabase/
│   ├── migrations/      001–026 (forward-only; 021+ are the security hardening)
│   └── tests/           SQL security tests, race-condition test
├── tests/               unit tests
├── docs/                security, decisions, schema snapshot, original design docs
└── middleware.ts        session refresh
```

---

## 🎮 Core Features

### ⚔ The Jail (Focus Monitor)

Three browser signals feed one monitor: the Page Visibility API (tab hidden), window blur (browser loses focus) and
mouse-leave on the page. A **10-second grace period** forgives accidental switches; after that, **−5 Aura** is deducted
by a database function. This runs in the browser, so it is a **deterrent, not tamper-proof**.

### ⚖ The Jury (Weighted Voting)

```
Verdict = Σ(vote_i × juror_aura_i) / Σ(juror_aura_i)      vote_i = 1 approve, 0 reject

≥ 0.6  → approved (XP + Aura, with a luck-based chance of a 1.5× critical hit)
< 0.4  → rejected (−20 Aura for the submitter)
else   → stays pending until more votes arrive
```

Jurors who voted with the final verdict earn +10 XP and +2 Aura (max 10 bonuses a day).

### 🌀 Aura Ring and RPG stats

| Stat | Meaning | Changes |
|------|---------|---------|
| **Aura** | Reputation (the ring is scaled 0–1000) | + quests, − focus violations, − jury rejection |
| **XP / Level** | Experience and a level derived from it | + quest rewards (daily caps apply) |
| **Luck** | Chance of a critical hit | Boosted by Daily Discovery, capped |
| **Streak** | Consecutive active days | Resets on a missed day |

The ring changes colour and pulse speed as your Aura grows.

### 🛒 Everything else

Parties (shared pools), a store you spend Aura in, daily luck roll, journal and dailies, a leaderboard, a skill tree and an
admin panel (server-side checks, role in the database).

---

## 🗂 Database

```
profiles        player stats (aura, xp, level, luck, streak, role)
quests          available quests and rewards
user_quests     one row per attempt, with the status machine
jury_votes      one vote per juror per submission, with an Aura snapshot
aura_log        append-only history of Aura changes (tamper-resistant, not tamper-proof)
```

Plus parties, store items and purchases, daily logs, and two safe public views (`leaderboard`, `party_directory`).
Readable reference: [`docs/SCHEMA_SNAPSHOT.md`](docs/SCHEMA_SNAPSHOT.md) (and `docs/schema_snapshot.sql`).

---

## 🏗 Development Workflow

```bash
npm run dev           # dev server
npm run build         # production build
npm run lint          # ESLint
npm run typecheck     # TypeScript
npm test              # unit tests (validation, level maths)
npm run test:db       # migrations + ~260 security tests on a throwaway local Postgres
```

```bash
DATABASE_URL='postgres://postgres@localhost:5432/liferpg_test' npm run test:db
```

The database test refuses to run unless the database is local and its name contains `test`. CI runs all of the
above on every push (`.github/workflows/ci.yml`).

---

## 📦 Deployment (Vercel)

1. Push the repo to GitHub, then import it in Vercel.
2. Add these environment variables in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (**never** with a `NEXT_PUBLIC_` prefix), and optionally `OPENAI_API_KEY`.
3. In Supabase → Authentication → URL Configuration, set the Site URL to your Vercel URL.

---

## ⚠️ Known Limitations

- The focus jail runs in the browser; a determined user can bypass it.
- Coordinated fake accounts can still approve each other's quests. Aura weighting and daily caps raise the cost but do not remove the risk.
- Nothing checks the quest timer on the server.
- Daily Discovery "analysis" is simulated; the photo is not analysed.
- Installable as a PWA (manifest only): there is no service worker and no offline mode.
- `npm audit` still lists Next.js 14 advisories that need a move to Next 16.
- Database security was tested on plain Postgres with stand-ins for Supabase's auth and storage, not on a live Supabase project.

More: [`docs/SECURITY.md`](docs/SECURITY.md) · [`docs/DECISIONS.md`](docs/DECISIONS.md)

---

## 🗺 Roadmap

**Done**
- [x] Auth, quests, focus monitor, jury, store, parties, leaderboard, admin panel
- [x] Database lockdown, RPC-only writes, private proof storage
- [x] Security tests, race-condition test, CI

**Next**
- [ ] Server-side focus heartbeat so the focus rule can be enforced
- [ ] Minimum time between starting a quest and submitting proof
- [ ] Account-age rule and random juror assignment against collusion
- [ ] Real image analysis for Daily Discovery
- [ ] End-to-end tests (Playwright) and error monitoring
- [ ] Upgrade to Next.js 16

---

## 📄 Documentation

| Document | Description |
|---------|-------------|
| [docs/SECURITY.md](docs/SECURITY.md) | Security model, what was fixed, honest limits, rollout checklist |
| [docs/HARDENING_LOG.md](docs/HARDENING_LOG.md) | Per phase: what changed, why, how to verify, how to roll back |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Design decisions and UI-visible changes |
| [docs/SCHEMA_SNAPSHOT.md](docs/SCHEMA_SNAPSHOT.md) | Readable view of the final database |
| [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) · [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md) | Original design documents |
| [docs/Life-RPG-PRD-v1.2.pdf](docs/Life-RPG-PRD-v1.2.pdf) | Original product requirements |

---

## 🤝 Contributing

1. Fork and create a branch: `git checkout -b feat/your-feature`
2. Commit with a clear message: `git commit -m "feat: add jury pool randomisation"`
3. Make sure `npm run lint`, `npm run typecheck`, `npm test` and `npm run test:db` pass
4. Open a pull request against `main`

---

## 📝 License

No licence has been chosen yet, so by default **all rights are reserved**. Add a `LICENSE` file (for example MIT) if you want others to reuse the code.

---

<div align="center">

**Built by [YOUR NAME](https://github.com/YOUR-USERNAME)**

*"Every minute of genuine focus is a step toward becoming legendary."*

</div>
