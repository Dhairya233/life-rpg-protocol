-- ============================================================
-- THE LIFE-RPG PROTOCOL — Sprint 2 Migration
-- Run this in Supabase SQL editor AFTER Sprint 1 schema
-- ============================================================

-- 1. Add 'pending_verification' to the quest_status enum
--    (Supabase/Postgres requires ALTER TYPE for enum additions)
ALTER TYPE quest_status ADD VALUE IF NOT EXISTS 'pending_verification';

-- 2. Create the 'submissions' storage bucket
--    (This is done via Supabase Dashboard > Storage > New Bucket,
--     OR via the management API. The SQL below sets up the RLS policies
--     assuming the bucket already exists.)

-- Storage RLS: users can upload to their own folder only
-- Path convention: submissions/{user_id}/{filename}
CREATE POLICY "submissions_upload_own"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can view their own submissions
CREATE POLICY "submissions_read_own"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own submissions
CREATE POLICY "submissions_delete_own"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3. Index to speed up pending verification queue lookups
CREATE INDEX IF NOT EXISTS idx_user_quests_pending
  ON public.user_quests(status)
  WHERE status = 'pending_verification';

-- 4. Add proof_submitted_at timestamp column (tracks when proof was uploaded)
ALTER TABLE public.user_quests
  ADD COLUMN IF NOT EXISTS proof_submitted_at TIMESTAMPTZ;

-- NOTE: To create the bucket via SQL (Supabase internal schema):
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('submissions', 'submissions', false)
-- ON CONFLICT (id) DO NOTHING;
