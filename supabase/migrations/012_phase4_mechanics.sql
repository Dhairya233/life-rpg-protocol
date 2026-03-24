-- Migration 012: Phase 4 Core Mechanics
-- ============================================================

-- 1. Add verdict_match to jury_votes
ALTER TABLE public.jury_votes ADD COLUMN IF NOT EXISTS verdict_match BOOLEAN;

-- 2. Enhance resolve_verdict with Critical Hits and Jury Consensus
CREATE OR REPLACE FUNCTION public.resolve_verdict(p_user_quest_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_verdict       NUMERIC;
  v_vote_count    INT;
  v_user_id       UUID;
  v_quest_id      UUID;
  v_xp_reward     INT;
  v_aura_reward   INT;
  v_result        TEXT;
  v_base_luck     INT;
  v_luck_boost    INT;
  v_total_luck    INT;
  v_vote_record   RECORD;
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
    -- 1. Check for Critical Hit via Active Luck
    SELECT luck, COALESCE(active_luck_boost, 0) INTO v_base_luck, v_luck_boost
    FROM public.profiles WHERE id = v_user_id;

    v_total_luck := COALESCE(v_base_luck, 50) + v_luck_boost;

    -- Consume boost additively (zero it out)
    UPDATE public.profiles SET active_luck_boost = 0 WHERE id = v_user_id;

    IF random() * 100 < v_total_luck THEN
      -- CRITICAL HIT (1.5x)
      v_xp_reward := floor(v_xp_reward * 1.5);
      UPDATE public.user_quests
      SET status       = 'completed_critical',
          jury_verdict = v_verdict,
          completed_at = NOW()
      WHERE id = p_user_quest_id;
      v_result := 'approved_critical';
    ELSE
      -- NORMAL WIN
      UPDATE public.user_quests
      SET status       = 'completed',
          jury_verdict = v_verdict,
          completed_at = NOW()
      WHERE id = p_user_quest_id;
      v_result := 'approved';
    END IF;

    PERFORM public.grant_quest_rewards(v_user_id, v_xp_reward, v_aura_reward);

    -- 2. Consensus Rewarding: mark matched votes
    UPDATE public.jury_votes
    SET verdict_match = (vote = TRUE)
    WHERE user_quest_id = p_user_quest_id;

  ELSIF v_verdict < 0.4 THEN
    -- REJECTED
    UPDATE public.user_quests
    SET status       = 'failed',
        jury_verdict = v_verdict
    WHERE id = p_user_quest_id;

    -- Punishment
    PERFORM public.deduct_aura(v_user_id, 20, 'jury_rejection');
    v_result := 'rejected';

    -- Consensus Rewarding: mark matched votes
    UPDATE public.jury_votes
    SET verdict_match = (vote = FALSE)
    WHERE user_quest_id = p_user_quest_id;

  ELSE
    v_result := 'inconclusive';
  END IF;

  -- Reward matched jurors (+10 XP, +2 Aura)
  IF v_result LIKE 'approved%' OR v_result = 'rejected' THEN
    FOR v_vote_record IN 
      SELECT juror_id FROM public.jury_votes 
      WHERE user_quest_id = p_user_quest_id AND verdict_match = TRUE 
    LOOP
      PERFORM public.grant_quest_rewards(v_vote_record.juror_id, 10, 2);
    END LOOP;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
