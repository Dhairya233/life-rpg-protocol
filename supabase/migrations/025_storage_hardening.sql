-- ============================================================
-- Migration 025: Proof storage — private, owner-only, images only
--
-- Before: the code used public URLs, but the docs (and 006) said the
-- bucket is private; the live bucket may have been flipped to public.
-- Now: the bucket is forced PRIVATE. Clients may only
--   * upload into their own folder:   {their user id}/{uuid}.{image ext}
--   * read / delete files in that folder
-- Jurors never touch storage directly: the Next.js server checks that
-- they may see a proof (get_proof_path_for_viewer) and then hands out a
-- signed URL that expires in 5 minutes.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('submissions', 'submissions', FALSE, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE
  SET public = FALSE,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

DROP POLICY IF EXISTS "submissions_upload_own" ON storage.objects;
DROP POLICY IF EXISTS "submissions_read_own"   ON storage.objects;
DROP POLICY IF EXISTS "submissions_delete_own" ON storage.objects;

-- The path must be exactly {your id}/{uuid}.{ext}: right owner, right shape,
-- image extensions only. (The bucket itself also enforces MIME type and size.)
CREATE POLICY submissions_upload_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$'
  );

CREATE POLICY submissions_read_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'submissions' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY submissions_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'submissions' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Old rows stored a full public URL; keep only the object path.
UPDATE public.user_quests
SET proof_url = regexp_replace(proof_url, '^.*/submissions/', '')
WHERE proof_url LIKE 'http%/submissions/%';
