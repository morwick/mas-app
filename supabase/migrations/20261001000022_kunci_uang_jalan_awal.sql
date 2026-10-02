-- ============================================================================
-- Migration 20261001000022: uang jalan awal terkunci setelah ada pencairan
--
-- BATASAN: uang jalan awal job tidak boleh diubah lagi begitu sudah ada
-- riwayat uang jalan yang KELUAR ke driver (baris uang_jalan jenis
-- 'pencairan' yang aktif). Kebutuhan uang tambahan sesudahnya dicatat lewat
-- "Tambah uang jalan" (dengan approval) supaya ada jejaknya.
-- Dijaga juga di backend (UangJalanService.set_uang_jalan_awal) & frontend
-- (kartu uang jalan di detail job).
--
-- Tidak ada perubahan data. Aman dijalankan ulang.
-- WAJIB: jalankan setelah 20261001000021.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.jobs_kunci_uang_jalan_awal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF NEW.uang_jalan_awal IS DISTINCT FROM OLD.uang_jalan_awal
     AND EXISTS (SELECT 1 FROM transport.uang_jalan u
                  WHERE u.job_id = NEW.id AND u.status = 1 AND u.jenis = 'pencairan') THEN
    RAISE EXCEPTION 'Uang jalan awal job % tidak bisa diubah karena uang jalan sudah dikasih ke driver. Gunakan "Tambah uang jalan".',
      NEW.job_number
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.jobs_kunci_uang_jalan_awal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_jobs_kunci_uang_jalan_awal ON transport.jobs;
CREATE TRIGGER trg_jobs_kunci_uang_jalan_awal
  BEFORE UPDATE OF uang_jalan_awal ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_kunci_uang_jalan_awal();
