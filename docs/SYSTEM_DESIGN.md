# 🧠 Life-RPG Protocol — System Design Document

> **Status: read this first.** This document is the original design *intent* (v1.2), kept for context.
> It is **not** a description of what is built. Known differences:
>
> | Idea in this document | Reality today |
> |---|---|
> | Offline play via a service worker (PWA) | Only an installable `manifest.json` exists. **No service worker, no offline support.** Placeholder icons (a cyan ring) are in `public/`. |
> | "Zero-trust" focus monitor | A browser-side **soft deterrent**. A determined user can bypass it, because the server never sees tab switches. |
> | "Immutable" audit trail | `aura_log` is **append-only** (a trigger blocks UPDATE/DELETE), which is tamper-*resistant*. A database owner can still change it, and XP grants are not logged. |
> | Sentry, structured logging, error boundaries, client-side image compression | Not implemented. |
> | Server components + Suspense streaming | Dashboard pages are client components. |
> | Jury verdict calculated client-side / in the API route | Calculated inside the database (`_resolve_verdict`), see `docs/SECURITY.md`. |
> | Security headers incl. CSP | Basic headers are set in `next.config.mjs`. **No CSP yet.** |
>
> Security-relevant sections (4.3 RLS, 8 Jury, 10 API, 11 Storage, 12 Realtime) were superseded by the
> hardening work: the authoritative description is `docs/SECURITY.md`.

