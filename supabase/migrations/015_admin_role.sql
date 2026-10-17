-- Migration 015: Admin Role and Global Quest Access
-- ============================================================

-- 1. Add is_admin boolean
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Update RLS policies for quests to allow Admins to manage them
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;

-- Ensure anyone can read global quests
DROP POLICY IF EXISTS "Anyone can view global quests" ON public.quests;
CREATE POLICY "Anyone can view global quests" ON public.quests FOR SELECT USING (true);

-- Allow only admins to insert
DROP POLICY IF EXISTS "Admins can insert global quests" ON public.quests;
CREATE POLICY "Admins can insert global quests" ON public.quests FOR INSERT 
        WITH CHECK ( EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) );

-- Allow only admins to update
DROP POLICY IF EXISTS "Admins can update global quests" ON public.quests;
CREATE POLICY "Admins can update global quests" ON public.quests FOR UPDATE 
        USING ( EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) );

-- Allow only admins to delete
DROP POLICY IF EXISTS "Admins can delete global quests" ON public.quests;
CREATE POLICY "Admins can delete global quests" ON public.quests FOR DELETE 
        USING ( EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) );
