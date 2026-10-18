-- ============================================================
-- Migration 021: Reconcile schema drift
--
-- WHY: the app code used things that no earlier migration created
-- (daily_logs, proof_submitted_at, the 'completed_critical' status),
-- so a database built only from migrations did not match the app.
-- Everything here is idempotent: safe on a fresh DB and on a DB
-- that already got some of these changes by hand.
--
-- No security changes here (that starts in 022). This one only makes
-- the schema match what the code expects, plus adds sanity limits.
-- ============================================================

-- ── 1. user_quests ──────────────────────────────────────────
-- resolve_verdict (012) writes 'completed_critical', but the CHECK
-- from 001 did not allow it, so every critical-hit approval crashed.
ALTER TABLE public.user_quests DROP CONSTRAINT IF EXISTS user_quests_status_check;
ALTER TABLE public.user_quests ADD CONSTRAINT user_quests_status_check
  CHECK (status IN ('idle', 'active', 'pending_verification',
                    'completed', 'completed_critical', 'failed'));

-- The jury queue and admin court sort by this column.
ALTER TABLE public.user_quests ADD COLUMN IF NOT EXISTS proof_submitted_at TIMESTAMPTZ;

-- From now on proof_url stores the storage OBJECT PATH, not a URL.
-- (Images are shown through short-lived signed URLs, see migration 025.)
COMMENT ON COLUMN public.user_quests.proof_url IS
  'Storage object path inside the private "submissions" bucket: {user_id}/{uuid}.{ext}. Not a URL.';

-- ── 2. daily_logs (diary / journal) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry       TEXT        NOT NULL,
  xp_awarded  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_logs ADD COLUMN IF NOT EXISTS xp_awarded INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_created ON public.daily_logs (user_id, created_at DESC);
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.daily_logs DROP CONSTRAINT IF EXISTS daily_logs_entry_length;
ALTER TABLE public.daily_logs ADD CONSTRAINT daily_logs_entry_length
  CHECK (char_length(entry) BETWEEN 1 AND 2000) NOT VALID;   -- NOT VALID = do not re-check old rows

-- ── 3. Sanity limits on values ──────────────────────────────
-- Rewards are bounded so one bad row (or bad admin input) cannot mint
-- absurd XP/Aura. NOT VALID keeps any legacy rows from blocking the
-- migration; every NEW or UPDATED row is checked.
-- (3000 XP x 1.5 critical hit = 4500, which stays under the 5000 grant cap.)
ALTER TABLE public.quests DROP CONSTRAINT IF EXISTS quests_reward_bounds;
ALTER TABLE public.quests ADD CONSTRAINT quests_reward_bounds CHECK (
  xp_reward BETWEEN 0 AND 3000 AND aura_reward BETWEEN 0 AND 500 AND duration_minutes BETWEEN 1 AND 720
) NOT VALID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_allowed;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_allowed
  CHECK (role IN ('user', 'admin'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_format
  CHECK (username ~ '^[A-Za-z0-9_.-]{3,30}$') NOT VALID;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_luck_boost_bounds;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_luck_boost_bounds
  CHECK (active_luck_boost BETWEEN 0 AND 50) NOT VALID;
