-- ============================================================
-- LIFE-RPG PROTOCOL — Storage Setup
-- Run AFTER creating the 'submissions' bucket in Dashboard
-- (Dashboard → Storage → New Bucket → "submissions" → Private)
-- ============================================================

-- OR create the bucket via SQL:
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('submissions', 'submissions', FALSE, 5242880)  -- 5MB limit
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS: users upload to their own folder ────────────
-- Path convention: submissions/{user_id}/{filename}

DROP POLICY IF EXISTS "submissions_upload_own" ON storage.objects;
CREATE POLICY "submissions_upload_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "submissions_read_own" ON storage.objects;
CREATE POLICY "submissions_read_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "submissions_delete_own" ON storage.objects;
CREATE POLICY "submissions_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'submissions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
