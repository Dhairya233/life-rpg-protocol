-- ============================================================
-- LIFE-RPG PROTOCOL — Add is_banned to profiles
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;
