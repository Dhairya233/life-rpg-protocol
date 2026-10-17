-- ============================================================
-- LIFE-RPG PROTOCOL — RPC Functions
-- Server-side stored procedures for atomic operations
-- ============================================================

-- ── Deduct Aura (atomic deduction + audit log) ───────────────
CREATE OR REPLACE FUNCTION public.deduct_aura(
  p_user_id UUID,
  p_amount  INT,
  p_reason  TEXT
)
RETURNS INT AS $$
DECLARE
  v_new_aura INT;
BEGIN
  UPDATE public.profiles
  SET aura = GREATEST(0, aura - p_amount)
  WHERE id = p_user_id
  RETURNING aura INTO v_new_aura;

  INSERT INTO public.aura_log (user_id, delta, reason)
  VALUES (p_user_id, -p_amount, p_reason);

  RETURN v_new_aura;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Grant Quest Rewards (XP + Aura atomically) ──────────────
CREATE OR REPLACE FUNCTION public.grant_quest_rewards(
  p_user_id    UUID,
  p_xp_amount  INT,
  p_aura_amount INT
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET xp   = xp + p_xp_amount,
      aura = aura + p_aura_amount
  WHERE id = p_user_id;

  IF p_aura_amount > 0 THEN
    INSERT INTO public.aura_log (user_id, delta, reason)
    VALUES (p_user_id, p_aura_amount, 'quest_complete');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Start Quest ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_quest(
  p_user_id  UUID,
  p_quest_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_uq_id UUID;
BEGIN
  INSERT INTO public.user_quests (user_id, quest_id, status, started_at)
  VALUES (p_user_id, p_quest_id, 'active', NOW())
  ON CONFLICT (user_id, quest_id) DO UPDATE
    SET status = 'active', started_at = NOW()
  RETURNING id INTO v_uq_id;

  RETURN v_uq_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Submit Quest Proof ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_quest_proof(
  p_user_quest_id UUID,
  p_proof_url     TEXT,
  p_note          TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_quests
  SET status    = 'pending_verification',
      proof_url = p_proof_url
  WHERE id = p_user_quest_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Get Jury Pool (randomised, excludes submitter, min Aura 100) ─
CREATE OR REPLACE FUNCTION public.get_jury_pool(
  p_submitter UUID,
  p_quest     UUID,
  p_size      INT DEFAULT 5
)
RETURNS SETOF public.profiles AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.profiles
  WHERE id != p_submitter
    AND aura >= 100
  ORDER BY RANDOM()
  LIMIT p_size;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Resolve Verdict (weighted voting) ────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_verdict(p_user_quest_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_verdict    NUMERIC;
  v_vote_count INT;
  v_user_id    UUID;
  v_quest_id   UUID;
  v_xp_reward  INT;
  v_aura_reward INT;
  v_result     TEXT;
BEGIN
  -- Count votes
  SELECT COUNT(*) INTO v_vote_count
  FROM public.jury_votes WHERE user_quest_id = p_user_quest_id;

  IF v_vote_count < 3 THEN
    RETURN 'insufficient_votes';
  END IF;

  -- Calculate weighted verdict: Σ(vote × aura) / Σ(aura)
  SELECT COALESCE(
    SUM(CASE WHEN vote THEN juror_aura_snapshot ELSE 0 END)::NUMERIC /
    NULLIF(SUM(juror_aura_snapshot), 0),
    0.5
  ) INTO v_verdict
  FROM public.jury_votes WHERE user_quest_id = p_user_quest_id;

  -- Get quest details
  SELECT uq.user_id, uq.quest_id, q.xp_reward, q.aura_reward
  INTO v_user_id, v_quest_id, v_xp_reward, v_aura_reward
  FROM public.user_quests uq
  JOIN public.quests q ON uq.quest_id = q.id
  WHERE uq.id = p_user_quest_id;

  IF v_verdict >= 0.6 THEN
    -- APPROVED
    UPDATE public.user_quests
    SET status       = 'completed',
        jury_verdict = v_verdict,
        completed_at = NOW()
    WHERE id = p_user_quest_id;

    PERFORM public.grant_quest_rewards(v_user_id, v_xp_reward, v_aura_reward);
    v_result := 'approved';

  ELSIF v_verdict < 0.4 THEN
    -- REJECTED
    UPDATE public.user_quests
    SET status       = 'failed',
        jury_verdict = v_verdict
    WHERE id = p_user_quest_id;

    PERFORM public.deduct_aura(v_user_id, 20, 'jury_rejection');
    v_result := 'rejected';

  ELSE
    v_result := 'inconclusive';
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Update Streak ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_streak(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_last_active DATE;
  v_today       DATE := CURRENT_DATE;
  v_streak      INT;
BEGIN
  SELECT last_active, streak_days
  INTO v_last_active, v_streak
  FROM public.profiles WHERE id = p_user_id;

  IF v_last_active = v_today THEN
    RETURN;  -- Already active today
  ELSIF v_last_active = v_today - 1 THEN
    v_streak := v_streak + 1;  -- Consecutive day
  ELSE
    v_streak := 1;             -- Streak broken, restart
  END IF;

  UPDATE public.profiles
  SET streak_days = v_streak,
      last_active = v_today
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
