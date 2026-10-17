-- ============================================================
-- Migration 010: Discovery RPC
-- Secure function to apply temporary luck safely
-- ============================================================

CREATE OR REPLACE FUNCTION public.grant_temporary_luck(
  p_user_id UUID,
  p_luck_amount INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- We strictly add to the active_luck_boost, maintaining an additive approach
  UPDATE public.profiles
  SET active_luck_boost = active_luck_boost + p_luck_amount
  WHERE id = p_user_id;
END;
$$;
