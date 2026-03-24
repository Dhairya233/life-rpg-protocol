-- ============================================================
-- Migration 011: Daily Luck Tracking & Inverse Algorithm
-- ============================================================

CREATE TABLE IF NOT EXISTS public.daily_luck_rolls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    roll_date DATE NOT NULL DEFAULT CURRENT_DATE,
    luck_value INTEGER NOT NULL,
    is_grind_day BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, roll_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_luck_user_date ON public.daily_luck_rolls(user_id, roll_date);

ALTER TABLE public.daily_luck_rolls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own luck rolls" ON public.daily_luck_rolls;
CREATE POLICY "Users can view own luck rolls"
  ON public.daily_luck_rolls
  FOR SELECT
  USING (auth.uid() = user_id);

-- RPC for rolling luck securely on the backend
CREATE OR REPLACE FUNCTION public.roll_daily_luck(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_yesterday_luck INTEGER;
  v_today_luck INTEGER;
  v_variance INTEGER;
  v_is_grind_day BOOLEAN;
  v_result JSONB;
BEGIN
  -- 1. Check if today was already rolled to prevent rerolls
  SELECT jsonb_build_object(
    'luck_value', luck_value,
    'is_grind_day', is_grind_day
  ) INTO v_result
  FROM public.daily_luck_rolls
  WHERE user_id = p_user_id AND roll_date = CURRENT_DATE;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- 2. Fetch yesterday's luck
  SELECT luck_value INTO v_yesterday_luck
  FROM public.daily_luck_rolls
  WHERE user_id = p_user_id AND roll_date = CURRENT_DATE - INTERVAL '1 day';

  IF v_yesterday_luck IS NULL THEN
    -- Fallback to base logic if no prior roll exists
    SELECT luck INTO v_yesterday_luck
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_yesterday_luck IS NULL THEN
      v_yesterday_luck := 50;
    END IF;
  END IF;

  -- 3. The Inverse Probability Engine
  v_variance := floor(random() * 31) - 15; -- Variance between -15 and +15
  v_today_luck := 100 - v_yesterday_luck + v_variance;

  -- Math Clamp
  IF v_today_luck < 10 THEN v_today_luck := 10; END IF;
  IF v_today_luck > 90 THEN v_today_luck := 90; END IF;

  -- Grind Day detection
  v_is_grind_day := (v_today_luck <= 40);

  -- 4. Commit additive insert
  INSERT INTO public.daily_luck_rolls (user_id, roll_date, luck_value, is_grind_day)
  VALUES (p_user_id, CURRENT_DATE, v_today_luck, v_is_grind_day);

  RETURN jsonb_build_object(
    'luck_value', v_today_luck,
    'is_grind_day', v_is_grind_day
  );
END;
$$;
