-- ============================================================
-- LIFE-RPG PROTOCOL — Realtime + Leaderboard
-- ============================================================

-- Enable Realtime on key tables



-- Leaderboard view
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  id,
  username,
  aura,
  xp,
  level,
  streak_days,
  created_at
FROM public.profiles
ORDER BY xp DESC;
