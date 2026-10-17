# ⚔ Life-RPG Protocol

> **Transform your focus sessions into legendary quests. Earn Aura. Level up for real.**

![Version](https://img.shields.io/badge/version-1.2-4af7ff?style=flat-square)
![Stack](https://img.shields.io/badge/stack-Next.js%2014%20%7C%20Supabase%20%7C%20Tailwind-9b59ff?style=flat-square)
![Status](https://img.shields.io/badge/status-Active%20Development-39ff6b?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-white?style=flat-square)

---

## 📖 What is Life-RPG Protocol?

Life-RPG Protocol is a **gamified productivity ecosystem** where your real-world focus sessions are converted into in-game currency. It is built on two core principles:

1. **The Jail** — A triple-layer focus monitor that detects tab switching, window blurring, and mouse leaving. Cheat your focus session, lose Aura.
2. **The Jury** — A reputation-weighted peer review system where other users verify your completed quests via submitted proof photos.

Every stat you earn is backed by real effort. No fake grinding. The community holds you accountable.

---

## 🗺 User Flow Diagram

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                         LIFE-RPG USER FLOW                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

  [NEW USER]
      │
      ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                    ONBOARDING GATE                          │
  │                                                             │
  │  ┌──────────────┐          ┌──────────────────────────────┐ │
  │  │  /login      │          │  /signup                     │ │
  │  │              │          │                              │ │
  │  │  Email ───── │──────────│ Email + Password + Username  │ │
  │  │  Password    │          │                              │ │
  │  │              │          │ Theme: [Classic] [Modern]    │ │
  │  └──────┬───────┘          └──────────────┬───────────────┘ │
  │         │                                 │                  │
  │         │         Supabase Auth           │                  │
  │         └────────────────┬────────────────┘                  │
  └──────────────────────────┼──────────────────────────────────┘
                             │
                    JWT issued + cookie set
                    DB trigger creates profiles row
                    (aura=0, xp=0, luck=50)
                             │
                             ▼
  ╔══════════════════════════════════════════════════════════════╗
  ║                    /dashboard                                ║
  ║                                                              ║
  ║   ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   ║
  ║   │  AuraRing   │  │    XPBar    │  │   Streak / Luck  │   ║
  ║   │    (SVG)    │  │  Level 1    │  │    Day 0 / 50    │   ║
  ║   └─────────────┘  └─────────────┘  └──────────────────┘   ║
  ║                                                              ║
  ║   ┌──────────────────────────────────────────────────────┐  ║
  ║   │  📋 Active Quest: None          [Browse Quests →]    │  ║
  ║   └──────────────────────────────────────────────────────┘  ║
  ╚══════════════════════════════════════════════════════════════╝
                             │
                             │  User clicks "Browse Quests"
                             ▼
  ╔══════════════════════════════════════════════════════════════╗
  ║                   /dashboard/quests                          ║
  ║                                                              ║
  ║  Filter: [All] [Focus] [Coding] [Fitness] [Creative]        ║
  ║  Sort:   [Easy ▲] [Medium] [Hard] [Legendary]               ║
  ║                                                              ║
  ║  ┌──────────────────┐  ┌──────────────────┐                 ║
  ║  │ 📚 Deep Work      │  │ 💻 Ship a Feature │                ║
  ║  │ 90 min · Hard    │  │ 120 min · Legendary               ║
  ║  │ +800 XP +50 Aura │  │ +1500 XP +120 Aura│               ║
  ║  │ [View Quest]     │  │ [View Quest]      │                ║
  ║  └──────────────────┘  └──────────────────┘                 ║
  ╚══════════════════════════════════════════════════════════════╝
                             │
                             │  User clicks "View Quest" → "Start Quest"
                             ▼
  ╔══════════════════════════════════════════════════════════════╗
  ║                 /dashboard/focus  (THE JAIL)                 ║
  ║                                                              ║
  ║  ┌──────────────────────────────────────────────────────┐   ║
  ║  │              ⏱  01:29:47                             │   ║
  ║  │           Deep Work Session Active                   │   ║
  ║  │                                                      │   ║
  ║  │  Status: ● FOCUSED                                   │   ║
  ║  └──────────────────────────────────────────────────────┘   ║
  ║                                                              ║
  ║  FocusMonitor ACTIVE:                                        ║
  ║    Layer 1: Page Visibility API  ✅ watching                 ║
  ║    Layer 2: Window Blur/Focus    ✅ watching                 ║
  ║    Layer 3: MouseLeave on <html> ✅ watching                 ║
  ╚══════════════════════════════════════════════════════════════╝
            │                              │
            │ VIOLATION DETECTED           │ SESSION COMPLETE
            ▼                              ▼
  ┌─────────────────────┐      ┌────────────────────────────────┐
  │  GRACE PERIOD       │      │  PROOF UPLOAD                  │
  │  ⚠ 10 second        │      │                                │
  │  countdown          │      │  📷 Drag & Drop or             │
  │                     │      │     Click to Upload            │
  │  Return to tab to   │      │                                │
  │  cancel penalty     │      │  [Submit for Jury Review →]   │
  └──────┬──────────────┘      └──────────────┬─────────────────┘
         │                                    │
   ┌─────┴──────┐                             │
   │ Recovered? │                   user_quests.status
   └─────┬──────┘                   → pending_verification
         │                                    │
   NO ───►  -5 Aura deducted                  ▼
         │   aura_log INSERT        ╔══════════════════════════════╗
         │   Toast: "⚡ -5 Aura"   ║  /dashboard/jury             ║
         │                         ║  (Other users)               ║
   YES ──►  Timer resumes          ║                              ║
                                   ║  ┌──────────────────────┐    ║
                                   ║  │ 🔍 Quest Proof:       │    ║
                                   ║  │ "Deep Work - 90min"  │    ║
                                   ║  │                      │    ║
                                   ║  │ [📸 View Proof]      │    ║
                                   ║  │                      │    ║
                                   ║  │ [✅ Approve] [❌ Reject] │  ║
                                   ║  └──────────────────────┘    ║
                                   ║                              ║
                                   ║  Juror Aura: 342             ║
                                   ║  Weight in verdict: 342/Σ   ║
                                   ╚══════════════════════════════╝
                                              │
                          ┌───────────────────┴────────────────────┐
                          │        Verdict Engine                   │
                          │  Verdict = Σ(vote×aura) / Σ(aura)     │
                          └───────────────────┬────────────────────┘
                                    │
                          ┌─────────┴─────────┐
                     ≥ 0.6 │                   │ < 0.4
                          ▼                   ▼
               ┌──────────────────┐  ┌──────────────────────┐
               │  ✅ APPROVED      │  │  ❌ REJECTED          │
               │                  │  │                      │
               │  +800 XP         │  │  -20 Aura penalty    │
               │  +50 Aura        │  │  status = 'failed'   │
               │  status =        │  │  Toast: "Quest failed│
               │  'completed'     │  │  by jury."           │
               │                  │  │                      │
               │  AuraRing pulses │  │  ViolationOverlay    │
               │  Level up check  │  │  flash               │
               └────────┬─────────┘  └──────────────────────┘
                        │
                        ▼
              ╔══════════════════════════════╗
              ║  Back to /dashboard          ║
              ║                              ║
              ║  Aura: 50  XP: 800           ║
              ║  Level: 1 → 2 (at 900 XP)   ║
              ║  Streak: Day 1 🔥            ║
              ╚══════════════════════════════╝
                        │
                        └──► Repeat cycle → Grow stats → Level up

═══════════════════════════════════════════════════════════════════
                     QUEST STATUS STATE MACHINE
═══════════════════════════════════════════════════════════════════

   [idle] ──► [active] ──► [pending_verification] ──► [completed]
                                                  └──► [failed]

   idle:                 Quest exists, not yet started
   active:               Timer running, Jail enforced
   pending_verification: Proof uploaded, awaiting jury
   completed:            Jury approved, XP + Aura granted
   failed:               Jury rejected or timer abandoned

═══════════════════════════════════════════════════════════════════
                         AURA PROGRESSION MAP
═══════════════════════════════════════════════════════════════════

  0 ──────── 100 ──────── 300 ──────── 600 ──────── 1000 ────►
  │  Grey     │   Cyan     │  Purple   │   Red       │  Gold
  │  Slow     │   Normal   │  Fast     │   Rapid     │  Particle
  │  pulse    │   pulse    │  pulse    │   pulse     │  burst
  │ (3s)      │  (2s)      │  (1.5s)  │   (1s)      │  (0.5s)
  └───────────┴────────────┴──────────┴─────────────┴─────────►
```

---

## 🛠 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 14 (App Router) | RSC, Edge middleware, file routing |
| Database | Supabase (PostgreSQL) | Realtime, RLS, Storage, DB triggers |
| Auth | Supabase Auth (GoTrue) | JWT, httpOnly cookies, auto-refresh |
| Styling | Tailwind CSS | Utility-first, zero runtime |
| Animation | Framer Motion | Spring physics for AuraRing + XPBar |
| State | React Context API | ThemeContext — no overkill libraries |
| PWA | next-pwa | Service worker, offline support |
| Deployment | Vercel | Edge CDN, preview URLs |
| Monitoring | Sentry | Error tracking + performance |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18.17+ 
- npm 9+
- A [Supabase](https://supabase.com) account (free tier works)
- A [Vercel](https://vercel.com) account (for deployment)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/life-rpg-protocol.git
cd life-rpg-protocol
npm install
```

### 2. Configure Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Navigate to **Project Settings → API**
3. Copy your `Project URL` and `anon public` key

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run Database Migrations

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run all migrations
supabase db push

# Seed development data
supabase db seed
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the login screen.

### 5. Create Your First Account

1. Navigate to `/signup`
2. Enter username, email, and password
3. Select your theme (Classic = cyberpunk, Modern = minimalist)
4. You'll be redirected to the dashboard with Aura: 0, XP: 0

---

## 📂 Project Structure

```
life-rpg-protocol/
├── app/                    # Next.js App Router
│   ├── (auth)/login        # Login / Signup pages
│   ├── dashboard/          # Main app
│   │   ├── focus/          # THE JAIL — focus timer
│   │   ├── quests/         # Quest board + detail
│   │   ├── jury/           # Peer review queue
│   │   └── profile/        # User stats & settings
│   └── api/                # Route Handlers
├── components/             # AuraRing, XPBar, FocusTimer, Toast...
├── context/                # ThemeContext
├── lib/                    # rpg-engine, focus-monitor, supabase
├── hooks/                  # useProfile, useFocusMonitor, useJuryQueue
├── types/                  # TypeScript interfaces
├── supabase/migrations/    # SQL migration files
└── middleware.ts            # Edge auth guard
```

See [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) for the full annotated folder tree.

---

## 🎮 Core Features Deep Dive

### ⚔ The Jail (Focus Monitor)

The focus system uses **three independent detection layers** to prevent cheating:

```
Layer 1: Page Visibility API  — fires when tab is hidden
Layer 2: Window Blur event    — fires when browser loses focus  
Layer 3: MouseLeave on <html> — fires when cursor leaves viewport
```

All three layers feed into a shared violation state. A **10-second grace period** allows accidental tab switches. If the violation persists beyond 10 seconds, `-5 Aura` is automatically deducted.

### ⚖ The Jury (Weighted Voting)

After a quest is completed, users upload photo proof. The system selects a randomised jury pool (minimum Aura: 100) who review the submission and vote `Approve` or `Reject`.

**Verdict formula:**
```
Verdict = Σ(vote_i × juror_aura_i) / Σ(juror_aura_i)

Where:
  vote_i = 1 (approve) or 0 (reject)
  juror_aura_i = juror's Aura at time of voting

Approved if Verdict ≥ 0.6
Rejected if Verdict < 0.4
```

High-reputation users (high Aura) carry more weight in the verdict — the community's most consistent performers decide what counts as genuine work.

### 🌀 The Aura Ring

The `AuraRing` component is a dynamic SVG that reflects your current Aura in real-time. It changes color and pulse speed as you level up:

| Aura Range | Color | Pulse Speed |
|-----------|-------|-------------|
| 0–99 | Grey `#888888` | 3s |
| 100–299 | Cyan `#4af7ff` | 2s |
| 300–599 | Purple `#9b59ff` | 1.5s |
| 600–999 | Red `#ff6b6b` | 1s + glow |
| 1000+ | Gold gradient | 0.5s + particles |

### 📊 RPG Stats

| Stat | Description | How it Changes |
|------|-------------|----------------|
| **Aura** | Reputation score | +Quests completed, −Focus violations, −Jury rejection |
| **XP** | Experience points | +Quest rewards (difficulty × streak multiplier) |
| **Level** | Derived from XP | `floor(1 + sqrt(XP / 100))` |
| **Luck** | Hidden multiplier | Affects bonus drop chance from quests |
| **Streak** | Consecutive days | Resets on missed day; boosts XP multiplier |

---

## 🗂 Database Schema

### Key Tables

```
profiles       — Core user stats (aura, xp, level, luck, streak)
quests         — Available tasks with difficulty + rewards
user_quests    — Per-user quest attempts with status tracking
jury_votes     — Individual jury votes with Aura snapshots
aura_log       — Immutable audit trail of every Aura change
```

### Quest Status Machine

```
idle → active → pending_verification → completed
                                    └→ failed
```

Full schema with SQL: see [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) — Section 4.

---

## 🔒 Security

- **Row Level Security (RLS)** on all tables — users can only read/write their own data
- **Service role key** never exposed to client bundles
- **httpOnly cookies** for JWT storage — not accessible via JavaScript
- **Signed URLs** for proof images — 1-hour TTL, server-generated only
- **Jury anti-collusion** — randomised pool, minimum Aura threshold, self-voting blocked

---

## 🏗 Development Workflow

### Available Scripts

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint check
npm run type-check   # TypeScript strict check
npm run test         # Jest unit tests
npm run test:e2e     # Playwright E2E tests
```

### Database Operations

```bash
supabase db pull          # Pull remote schema changes
supabase db push          # Apply local migrations to remote
supabase gen types typescript --project-id YOUR_ID > types/database.ts
supabase db reset         # Reset local dev DB (destructive!)
```

### Testing the Jail

To test the focus monitor in development without waiting 10 seconds:

```typescript
// lib/focus-monitor.ts — development override
const GRACE_MS = process.env.NODE_ENV === 'development' ? 2000 : 10000;
```

---

## 📦 Deployment

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Set these environment variables in your Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (your production URL)

### PWA Configuration

The app is PWA-ready. Users on mobile can install it via **"Add to Home Screen"**. The `display: fullscreen` mode in `manifest.json` removes browser chrome, making tab-switching harder on mobile (which triggers the Page Visibility API penalty more reliably).

---

## 🗺 Roadmap

### Sprint 0 — Foundation ✅
- [x] Supabase project + migrations
- [x] Auth flow (login, signup, middleware guard)
- [x] ThemeContext (Classic / Modern)

### Sprint 1 — The Jail 🚧
- [ ] FocusTimer component
- [ ] FocusMonitor class (triple-layer)
- [ ] Aura deduction RPC
- [ ] AuraRing SVG with Framer Motion
- [ ] XPBar component

### Sprint 2 — Quest Board ⬜
- [ ] Quest listing with filters
- [ ] Quest detail + start flow
- [ ] Status state machine
- [ ] ProofUpload component

### Sprint 3 — The Jury ⬜
- [ ] Supabase Storage integration
- [ ] Jury queue with Realtime
- [ ] Weighted voting UI
- [ ] Verdict resolution engine

### Sprint 4 — Polish ⬜
- [ ] PWA manifest + service worker
- [ ] Leaderboard
- [ ] Streak system
- [ ] Sentry error tracking
- [ ] Animation pass (Framer Motion)

### Sprint 5 — Launch ⬜
- [ ] E2E tests (Playwright)
- [ ] Load testing
- [ ] Production deploy
- [ ] Monitoring dashboards

---

## 📄 Documentation

| Document | Description |
|---------|-------------|
| [Life-RPG-PRD-v1.2.pdf](./Life-RPG-PRD-v1.2.pdf) | Product Requirements Document — complete specs, DB schema, formulae |
| [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) | Deep technical design — all module contracts, security, scaling |
| [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | Folder structure, data flows, ER diagram, deployment topology |
| [README.md](./README.md) | This file — setup guide, feature overview, user flow |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit using conventional commits: `git commit -m "feat: add jury pool randomisation"`
4. Push and open a Pull Request against `main`
5. Ensure `npm run type-check` and `npm run lint` pass

---

## 📝 License

MIT — see [LICENSE](./LICENSE) for details.

---

<div align="center">

**Built with ⚡ by the Life-RPG Team**

*"Every minute of genuine focus is a step toward becoming legendary."*

</div>
