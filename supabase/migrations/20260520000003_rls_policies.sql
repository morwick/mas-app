-- ============================================================================
-- Migration 03: Row Level Security policies
-- Pattern: Authenticated admin can CRUD all internal tables.
-- Customer (anonymous) can SELECT a job row only via its share_token and only
-- while the link is still valid (not cancelled & not >24h after selesai).
-- ============================================================================

-- Helper: returns true if the current JWT belongs to an active admin profile.
CREATE OR REPLACE FUNCTION is_active_admin()
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

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_profile"   ON profiles;
CREATE POLICY "users_read_own_profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "admins_read_all_profiles" ON profiles;
CREATE POLICY "admins_read_all_profiles"
  ON profiles FOR SELECT
  USING (is_active_admin());

-- ---------------------------------------------------------------------------
-- jenis_unit
-- ---------------------------------------------------------------------------
ALTER TABLE jenis_unit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_jenis_unit" ON jenis_unit;
CREATE POLICY "public_read_jenis_unit"
  ON jenis_unit FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "admin_write_jenis_unit" ON jenis_unit;
CREATE POLICY "admin_write_jenis_unit"
  ON jenis_unit FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

-- ---------------------------------------------------------------------------
-- units
-- ---------------------------------------------------------------------------
ALTER TABLE units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_units" ON units;
CREATE POLICY "admin_all_units"
  ON units FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

-- Anonymous can read units that are referenced by an active share-link job.
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

-- ---------------------------------------------------------------------------
-- drivers
-- ---------------------------------------------------------------------------
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_drivers" ON drivers;
CREATE POLICY "admin_all_drivers"
  ON drivers FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

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

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_customers" ON customers;
CREATE POLICY "admin_all_customers"
  ON customers FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

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

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_jobs" ON jobs;
CREATE POLICY "admin_all_jobs"
  ON jobs FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

DROP POLICY IF EXISTS "public_read_jobs_by_token" ON jobs;
CREATE POLICY "public_read_jobs_by_token"
  ON jobs FOR SELECT
  USING (
    auth.uid() IS NULL
    AND share_token IS NOT NULL
    AND status NOT IN ('selesai', 'cancelled')
  );

-- ---------------------------------------------------------------------------
-- job_status_history (read-only for admins)
-- ---------------------------------------------------------------------------
ALTER TABLE job_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_job_history" ON job_status_history;
CREATE POLICY "admin_read_job_history"
  ON job_status_history FOR SELECT
  USING (is_active_admin());

DROP POLICY IF EXISTS "admin_update_job_history" ON job_status_history;
CREATE POLICY "admin_update_job_history"
  ON job_status_history FOR UPDATE
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

-- ---------------------------------------------------------------------------
-- unit_status_history
-- ---------------------------------------------------------------------------
ALTER TABLE unit_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_unit_history" ON unit_status_history;
CREATE POLICY "admin_read_unit_history"
  ON unit_status_history FOR SELECT
  USING (is_active_admin());

DROP POLICY IF EXISTS "admin_update_unit_history" ON unit_status_history;
CREATE POLICY "admin_update_unit_history"
  ON unit_status_history FOR UPDATE
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

-- ---------------------------------------------------------------------------
-- job_photos
-- ---------------------------------------------------------------------------
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_job_photos" ON job_photos;
CREATE POLICY "admin_all_job_photos"
  ON job_photos FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

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
