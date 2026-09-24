-- ============================================================================
-- Migration 20260923000002: perbaiki fungsi yang masih memanggil is_owner()
--
-- Kenapa ini terlewat di migration 20260923000001:
--   `ALTER FUNCTION is_owner() RENAME TO is_superadmin` memang memperbarui
--   seluruh POLICY yang memanggilnya — policy menyimpan referensi ke OID
--   fungsi. Tapi BADAN FUNGSI lain disimpan sebagai teks, jadi pemanggilan
--   `is_owner()` di dalamnya tidak ikut berubah dan kini menunjuk fungsi yang
--   sudah tidak ada.
--
-- Gejalanya: setiap query yang melewati can_access_unit()/can_access_job()
-- gagal dengan "function is_owner() does not exist" — termasuk monitoring
-- uang jalan, dan seluruh tabel lain yang RLS-nya memakai kedua fungsi ini.
--
-- Tidak terdeteksi lebih awal karena policy umumnya mengecek is_active_admin()
-- lebih dulu; untuk permintaan tanpa identitas, evaluasi berhenti di situ dan
-- badan fungsi yang rusak tidak pernah dijalankan. Baru muncul setelah login.
--
-- CREATE OR REPLACE tidak mengubah OID, jadi seluruh policy yang sudah
-- menunjuk ke fungsi-fungsi ini tetap utuh.
-- ============================================================================

CREATE OR REPLACE FUNCTION can_access_unit(p_unit_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM units u
      WHERE u.id = p_unit_id
        AND u.jenis_unit_id = ANY (
          COALESCE(current_user_jenis_scope(), ARRAY[]::UUID[])
        )
    );
$$;

-- Versi terakhir can_access_job berasal dari migration uang_jalan
-- (20260805000001); bentuknya dipertahankan persis, hanya is_owner() yang
-- diganti.
CREATE OR REPLACE FUNCTION can_access_job(p_job_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = p_job_id
      AND (is_superadmin() OR can_access_unit(j.unit_id))
  );
$$;

-- ── Jaring pengaman ─────────────────────────────────────────────────────────
-- Pastikan tidak ada lagi rutin tersimpan yang memanggil is_owner(). Kalau
-- masih ada, gagalkan migrasi supaya ketahuan sekarang, bukan nanti saat
-- dipakai pengguna.
DO $$
DECLARE
  sisa TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO sisa
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ILIKE '%is_owner()%';

  IF sisa IS NOT NULL THEN
    RAISE EXCEPTION 'Masih ada fungsi yang memanggil is_owner(): %', sisa;
  END IF;

  RAISE NOTICE 'Semua fungsi akses sudah memakai is_superadmin().';
END $$;
