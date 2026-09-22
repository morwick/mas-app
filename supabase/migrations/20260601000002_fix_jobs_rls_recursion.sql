-- ============================================================================
-- Migration 20260601000002: Fix infinite recursion in jobs RLS
--
-- Migration sebelumnya (20260601000001) bikin policy jobs dengan inline
--   EXISTS (SELECT 1 FROM units u WHERE u.id = jobs.unit_id AND ...)
-- Inline SELECT itu trigger RLS units, dan units punya policy
-- `public_read_units_via_jobs` yang baca jobs balik → recursion detected.
--
-- Fix: ganti inline subquery dengan helper `can_access_unit()` yang
-- SECURITY DEFINER (bypass RLS), sehingga path lookup tidak re-enter RLS.
-- ============================================================================

DROP POLICY IF EXISTS "user_read_jobs_in_scope"   ON jobs;
DROP POLICY IF EXISTS "user_insert_jobs_in_scope" ON jobs;
DROP POLICY IF EXISTS "user_update_jobs_in_scope" ON jobs;
DROP POLICY IF EXISTS "user_delete_jobs_in_scope" ON jobs;

CREATE POLICY "user_read_jobs_in_scope"
  ON jobs FOR SELECT
  USING (
    is_active_admin()
    AND (is_owner() OR can_access_unit(jobs.unit_id))
  );

CREATE POLICY "user_insert_jobs_in_scope"
  ON jobs FOR INSERT
  WITH CHECK (
    is_active_admin()
    AND (is_owner() OR can_access_unit(jobs.unit_id))
  );

CREATE POLICY "user_update_jobs_in_scope"
  ON jobs FOR UPDATE
  USING (
    is_active_admin()
    AND (is_owner() OR can_access_unit(jobs.unit_id))
  )
  WITH CHECK (
    is_active_admin()
    AND (is_owner() OR can_access_unit(jobs.unit_id))
  );

CREATE POLICY "user_delete_jobs_in_scope"
  ON jobs FOR DELETE
  USING (
    is_active_admin()
    AND (is_owner() OR can_access_unit(jobs.unit_id))
  );
