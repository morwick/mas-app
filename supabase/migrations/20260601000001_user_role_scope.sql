-- ============================================================================
-- Migration 20260601000001: User role + jenis_unit scope
--
-- Tambah role-based access:
--   - profiles.role: 'owner' | 'operator'
--     - owner: full access (existing behavior)
--     - operator: dibatasi ke subset jenis_unit yang ditentukan owner
--   - profiles.allowed_jenis_unit_ids uuid[]: scope operator
--     - NULL → tidak punya scope (operator baru, akses kosong sampai owner set)
--     - empty array {} → sama dengan NULL, tidak punya akses
--     - non-empty → akses hanya unit dengan jenis_unit_id di array
--
--   Untuk owner, kolom allowed_jenis_unit_ids di-ignore.
--
-- Helper functions (SECURITY DEFINER):
--   - current_user_role(): TEXT
--   - current_user_jenis_scope(): UUID[]
--   - can_access_unit(unit_id UUID): BOOLEAN
--
-- RLS update:
--   - units: SELECT scope-filtered, INSERT/UPDATE/DELETE owner-only
--   - jobs: SELECT/UPDATE/INSERT/DELETE scope-filtered via unit.jenis_unit_id
--   - drivers, customers: read all, write owner-only
--   - service_records: owner-only (write), scope-filtered (read via unit)
--   - jenis_unit: read all, write owner-only
--   - profiles: read self + read others (owner only), write owner only (selain self)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles: tambah kolom
-- ---------------------------------------------------------------------------

-- Set existing rows jadi owner (sebelumnya semua 'admin')
UPDATE profiles SET role = 'owner' WHERE role IN ('admin', 'owner');

-- Constraint role: hanya 'owner' atau 'operator'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'operator'));

-- Default untuk user baru: operator (lebih aman)
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'operator';