> Version 1.2 · Status: Draft → Review · Stack: Next.js 14 · Supabase · Tailwind · Framer Motion

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Frontend Design](#3-frontend-design)
4. [Backend & Database Design](#4-backend--database-design)
5. [Authentication & Security](#5-authentication--security)
6. [The Focus Monitor Engine](#6-the-focus-monitor-engine)
7. [The RPG Engine](#7-the-rpg-engine)
8. [The Jury System](#8-the-jury-system)
9. [State Management](#9-state-management)
10. [API Design](#10-api-design)
11. [Storage Architecture](#11-storage-architecture)
12. [Real-time Architecture](#12-real-time-architecture)
13. [PWA & Offline Strategy](#13-pwa--offline-strategy)
14. [Performance Design](#14-performance-design)
15. [Error Handling & Observability](#15-error-handling--observability)
16. [Scalability Considerations](#16-scalability-considerations)

---

## 1. System Overview

Life-RPG Protocol is a **gamified productivity platform** that enforces real-world focus through a multi-layer accountability system. The core design philosophy is:

> **"Trust Nothing. Verify Everything. Reward Authentically."**

### Core Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Defence in Depth (focus)** | Triple-layer monitoring in the browser (tab switch, blur, mouse leave). A soft deterrent, not tamper-proof: the server cannot observe it |
| **Reputation-Weighted Truth** | Jury votes weighted by Aura score — high-reputation users have more say |
| **Append-only Aura log** | Every Aura change made by the game functions is logged with a timestamp; a trigger blocks edits and deletes. XP changes are not logged |
| **Theme Agnosticism** | Classic (cyberpunk) and Modern (minimalist) share identical component APIs |
| **Installable** | A web app manifest lets mobile users add it to the home screen. No offline mode |

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│                                                                 │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│   │  Next.js 14  │   │ Framer Motion│   │  ThemeContext     │  │
│   │  App Router  │   │  Animations  │   │  Classic/Modern   │  │
│   └──────┬───────┘   └──────────────┘   └──────────────────┘  │
│          │                                                       │
│   ┌──────▼───────────────────────────────────────────────────┐  │
│   │              Component Layer                              │  │
│   │  AuraRing · XPBar · FocusTimer · ProofUpload · Toast     │  │
│   └──────┬───────────────────────────────────────────────────┘  │
└──────────┼──────────────────────────────────────────────────────┘
           │  HTTPS / WebSocket
┌──────────▼──────────────────────────────────────────────────────┐
│                      EDGE LAYER                                  │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │  middleware.ts (Vercel Edge)                              │  │
│   │  Auth guard · Route protection · JWT validation           │  │
│   └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────────┐
│                     SUPABASE LAYER                               │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Auth        │  │  PostgreSQL  │  │  Storage (Buckets)     │ │
│  │  (GoTrue)    │  │  + RLS       │  │  submissions (private) │ │
│  └─────────────┘  └──────────────┘  └────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Realtime (Phoenix Channels) — Jury notifications        │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Frontend Design

### 3.1 Route Structure (Next.js App Router)

```
app/
├── layout.tsx                  # Root layout — ThemeProvider, Toast
├── page.tsx                    # Landing / redirect to /dashboard
├── (auth)/
│   ├── login/
│   │   └── page.tsx            # Login form + particle canvas
│   └── signup/
│       └── page.tsx            # Signup form + theme toggle
├── dashboard/
│   ├── layout.tsx              # Dashboard shell — Navbar, AuraRing sidebar
│   ├── page.tsx                # Overview — stats, active quest, streak
│   ├── quests/
│   │   ├── page.tsx            # Quest board — filterable list
│   │   └── [id]/
│   │       └── page.tsx        # Quest detail + start timer
│   ├── focus/
│   │   └── page.tsx            # Full-screen focus jail
│   ├── jury/
│   │   └── page.tsx            # Jury pool — pending verifications
│   └── profile/
│       └── page.tsx            # User stats, history, theme settings
└── api/
    ├── aura/deduct/route.ts    # POST — server-side aura deduction
    └── jury/vote/route.ts      # POST — submit jury vote
```

### 3.2 Component Hierarchy

```
<RootLayout>
  <ThemeProvider>          ← ThemeContext.tsx
    <ToastProvider>
      <Navbar />           ← AuraRing (mini) + XPBar (mini) + nav links
      {children}
      <Toast />
    </ToastProvider>
  </ThemeProvider>
</RootLayout>

Dashboard page:
<DashboardLayout>
  <StatsPanel>
    <AuraRing aura={user.aura} />          ← Dynamic SVG, Framer spring
    <XPBar xp={user.xp} level={user.level} />
    <StatCard label="Streak" />
    <StatCard label="Luck" />
  </StatsPanel>
  <ActiveQuestCard />
  <RecentActivity />
</DashboardLayout>

Focus page:
<FocusJail>
  <TimerDisplay />
  <FocusMonitor onViolation={deductAura} />   ← lib/focus-monitor.ts
  <ViolationOverlay />
  <CompletionModal>
    <ProofUpload />
  </CompletionModal>
</FocusJail>
```

### 3.3 Theme System Design

The `ThemeContext` drives a CSS custom property swap at the `:root` level. Components are written theme-agnostically using CSS variables; the context class (`data-theme="classic"` vs `data-theme="modern"`) switches the resolved values.

```typescript
// context/ThemeContext.tsx
type Theme = 'classic' | 'modern';
interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isClassic: boolean;
}
```

```css
/* globals.css */
[data-theme="classic"] {
  --accent-primary: #4af7ff;
  --accent-secondary: #9b59ff;
  --bg-base: #0d0d1a;
  --bg-card: #12122a;
  --glow: 0 0 20px #4af7ff80;
}
[data-theme="modern"] {
  --accent-primary: #0071e3;
  --bg-base: #f5f5f7;
  --bg-card: #ffffff;
  --glow: none;
}
```

---

## 4. Backend & Database Design

### 4.1 Database Schema (Full)

```sql
-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── PROFILES ───────────────────────────────────────────────────────
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  aura          integer not null default 0 check (aura >= 0),
  xp            integer not null default 0,
  level         integer not null default 1,
  luck          integer not null default 50,
  theme         text not null default 'classic' check (theme in ('classic','modern')),
  streak_days   integer not null default 0,
  last_active   date,
  created_at    timestamptz not null default now()
);

-- ── QUESTS ─────────────────────────────────────────────────────────
create table quests (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  difficulty       text not null check (difficulty in ('easy','medium','hard','legendary')),
  skill_type       text not null check (skill_type in ('focus','coding','fitness','creative')),
  xp_reward        integer not null,
  aura_reward      integer not null default 0,
  duration_minutes integer not null,
  requires_proof   boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ── USER_QUESTS ────────────────────────────────────────────────────
create table user_quests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  quest_id        uuid not null references quests(id),
  status          text not null default 'idle'
                  check (status in ('idle','active','pending_verification','completed','failed')),
  proof_url       text,
  started_at      timestamptz,
  completed_at    timestamptz,
  aura_penalty    integer not null default 0,
  jury_verdict    numeric(4,3),                 -- 0.000 to 1.000
  created_at      timestamptz not null default now(),
  unique(user_id, quest_id)                     -- one attempt per quest per user
);

-- ── JURY VOTES ─────────────────────────────────────────────────────
create table jury_votes (
  id              uuid primary key default gen_random_uuid(),
  user_quest_id   uuid not null references user_quests(id) on delete cascade,
  juror_id        uuid not null references profiles(id),
  vote            boolean not null,              -- true = approve, false = reject
  juror_aura_snapshot integer not null,          -- Aura at time of vote (immutable)
  created_at      timestamptz not null default now(),
  unique(user_quest_id, juror_id)
);

-- ── AURA LOG ───────────────────────────────────────────────────────
create table aura_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id),
  delta       integer not null,                 -- positive or negative
  reason      text not null,                    -- 'focus_violation' | 'quest_complete' | 'jury_bonus'
  created_at  timestamptz not null default now()
);
```

### 4.2 Database Triggers

```sql
-- Auto-create profile on user signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Auto-update level when XP changes
create or replace function update_level()
returns trigger as $$
begin
  new.level = floor(1 + sqrt(new.xp::float / 100));
  return new;
end;
$$ language plpgsql;

create trigger on_xp_update
  before update of xp on profiles
  for each row execute procedure update_level();
```

### 4.3 Row Level Security (RLS)

```sql
-- profiles: users read their own; jury can read others' aura
alter table profiles enable row level security;
create policy "Users read own profile" on profiles for select using (auth.uid() = id);
create policy "Users update own profile" on profiles for update using (auth.uid() = id);
create policy "Jury reads aura" on profiles for select using (true);  -- aura is public

-- user_quests: owner full access; jury reads pending_verification
alter table user_quests enable row level security;
create policy "Owner manages quest" on user_quests
  using (auth.uid() = user_id);
create policy "Jury reads pending" on user_quests for select
  using (status = 'pending_verification');

-- jury_votes: jurors write own votes; can't see others' votes
alter table jury_votes enable row level security;
create policy "Juror inserts own vote" on jury_votes for insert
  with check (auth.uid() = juror_id);
create policy "No vote snooping" on jury_votes for select
  using (auth.uid() = juror_id);
```

---

## 5. Authentication & Security

### 5.1 Auth Flow

```
User visits /dashboard
      │
      ▼
middleware.ts (Edge Runtime)
  ├─ Reads Supabase session cookie
  ├─ Validates JWT signature + expiry
  ├─ VALID → forward request
  └─ INVALID → redirect 307 → /login
         │
         ▼
  /login page
  User submits credentials
         │
         ▼
  supabase.auth.signInWithPassword()
         │
         ├─ Success → session cookie set (httpOnly, Secure, SameSite=Lax)
         │            redirect → /dashboard
         └─ Failure → display error Toast
```

### 5.2 Middleware Implementation

```typescript
// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PATHS = ['/dashboard', '/focus', '/jury', '/profile'];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  const isProtected = PROTECTED_PATHS.some(p => req.nextUrl.pathname.startsWith(p));

  if (isProtected && !session) {
    const redirectUrl = new URL('/login', req.url);
    redirectUrl.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (session && req.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

---

## 6. The Focus Monitor Engine

### 6.1 Detection Stack Design

Three independent listeners fire into a shared `violationCount` state. The grace period timer only starts when **all active listeners agree** there is a violation.

```typescript
// lib/focus-monitor.ts
export class FocusMonitor {
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private violations = new Set<string>();
  private readonly GRACE_MS = 10_000;

  private readonly listeners = [
    { name: 'visibility', attach: () => this.attachVisibility() },
    { name: 'blur',       attach: () => this.attachBlur()       },
    { name: 'mouseleave', attach: () => this.attachMouseLeave() },
  ];

  constructor(private onPenalty: () => void) {}

  start() { this.listeners.forEach(l => l.attach()); }
  stop()  { this.cleanup(); }

  private triggerViolation(source: string) {
    this.violations.add(source);
    if (!this.graceTimer) {
      this.graceTimer = setTimeout(() => this.onPenalty(), this.GRACE_MS);
    }
  }

  private clearViolation(source: string) {
    this.violations.delete(source);
    if (this.violations.size === 0 && this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
  }

  private attachVisibility() {
    const handler = () => document.hidden
      ? this.triggerViolation('visibility')
      : this.clearViolation('visibility');
    document.addEventListener('visibilitychange', handler);
  }

  private attachBlur() {
    window.addEventListener('blur',  () => this.triggerViolation('blur'));
    window.addEventListener('focus', () => this.clearViolation('blur'));
  }

  private attachMouseLeave() {
    const html = document.documentElement;
    html.addEventListener('mouseleave', () => this.triggerViolation('mouseleave'));
    html.addEventListener('mouseenter', () => this.clearViolation('mouseleave'));
  }

  private cleanup() {
    // removeEventListeners (stored refs in real implementation)
    if (this.graceTimer) clearTimeout(this.graceTimer);
  }
}
```

### 6.2 Penalty Execution

```typescript
// lib/supabase.ts — server action
export async function deductAura(userId: string, reason: string) {
  const { error } = await supabase.rpc('deduct_aura', {
    p_user_id: userId,
    p_amount: 5,
    p_reason: reason,
  });
  if (error) throw new AuraDeductionError(error.message);
}
```

```sql
-- Supabase RPC: atomic aura deduction + log
create or replace function deduct_aura(p_user_id uuid, p_amount int, p_reason text)
returns void as $$
begin
  update profiles
  set aura = greatest(0, aura - p_amount)
  where id = p_user_id;

  insert into aura_log(user_id, delta, reason)
  values (p_user_id, -p_amount, p_reason);
end;
$$ language plpgsql security definer;
```

---

## 7. The RPG Engine

```typescript
// lib/rpg-engine.ts

const DIFFICULTY_MULTIPLIERS = {
  easy: 1, medium: 1.5, hard: 2, legendary: 3
} as const;

export const rpgEngine = {
  /** XP → Level */
  xpToLevel: (xp: number): number =>
    Math.floor(1 + Math.sqrt(xp / 100)),

  /** XP needed to reach next level */
  xpToNextLevel: (currentXp: number): number => {
    const level = rpgEngine.xpToLevel(currentXp);
    return Math.pow(level, 2) * 100 - currentXp;
  },

  /** Quest XP reward with streak bonus */
  calculateQuestXp: (baseXp: number, difficulty: keyof typeof DIFFICULTY_MULTIPLIERS, streak: number): number => {
    const streakBonus = Math.min(2.0, 1 + Math.floor(streak / 7) * 0.1);
    return Math.floor(baseXp * DIFFICULTY_MULTIPLIERS[difficulty] * streakBonus);
  },

  /** Jury verdict (reputation-weighted average) */
  calculateVerdict: (votes: Array<{ vote: boolean; jurorAura: number }>): number => {
    const totalWeight = votes.reduce((s, v) => s + v.jurorAura, 0);
    if (totalWeight === 0) return 0.5;
    const weightedApprove = votes
      .filter(v => v.vote)
      .reduce((s, v) => s + v.jurorAura, 0);
    return weightedApprove / totalWeight;
  },

  /** Aura ring visual state */
  auraRingState: (aura: number): { color: string; pulseSpeed: number } => {
    if (aura < 100)  return { color: '#888888', pulseSpeed: 3   };
    if (aura < 300)  return { color: '#4af7ff', pulseSpeed: 2   };
    if (aura < 600)  return { color: '#9b59ff', pulseSpeed: 1.5 };
    if (aura < 1000) return { color: '#ff6b6b', pulseSpeed: 1   };
    return                  { color: '#ffd700', pulseSpeed: 0.5  };
  },
};
```

---

## 8. The Jury System

### 8.1 Jury Pool Selection

To prevent collusion, jurors are selected from a randomised pool that excludes:
- The quest submitter
- Users who have interacted with the submitter in the last 7 days
- Users with Aura < 100 (minimum threshold)

```typescript
// lib/jury-pool.ts
export async function getJuryPool(
  userQuestId: string,
  submitterId: string,
  poolSize = 5
): Promise<Profile[]> {
  const { data } = await supabase.rpc('get_jury_pool', {
    p_submitter: submitterId,
    p_quest: userQuestId,
    p_size: poolSize,
  });
  return data ?? [];
}
```

### 8.2 Verdict Resolution Flow

```
jury_votes inserts (realtime subscription)
           │
           ▼
  check: votes >= MIN_JURY_SIZE (3)
  AND   (time_since_submission > 1hr OR all_jurors_voted)
           │
           ▼
  rpgEngine.calculateVerdict(votes)
           │
    ┌──────┴──────┐
  ≥ 0.6         < 0.4
  APPROVE       REJECT
    │               │
  +XP            -Aura
  +Aura          status = 'failed'
  status =       notify user
  'completed'
```

---

## 9. State Management

The app uses **React Context** for cross-cutting concerns and **URL state** for navigation state. No external state library is needed at this scale.

| State Type | Location | Why |
|-----------|----------|-----|
| Theme preference | `ThemeContext` + localStorage | Global, rarely changes |
| User profile + stats | Server Component fetch + SWR | Needs revalidation |
| Active focus session | `FocusContext` (local to focus route) | Ephemeral, real-time |
| Toast notifications | `ToastContext` | Global, event-driven |
| Quest list filters | URL search params | Shareable, browser-native |

---

## 10. API Design

### 10.1 Route Handlers (Next.js App Router)

```typescript
// app/api/aura/deduct/route.ts
export async function POST(req: Request) {
  const { userId, reason } = await req.json();
  // Validate session — users can only deduct from themselves
  const session = await getServerSession();
  if (session?.user.id !== userId) return new Response('Forbidden', { status: 403 });

  await deductAura(userId, reason);
  return Response.json({ success: true });
}
```

```typescript
// app/api/jury/vote/route.ts
export async function POST(req: Request) {
  const { userQuestId, vote } = await req.json();
  const session = await getServerSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const result = await submitJuryVote(session.user.id, userQuestId, vote);
  return Response.json(result);
}
```

---

## 11. Storage Architecture

```
Supabase Storage
└── submissions (PRIVATE bucket, 5 MB limit, images only)
    └── {userId}/
        └── {uuid}.{jpg|jpeg|png|webp|gif}

Upload (browser, own folder only — enforced by storage policy):
  supabase.storage.from('submissions').upload('{userId}/{uuid}.png', file)

Hand in:    rpc('submit_quest_proof', { p_user_quest_id, p_proof_path })
            (database checks: you own the quest, it is active, the file exists in YOUR folder)

View:       GET /api/proofs/:userQuestId
            -> database function get_proof_path_for_viewer decides who may look
               (the owner, or a juror with >= 100 Aura while the quest is pending)
            -> server signs a link that expires after 5 minutes
```

Client-side image compression (planned in v1.2) is **not implemented**.

---

## 12. Real-time Architecture

Only one live channel is used:

| Channel | Subscribe To | Purpose |
|---------|-------------|---------|
| `my-profile` | `profiles` WHERE `id = <your id>` | Live Aura/XP updates on the dashboard |

The jury queue is **not** live. Players can no longer read other players' quest rows
(that was a privacy hole), so the queue calls `get_jury_queue()` and refreshes every 20 seconds.

---

## 13. PWA (installable manifest only)

`public/manifest.json` lets users install the app from the browser ("Add to Home Screen"):
`display: standalone`, theme colour `#4af7ff`, start URL `/`.

**What does NOT exist:** a service worker, caching, offline mode, or `next-pwa`.
The manifest references `/icon-192.png` and `/icon-512.png`; these are simple generated placeholders
(a cyan ring) that you can replace with real artwork.

If offline support is wanted later, it needs a service worker (for example via `next-pwa`
or a hand-written one) and a decision about what is safe to cache. Nothing from `/api/*`
or the proof images should be cached.

---

## 14. Performance Design (ideas, mostly not implemented)

- **React Server Components** for quest board — zero client JS for initial render
- **Streaming with Suspense** — dashboard loads incrementally; stats appear instantly while quests stream
- **Dynamic imports** for `FocusTimer` and `ProofUpload` — not loaded until needed
- **Image optimisation** — Next.js `<Image>` for all user avatars; WebP compression on proof uploads
- **Database indexing:**
```sql
create index idx_user_quests_status     on user_quests(status);
create index idx_user_quests_user_id    on user_quests(user_id);
create index idx_jury_votes_quest       on jury_votes(user_quest_id);
create index idx_aura_log_user_created  on aura_log(user_id, created_at desc);
```

---

## 15. Error Handling & Observability (planned, not implemented)

### Error Boundary Strategy

```
GlobalErrorBoundary (layout.tsx)
  └── RouteErrorBoundary (per-route)
       └── ComponentErrorBoundary (FocusTimer, ProofUpload)
```

### Sentry Integration

```typescript
// lib/monitoring.ts
export function captureAuraError(error: Error, context: Record<string, unknown>) {
  Sentry.captureException(error, {
    tags: { subsystem: 'aura-engine' },
    extra: context,
  });
}
```

### Structured Logging

All server-side operations emit JSON logs with:
- `userId` (hashed for privacy in logs)
- `operation` (e.g., `aura.deduct`, `jury.vote`)
- `durationMs`
- `success` boolean

---

## 16. Scalability Considerations

| Concern | Current Design | Scale-out Path |
|---------|---------------|----------------|
| DB connections | Supabase PgBouncer | Read replicas for jury queries |
| Realtime channels | Supabase Realtime | Partition channels by shard |
| Storage | Supabase Storage | CDN + lifecycle policies |
| Focus violation writes | Direct RPC | Queue via pg_notify if >1k concurrent users |
| Jury verdict compute | Database function `_resolve_verdict` (row-locked) | Already server-side |
| Auth | Supabase GoTrue | Already horizontally scaled |

---

*Life-RPG Protocol System Design v1.2 (annotated during security hardening). The licence of this project has not been chosen yet; see docs/DECISIONS.md.*
