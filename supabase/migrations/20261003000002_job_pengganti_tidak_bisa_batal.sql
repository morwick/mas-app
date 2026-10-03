-- ============================================================================
-- Migration 20261003000002: job pengganti (ganti unit) tidak bisa dibatalkan
--
-- Menggantikan alur "Selesaikan job dengan unit lain" (20261001000029):
-- daripada membatalkan job pengganti lalu membuat pengganti baru, job
-- pengganti kini tidak boleh dibatalkan sama sekali.
--
--   * BATASAN: job dengan menggantikan_job_id terisi tidak bisa diubah ke
--     status 'cancelled' — lewat jalur mana pun (batalkan job / ubah status
--     manual / SQL lewat API).
--   * Fungsi buat_ulang_job_pengganti dihapus (tombolnya sudah dihapus dari
--     aplikasi dan endpoint-nya dari backend).
--
-- Tidak ada perubahan data: job pengganti yang terlanjur dibatalkan tetap
-- tercatat apa adanya.
-- WAJIB: jalankan setelah 20261003000001. Naikkan backend & frontend
-- bersamaan (backend lama masih memanggil buat_ulang_job_pengganti).
-- Aman dijalankan ulang.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.jobs_tolak_batal_job_pengganti()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = transport, extensions
AS $$
BEGIN
  IF NEW.status_job = 'cancelled'
     AND OLD.status_job IS DISTINCT FROM 'cancelled'
     AND NEW.menggantikan_job_id IS NOT NULL THEN
    RAISE EXCEPTION 'Job % adalah job pengganti (ganti unit) dan tidak bisa dibatalkan.', NEW.job_number
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_jobs_tolak_batal_job_pengganti ON transport.jobs;
CREATE TRIGGER trg_jobs_tolak_batal_job_pengganti
  BEFORE UPDATE OF status_job ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_tolak_batal_job_pengganti();

DROP FUNCTION IF EXISTS transport.buat_ulang_job_pengganti(UUID, JSONB, TEXT);

NOTIFY pgrst, 'reload schema';
