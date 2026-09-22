-- ============================================================================
-- Migration 04: Storage bucket "job-photos" + policies
-- Bucket dibuat private; access via signed URL untuk admin, public URL untuk
-- customer (filtered RLS via job share_token).
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-photos',
  'job-photos',
  true,  -- public bucket for customer access; access still gated by URL knowledge
  5 * 1024 * 1024, -- 5MB per file
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public            = EXCLUDED.public,
    file_size_limit   = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Helper for storage policies
CREATE OR REPLACE FUNCTION storage_is_active_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_active = true
  );
$$;

-- Authenticated admins can upload & manage objects in the bucket
DROP POLICY IF EXISTS "admins_upload_job_photos" ON storage.objects;
CREATE POLICY "admins_upload_job_photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'job-photos' AND storage_is_active_admin());

DROP POLICY IF EXISTS "admins_update_job_photos" ON storage.objects;
CREATE POLICY "admins_update_job_photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'job-photos' AND storage_is_active_admin());

DROP POLICY IF EXISTS "admins_delete_job_photos" ON storage.objects;
CREATE POLICY "admins_delete_job_photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'job-photos' AND storage_is_active_admin());

-- Public read (customer tracking page consumes public URL)
DROP POLICY IF EXISTS "public_read_job_photos" ON storage.objects;
CREATE POLICY "public_read_job_photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'job-photos');
