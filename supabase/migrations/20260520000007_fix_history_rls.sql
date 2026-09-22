-- ============================================================================
-- Migration 07: Fix RLS pada trigger logging history
--
-- Masalah:
--   RLS policy untuk job_status_history & unit_status_history hanya allow
--   SELECT untuk admin (sesuai PRD: "insert via trigger system"). Tapi
--   trigger functions berjalan dengan privilege caller (admin), bukan sistem,
--   sehingga INSERT-nya tetap di-block RLS → "new row violates row-level
--   security policy".
--
-- Fix:
--   Tandai trigger logging functions sebagai SECURITY DEFINER agar bypass RLS.
--   Tambahkan juga policy UPDATE untuk admin agar bisa set reason/notes ke
--   row history terakhir setelah perubahan status.
-- ============================================================================

CREATE OR REPLACE FUNCTION log_job_status_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO job_status_history (job_id, status_old, status_new, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());

    IF NEW.status = 'selesai' AND OLD.status <> 'selesai' THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_job_status_on_insert()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO job_status_history (job_id, status_old, status_new, changed_by)
  VALUES (NEW.id, NULL, NEW.status, NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_unit_status_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO unit_status_history (unit_id, status_old, status_new, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger sync unit status also writes ke tabel units → biar konsisten,
-- jadikan SECURITY DEFINER supaya status unit pasti bisa di-sync walaupun
-- user yang trigger tidak punya hak update unit langsung.
CREATE OR REPLACE FUNCTION sync_unit_status_with_job()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status IN ('menunggu_pickup', 'loading', 'dalam_perjalanan', 'unloading') THEN
    UPDATE units
       SET status = 'bertugas', updated_at = now()
     WHERE id = NEW.unit_id AND status <> 'perbaikan';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status IN ('selesai', 'cancelled') THEN
      UPDATE units
         SET status = 'standby', updated_at = now()
       WHERE id = NEW.unit_id AND status = 'bertugas';
    ELSIF NEW.status IN ('menunggu_pickup', 'loading', 'dalam_perjalanan', 'unloading')
          AND OLD.status IN ('selesai', 'cancelled') THEN
      UPDATE units
         SET status = 'bertugas', updated_at = now()
       WHERE id = NEW.unit_id AND status = 'standby';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Admin perlu UPDATE history rows untuk set reason/notes setelah perubahan status
DROP POLICY IF EXISTS "admin_update_job_history" ON job_status_history;
CREATE POLICY "admin_update_job_history"
  ON job_status_history FOR UPDATE
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

DROP POLICY IF EXISTS "admin_update_unit_history" ON unit_status_history;
CREATE POLICY "admin_update_unit_history"
  ON unit_status_history FOR UPDATE
  USING (is_active_admin())
  WITH CHECK (is_active_admin());
