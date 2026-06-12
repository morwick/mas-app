-- ============================================================================
-- Migration 20260612000001: Driver Portal
--
-- Menambahkan role 'driver' untuk akses portal driver
-- Driver dapat:
--   - Login ke portal driver
--   - Melihat job yang ditugaskan kepada mereka
--   - Update status job (pickup, loading, dalam_perjalanan, unloading, selesai)
--   - Upload foto loading/unloading
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Update role enum di profiles
-- ---------------------------------------------------------------------------

-- Tambah role 'driver' ke constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'operator', 'driver'));

-- ---------------------------------------------------------------------------
-- 2. Helper function untuk cek apakah user adalah driver
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_driver()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role = 'driver'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Function untuk cek apakah driver bisa akses job tertentu
--    (hanya job yang ditugaskan ke driver tersebut)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION can_access_job_as_driver(p_job_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = p_job_id
      AND j.driver_id = (SELECT id FROM profiles WHERE id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS Policies untuk drivers (read self)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "driver_read_self" ON drivers;
CREATE POLICY "driver_read_self"
  ON drivers FOR SELECT
  USING (
    is_active_admin()
    OR (is_driver() AND id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 5. RLS Policies untuk jobs - driver hanya bisa lihat & update job sendiri
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "driver_read_own_jobs" ON jobs;
CREATE POLICY "driver_read_own_jobs"
  ON jobs FOR SELECT
  USING (
    is_active_admin()
    OR (is_driver() AND driver_id = auth.uid())
  );

-- Driver bisa update job mereka sendiri (validasi kolom dilakukan via trigger)
DROP POLICY IF EXISTS "driver_update_own_jobs" ON jobs;
CREATE POLICY "driver_update_own_jobs"
  ON jobs FOR UPDATE
  USING (
    is_active_admin()
    OR (is_driver() AND driver_id = auth.uid())
  )
  WITH CHECK (
    is_active_admin()
    OR (is_driver() AND driver_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 6. RLS Policies untuk job_photos - driver bisa upload foto
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "driver_insert_job_photos" ON job_photos;
CREATE POLICY "driver_insert_job_photos"
  ON job_photos FOR INSERT
  WITH CHECK (
    is_driver()
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = job_photos.job_id
        AND j.driver_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "driver_read_job_photos" ON job_photos;
CREATE POLICY "driver_read_job_photos"
  ON job_photos FOR SELECT
  USING (
    is_active_admin()
    OR (
      is_driver()
      AND EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.id = job_photos.job_id
          AND j.driver_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 7. RLS Policies untuk unit_status_history - driver bisa baca history unit
--    yang ditugaskan
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "driver_read_unit_history" ON unit_status_history;
CREATE POLICY "driver_read_unit_history"
  ON unit_status_history FOR SELECT
  USING (
    is_active_admin()
    OR (
      is_driver()
      AND EXISTS (
        SELECT 1 FROM units u
        JOIN jobs j ON j.unit_id = u.id
        WHERE j.driver_id = auth.uid()
          AND j.status IN ('menunggu_pickup', 'loading', 'dalam_perjalanan', 'unloading')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Update trigger handle_new_user untuk support driver
-- ---------------------------------------------------------------------------

-- Fungsi ini akan dipanggil saat user baru dibuat di auth.users
-- Jika email mengandung 'driver', otomatis set role='driver'
CREATE OR REPLACE FUNCTION handle_new_user_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Cek apakah email mengandung kata 'driver'
  IF LOWER(NEW.email) LIKE '%driver%' THEN
    INSERT INTO profiles (id, email, nama, role, is_active)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'nama', SPLIT_PART(NEW.email, '@', 1)),
      'driver',
      true
    );
  ELSE
    -- Default untuk non-driver: operator (lebih aman)
    INSERT INTO profiles (id, email, nama, role, is_active, allowed_jenis_unit_ids)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'nama', SPLIT_PART(NEW.email, '@', 1)),
      'operator',
      true,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 9. Index untuk performa query driver
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_jobs_driver_active
  ON jobs(driver_id, status) 
  WHERE status IN ('menunggu_pickup', 'loading', 'dalam_perjalanan', 'unloading');

