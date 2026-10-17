-- ============================================================
-- LIFE-RPG PROTOCOL — Indexes & Performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_user_quests_status
  ON public.user_quests(status);

CREATE INDEX IF NOT EXISTS idx_user_quests_user_id
  ON public.user_quests(user_id);

CREATE INDEX IF NOT EXISTS idx_jury_votes_quest
  ON public.jury_votes(user_quest_id);

CREATE INDEX IF NOT EXISTS idx_aura_log_user_created
  ON public.aura_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_quests_pending
  ON public.user_quests(status)
  WHERE status = 'pending_verification';
