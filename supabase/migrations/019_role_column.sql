-- ============================================================
-- Migration 019: Refactor is_admin to role TEXT
-- ============================================================

-- 1. Add role column and migrate data
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

DO $$ 
BEGIN
  -- Safely migrate any existing admins if the column exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_admin') THEN
    UPDATE public.profiles SET role = 'admin' WHERE is_admin = true;
  END IF;
END $$;

-- 2. Update permissions on quests table
DROP POLICY IF EXISTS "Admins can insert global quests" ON public.quests;
CREATE POLICY "Admins can insert global quests" ON public.quests FOR INSERT 
  WITH CHECK ( EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') );

DROP POLICY IF EXISTS "Admins can update global quests" ON public.quests;
CREATE POLICY "Admins can update global quests" ON public.quests FOR UPDATE 
  USING ( EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') );

DROP POLICY IF EXISTS "Admins can delete global quests" ON public.quests;
CREATE POLICY "Admins can delete global quests" ON public.quests FOR DELETE 
  USING ( EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') );

-- 3. Drop the old boolean column
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_admin;
