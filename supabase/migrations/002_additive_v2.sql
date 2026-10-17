-- ============================================================
-- Migration 002: Additive V2 — Private Quests, Daily Logs,
--                Jury Consensus Tracking
-- ============================================================

-- ── 1. PRIVATE QUESTS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.private_quests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  description     TEXT,
  skill_type      TEXT        NOT NULL CHECK (skill_type = ANY (ARRAY['focus','coding','fitness','creative'])),
  xp_reward       INTEGER     NOT NULL DEFAULT 50  CHECK (xp_reward  BETWEEN 10  AND  200),
  aura_reward     INTEGER     NOT NULL DEFAULT 0   CHECK (aura_reward BETWEEN 0   AND   20),
  duration_minutes INTEGER    NOT NULL DEFAULT 25  CHECK (duration_minutes > 0),
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status = ANY (ARRAY['active','completed','archived'])),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_private_quests_user_id
  ON public.private_quests(user_id);

ALTER TABLE public.private_quests ENABLE ROW LEVEL SECURITY;

-- Correctly dropping the Private Quests policy
DROP POLICY IF EXISTS "Users can manage own private quests" ON public.private_quests;

CREATE POLICY  "Users can manage own private quests"
  ON public.private_quests
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);



-- ── 3. JURY CONSENSUS TRACKING ────────────────────────────────
ALTER TABLE public.jury_votes
  ADD COLUMN IF NOT EXISTS verdict_match BOOLEAN DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_jury_votes_verdict_match
  ON public.jury_votes(user_quest_id, verdict_match);

