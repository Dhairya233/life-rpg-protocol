-- ============================================================
-- LIFE-RPG PROTOCOL — Complete Database Schema
-- Following SYSTEM_DESIGN.md v1.2 conventions
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- ── EXTENSIONS ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: profiles
-- Core user stats — extends Supabase auth.users (1:1 via trigger)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE NOT NULL,
  aura          INTEGER NOT NULL DEFAULT 0 CHECK (aura >= 0),
  xp            INTEGER NOT NULL DEFAULT 0,
  level         INTEGER NOT NULL DEFAULT 1,
  luck          INTEGER NOT NULL DEFAULT 50,
  theme         TEXT NOT NULL DEFAULT 'classic' CHECK (theme IN ('classic', 'modern')),
  streak_days   INTEGER NOT NULL DEFAULT 0,
  last_active   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: quests
-- Quest templates / blueprints (reusable by all users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  description      TEXT,
  difficulty       TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'legendary')),
  skill_type       TEXT NOT NULL CHECK (skill_type IN ('focus', 'coding', 'fitness', 'creative')),
  xp_reward        INTEGER NOT NULL,
  aura_reward      INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL,
  requires_proof   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: user_quests
-- Per-user quest attempts with status tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_quests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id        UUID NOT NULL REFERENCES public.quests(id),
  status          TEXT NOT NULL DEFAULT 'idle'
                  CHECK (status IN ('idle', 'active', 'pending_verification', 'completed', 'failed')),
  proof_url       TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  aura_penalty    INTEGER NOT NULL DEFAULT 0,
  jury_verdict    NUMERIC(4,3),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, quest_id)
);

-- ============================================================
-- TABLE: jury_votes
-- Individual jury votes with Aura snapshot for weighted voting
-- ============================================================
CREATE TABLE IF NOT EXISTS public.jury_votes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_quest_id       UUID NOT NULL REFERENCES public.user_quests(id) ON DELETE CASCADE,
  juror_id            UUID NOT NULL REFERENCES public.profiles(id),
  vote                BOOLEAN NOT NULL,              -- true = approve, false = reject
  juror_aura_snapshot INTEGER NOT NULL,              -- Aura at time of vote (immutable)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_quest_id, juror_id)
);

-- ============================================================
-- TABLE: aura_log
-- Immutable audit trail of every Aura change
-- ============================================================
CREATE TABLE IF NOT EXISTS public.aura_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id),
  delta       INTEGER NOT NULL,                      -- positive or negative
  reason      TEXT NOT NULL,                          -- 'focus_violation' | 'quest_complete' | 'jury_bonus' | 'jury_rejection'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
