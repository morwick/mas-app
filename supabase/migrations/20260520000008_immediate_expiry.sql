-- ============================================================================
-- Migration 08: Hapus grace period 24 jam untuk selesai
--
-- Permintaan user: link customer langsung expired begitu admin set status
-- 'selesai'. Sebelumnya RLS memberi grace 24 jam (PRD FR-TRACK-08); sekarang
-- langsung block. Cancelled juga tetap di-block langsung (sudah sejak awal).
-- ============================================================================

-- jobs: hanya boleh dibaca anonymous bila status masih aktif (belum selesai
-- dan belum cancelled)
DROP POLICY IF EXISTS "public_read_jobs_by_token" ON jobs;
CREATE POLICY "public_read_jobs_by_token"
  ON jobs FOR SELECT
  USING (
    auth.uid() IS NULL
    AND share_token IS NOT NULL
    AND status NOT IN ('selesai', 'cancelled')
  );

-- units: ikut filter, hanya read-able selama job-nya aktif
DROP POLICY IF EXISTS "public_read_units_via_jobs" ON units;
CREATE POLICY "public_read_units_via_jobs"
  ON units FOR SELECT
  USING (
    auth.uid() IS NULL AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.unit_id = units.id
        AND j.status NOT IN ('selesai', 'cancelled')
    )
  );

DROP POLICY IF EXISTS "public_read_drivers_via_jobs" ON drivers;
CREATE POLICY "public_read_drivers_via_jobs"
  ON drivers FOR SELECT
  USING (
    auth.uid() IS NULL AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.driver_id = drivers.id
        AND j.status NOT IN ('selesai', 'cancelled')
    )
  );

DROP POLICY IF EXISTS "public_read_customers_via_jobs" ON customers;
CREATE POLICY "public_read_customers_via_jobs"
  ON customers FOR SELECT
  USING (
    auth.uid() IS NULL AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.customer_id = customers.id
        AND j.status NOT IN ('selesai', 'cancelled')
    )
  );

DROP POLICY IF EXISTS "public_read_photos_via_token" ON job_photos;
CREATE POLICY "public_read_photos_via_token"
  ON job_photos FOR SELECT
  USING (
    auth.uid() IS NULL AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = job_photos.job_id
        AND j.share_token IS NOT NULL
        AND j.status NOT IN ('selesai', 'cancelled')
    )
  );
