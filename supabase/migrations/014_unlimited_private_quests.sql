-- Migration 014: Private Quest Logic & XP Cap
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_private_quest(p_quest_id UUID, p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_quest_xp INT;
  v_quest_aura INT;
  v_status TEXT;
  v_today_xp_sum INT;
  v_cap INT := 500;
  v_awarded_xp INT := 0;
  v_awarded_aura INT := 0;
BEGIN
  -- 1. Fetch quest details
  SELECT xp_reward, aura_reward, status
  INTO v_quest_xp, v_quest_aura, v_status
  FROM public.private_quests
  WHERE id = p_quest_id AND user_id = p_user_id;

  -- End early if quest doesn't exist or is already completed
  IF v_status = 'completed' OR v_status IS NULL THEN
    RETURN;
  END IF;

  -- 2. Calculate how much XP they've already earned TODAY from private_quests
  SELECT COALESCE(SUM(xp_reward), 0)
  INTO v_today_xp_sum
  FROM public.private_quests
  WHERE user_id = p_user_id 
    AND status = 'completed'
    AND completed_at::date = CURRENT_DATE;

  -- 3. Determine actual payout
  -- If under cap, they get partial or full depending on the remainder
  IF v_today_xp_sum < v_cap THEN
    -- They have X amount of cap remaining
    v_awarded_xp := LEAST(v_quest_xp, v_cap - v_today_xp_sum);

    -- Allow Aura if they had any XP cap room left
    v_awarded_aura := v_quest_aura;
  ELSE
    v_awarded_xp := 0;
    v_awarded_aura := 0;
  END IF;

  -- 4. Fast-track update the private quest record
  UPDATE public.private_quests
  SET status = 'completed',
      completed_at = NOW()
  WHERE id = p_quest_id;

  -- 5. Award actual calculated XP/Aura securely
  IF v_awarded_xp > 0 OR v_awarded_aura > 0 THEN
    PERFORM public.grant_quest_rewards(p_user_id, v_awarded_xp, v_awarded_aura);
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
