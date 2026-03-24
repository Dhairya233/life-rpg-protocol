-- Migration 013: Daily Rewards and Streak Bonus
-- ============================================================

-- Safely overwrite the update_streak function to include an automatic EXP and Aura grant
-- whenever a user logs in for the first time in a new 24-hour cycle.
CREATE OR REPLACE FUNCTION public.update_streak(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_last_active DATE;
  v_today       DATE := CURRENT_DATE;
  v_streak      INT;
BEGIN
  -- Grab current streak info
  SELECT last_active, streak_days
  INTO v_last_active, v_streak
  FROM public.profiles WHERE id = p_user_id;

  -- 1. Check if the user is already active today
  IF v_last_active = v_today THEN
    RETURN;  -- No additional rewards or streak increments if already logged in today
  ELSIF v_last_active = v_today - 1 THEN
    v_streak := v_streak + 1;  -- Consecutive day!
  ELSE
    v_streak := 1;             -- Streak broken, restart at 1
  END IF;

  -- 2. Update Profile with Streak, Last Active, XP (+50 flat), and Aura (+10 flat)
  UPDATE public.profiles
  SET streak_days = v_streak,
      last_active = v_today,
      xp = xp + 50,
      aura = aura + 10
  WHERE id = p_user_id;

  -- 3. Log the Aura Audit securely
  INSERT INTO public.aura_log (user_id, delta, reason)
  VALUES (p_user_id, 10, 'daily_login');

  -- Optional: If streak is a milestone (e.g. 7 days), we could grant extra
  IF v_streak % 7 = 0 THEN
    UPDATE public.profiles SET aura = aura + 50 WHERE id = p_user_id;
    INSERT INTO public.aura_log (user_id, delta, reason) VALUES (p_user_id, 50, 'streak_bonus');
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
