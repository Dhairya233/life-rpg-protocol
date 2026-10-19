-- ============================================================
-- Migration 026: review fixes
--  1. Jury bonus capped at 10 per juror per day (stops the
--     reject -> retry -> reject farming loop with friendly accounts).
--  2. Legacy proof_url values that are not a clean storage path are
--     cleared, so a hand-edited value can never be signed.
-- CREATE OR REPLACE keeps the existing grants (service_role/definer only).
-- ============================================================

CREATE OR REPLACE FUNCTION public._resolve_verdict(p_user_quest_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status      TEXT;
  v_submitter   UUID;
  v_xp          INT;
  v_aura        INT;
  v_votes       INT;
  v_verdict     NUMERIC;
  v_luck        INT;
  v_boost       INT;
  v_critical    BOOLEAN := FALSE;
  v_result      TEXT;
  v_juror       RECORD;
BEGIN
  -- Lock the submission row: parallel votes now line up one by one.
  SELECT uq.status, uq.user_id, q.xp_reward, q.aura_reward
  INTO v_status, v_submitter, v_xp, v_aura
  FROM public.user_quests uq
  JOIN public.quests q ON q.id = uq.quest_id
  WHERE uq.id = p_user_quest_id
  FOR UPDATE OF uq;

  IF NOT FOUND THEN RAISE EXCEPTION 'submission not found'; END IF;
  IF v_status <> 'pending_verification' THEN RETURN 'already_resolved'; END IF;

  SELECT COUNT(*) INTO v_votes FROM public.jury_votes WHERE user_quest_id = p_user_quest_id;
  IF v_votes < 3 THEN RETURN 'insufficient_votes'; END IF;      -- quorum

  -- Aura-weighted approval share, 0..1
  SELECT COALESCE(SUM(CASE WHEN vote THEN juror_aura_snapshot ELSE 0 END)::NUMERIC
                  / NULLIF(SUM(juror_aura_snapshot), 0), 0.5)
  INTO v_verdict
  FROM public.jury_votes WHERE user_quest_id = p_user_quest_id;

  IF v_verdict >= 0.6 THEN
    -- Critical hit: chance = luck + temporary boost (percent), x1.5 XP.
    SELECT COALESCE(luck, 50), COALESCE(active_luck_boost, 0) INTO v_luck, v_boost
    FROM public.profiles WHERE id = v_submitter FOR UPDATE;
    UPDATE public.profiles SET active_luck_boost = 0 WHERE id = v_submitter;   -- boost is used up

    v_critical := random() * 100 < (v_luck + v_boost);
    IF v_critical THEN v_xp := floor(v_xp * 1.5); END IF;

    UPDATE public.user_quests
    SET status = CASE WHEN v_critical THEN 'completed_critical' ELSE 'completed' END,
        jury_verdict = v_verdict, completed_at = now()
    WHERE id = p_user_quest_id;

    PERFORM public._grant_rewards(v_submitter, v_xp, v_aura, 'quest_complete');
    UPDATE public.jury_votes SET verdict_match = (vote = TRUE) WHERE user_quest_id = p_user_quest_id;
    v_result := CASE WHEN v_critical THEN 'approved_critical' ELSE 'approved' END;

  ELSIF v_verdict < 0.4 THEN
    UPDATE public.user_quests SET status = 'failed', jury_verdict = v_verdict WHERE id = p_user_quest_id;
    PERFORM public._deduct_aura(v_submitter, 20, 'jury_rejection');
    UPDATE public.jury_votes SET verdict_match = (vote = FALSE) WHERE user_quest_id = p_user_quest_id;
    v_result := 'rejected';

  ELSE
    RETURN 'inconclusive';          -- stays pending, next vote re-evaluates
  END IF;

  -- Jurors who agreed with the final verdict get +10 XP, +2 Aura.
  FOR v_juror IN
    SELECT juror_id FROM public.jury_votes WHERE user_quest_id = p_user_quest_id AND verdict_match = TRUE
  LOOP
    -- Anti-farming: at most 10 bonuses per juror per day (a reject/retry loop
    -- with friendly accounts would otherwise pay out forever).
    IF (SELECT COUNT(*) FROM public.aura_log
         WHERE user_id = v_juror.juror_id AND reason = 'jury_bonus'
           AND created_at > now() - interval '1 day') < 10 THEN
      PERFORM public._grant_rewards(v_juror.juror_id, 10, 2, 'jury_bonus');
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

UPDATE public.user_quests
SET proof_url = NULL
WHERE proof_url IS NOT NULL
  AND proof_url !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$';