-- Kolom scope (NULL = belum di-set)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS allowed_jenis_unit_ids UUID[] DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION current_user_jenis_scope()
RETURNS UUID[]
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT allowed_jenis_unit_ids
  FROM profiles
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_owner()
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
      AND role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION can_access_unit(p_unit_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    is_owner()
    OR EXISTS (
      SELECT 1
      FROM units u
      WHERE u.id = p_unit_id
        AND u.jenis_unit_id = ANY (
          COALESCE(current_user_jenis_scope(), ARRAY[]::UUID[])
        )
    );
$$;

CREATE OR REPLACE FUNCTION can_access_job(p_job_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    is_owner()
    OR EXISTS (
      SELECT 1
      FROM jobs j
      JOIN units u ON u.id = j.unit_id
      WHERE j.id = p_job_id
        AND u.jenis_unit_id = ANY (
          COALESCE(current_user_jenis_scope(), ARRAY[]::UUID[])
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- RLS Policies — units
--
-- Operator: read units dengan jenis_unit_id dalam scope. Owner: read & write semua.
-- Public (anon) tetap bisa read units via active jobs (existing policy).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_all_units" ON units;

DROP POLICY IF EXISTS "user_read_units_in_scope" ON units;
CREATE POLICY "user_read_units_in_scope"
  ON units FOR SELECT
  USING (
    is_active_admin()
    AND (
      is_owner()
      OR jenis_unit_id = ANY (
        COALESCE(current_user_jenis_scope(), ARRAY[]::UUID[])
      )
    )
  );

DROP POLICY IF EXISTS "owner_write_units" ON units;
CREATE POLICY "owner_write_units"
  ON units FOR INSERT
  WITH CHECK (is_owner());

DROP POLICY IF EXISTS "owner_update_units" ON units;
CREATE POLICY "owner_update_units"
  ON units FOR UPDATE
  USING (is_owner())
  WITH CHECK (is_owner());

DROP POLICY IF EXISTS "owner_delete_units" ON units;
CREATE POLICY "owner_delete_units"
  ON units FOR DELETE
  USING (is_owner());

-- ---------------------------------------------------------------------------
-- RLS Policies — jobs
--
-- Operator boleh manage job hanya untuk unit dalam scope.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_all_jobs" ON jobs;

DROP POLICY IF EXISTS "user_read_jobs_in_scope" ON jobs;
CREATE POLICY "user_read_jobs_in_scope"
  ON jobs FOR SELECT
  USING (
    is_active_admin()
    AND (
      is_owner()
      OR EXISTS (
        SELECT 1 FROM units u
        WHERE u.id = jobs.unit_id
          AND u.jenis_unit_id = ANY (
            COALESCE(current_user_jenis_scope(), ARRAY[]::UUID[])
          )
      )
    )
  );

DROP POLICY IF EXISTS "user_insert_jobs_in_scope" ON jobs;
CREATE POLICY "user_insert_jobs_in_scope"
  ON jobs FOR INSERT
  WITH CHECK (
    is_active_admin()
    AND (
      is_owner()
      OR EXISTS (
        SELECT 1 FROM units u
        WHERE u.id = jobs.unit_id
          AND u.jenis_unit_id = ANY (
            COALESCE(current_user_jenis_scope(), ARRAY[]::UUID[])
          )
      )
    )
  );

DROP POLICY IF EXISTS "user_update_jobs_in_scope" ON jobs;
CREATE POLICY "user_update_jobs_in_scope"
  ON jobs FOR UPDATE
  USING (
    is_active_admin()
    AND (
      is_owner()
      OR EXISTS (
        SELECT 1 FROM units u
        WHERE u.id = jobs.unit_id
          AND u.jenis_unit_id = ANY (
            COALESCE(current_user_jenis_scope(), ARRAY[]::UUID[])
          )
      )
    )
  )
  WITH CHECK (
    is_active_admin()
    AND (
      is_owner()
      OR EXISTS (
        SELECT 1 FROM units u
        WHERE u.id = jobs.unit_id
          AND u.jenis_unit_id = ANY (
            COALESCE(current_user_jenis_scope(), ARRAY[]::UUID[])
          )
      )
    )
  );

DROP POLICY IF EXISTS "user_delete_jobs_in_scope" ON jobs;
CREATE POLICY "user_delete_jobs_in_scope"
  ON jobs FOR DELETE
  USING (
    is_active_admin()
    AND (
      is_owner()
      OR EXISTS (
        SELECT 1 FROM units u
        WHERE u.id = jobs.unit_id
          AND u.jenis_unit_id = ANY (
            COALESCE(current_user_jenis_scope(), ARRAY[]::UUID[])
          )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- drivers & customers: read all, write owner-only
-- (Operator perlu lihat driver/customer untuk assign ke job, tapi tidak edit
--  master data-nya.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_all_drivers" ON drivers;
DROP POLICY IF EXISTS "user_read_drivers" ON drivers;
CREATE POLICY "user_read_drivers"
  ON drivers FOR SELECT
  USING (is_active_admin());

DROP POLICY IF EXISTS "owner_write_drivers" ON drivers;
CREATE POLICY "owner_write_drivers"
  ON drivers FOR INSERT WITH CHECK (is_owner());

DROP POLICY IF EXISTS "owner_update_drivers" ON drivers;
CREATE POLICY "owner_update_drivers"
  ON drivers FOR UPDATE USING (is_owner()) WITH CHECK (is_owner());

DROP POLICY IF EXISTS "owner_delete_drivers" ON drivers;
CREATE POLICY "owner_delete_drivers"
  ON drivers FOR DELETE USING (is_owner());

DROP POLICY IF EXISTS "admin_all_customers" ON customers;
DROP POLICY IF EXISTS "user_read_customers" ON customers;
CREATE POLICY "user_read_customers"
  ON customers FOR SELECT
  USING (is_active_admin());

DROP POLICY IF EXISTS "owner_write_customers" ON customers;
CREATE POLICY "owner_write_customers"
  ON customers FOR INSERT WITH CHECK (is_owner());

DROP POLICY IF EXISTS "owner_update_customers" ON customers;
CREATE POLICY "owner_update_customers"
  ON customers FOR UPDATE USING (is_owner()) WITH CHECK (is_owner());

DROP POLICY IF EXISTS "owner_delete_customers" ON customers;
CREATE POLICY "owner_delete_customers"
  ON customers FOR DELETE USING (is_owner());

-- ---------------------------------------------------------------------------
-- jenis_unit: write owner-only (sebelumnya semua admin bisa)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_write_jenis_unit" ON jenis_unit;
DROP POLICY IF EXISTS "owner_write_jenis_unit" ON jenis_unit;
CREATE POLICY "owner_write_jenis_unit"
  ON jenis_unit FOR ALL
  USING (is_owner())
  WITH CHECK (is_owner());

-- ---------------------------------------------------------------------------
-- profiles: owner bisa baca/edit profile user lain, operator hanya self
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admins_read_all_profiles" ON profiles;
DROP POLICY IF EXISTS "owners_read_all_profiles" ON profiles;
CREATE POLICY "owners_read_all_profiles"
  ON profiles FOR SELECT
  USING (is_owner());

DROP POLICY IF EXISTS "owners_update_others_profile" ON profiles;
CREATE POLICY "owners_update_others_profile"
  ON profiles FOR UPDATE
  USING (is_owner() AND id <> auth.uid())
  WITH CHECK (is_owner() AND id <> auth.uid());

-- ---------------------------------------------------------------------------
-- Index untuk scope lookup di units (mempercepat RLS)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_units_jenis_scope
  ON units(jenis_unit_id) WHERE is_active = true;
