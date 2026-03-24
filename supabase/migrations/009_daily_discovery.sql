-- ============================================================
-- Migration 009: Daily Discovery
-- Additive integration for the Daily Discovery AI upload feature
-- ============================================================

-- 1. Additive Column to Profiles for Temporary Luck Boost
-- Used to temporarily bolster user's luck stat for their next active focus/quest roll.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_luck_boost INTEGER DEFAULT 0;

-- 2. Daily Discoveries Rate Limiting & Tracking Table
CREATE TABLE IF NOT EXISTS public.daily_discoveries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url        TEXT        NOT NULL,
  analysis_summary TEXT        NOT NULL,
  luck_granted     INTEGER     NOT NULL DEFAULT 10,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient rate-limiting queries (fetching today's uploads)
CREATE INDEX IF NOT EXISTS idx_daily_discoveries_user_date
  ON public.daily_discoveries(user_id, created_at DESC);

-- RLS Policies
ALTER TABLE public.daily_discoveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own discoveries" ON public.daily_discoveries;
CREATE POLICY "Users can manage own discoveries"
  ON public.daily_discoveries
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
