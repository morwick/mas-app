-- ============================================================================
-- Migration 20261001000007: uang jalan yang diberikan tidak boleh melebihi
--                           uang jalan job
--
-- BATASAN: total pencairan (uang yang diberikan ke driver) sebuah job tidak
-- boleh lebih dari uang jalan job = uang jalan awal (jobs.uang_jalan_pagu,
-- ditetapkan saat job dibuat) + tambahan uang jalan (uang_jalan jenis
-- 'penambahan_pagu'). Bila memang perlu lebih, admin mencatat tambahan uang
-- jalan dulu.
--
-- Sebelumnya hanya pengajuan driver yang dibatasi (driver_request_uang_jalan);
-- pencairan oleh admin hanya diberi peringatan di layar. Sekarang dijaga di
-- database untuk SEMUA jalan yang bisa membuat sisa minus:
--   * pencairan baru / pencairan diubah nominalnya;
--   * tambahan uang jalan dikurangi / dihapus;
--   * uang jalan awal job diturunkan.
--
-- Hanya perubahan yang MEMPERKECIL sisa yang diperiksa: data lama yang sudah
-- terlanjur minus tetap bisa diperbaiki (mis. dengan mencatat tambahan uang
-- jalan) tanpa terhalang trigger ini.
--
-- Istilah: kolom & nilai internal masih memakai "pagu" (uang_jalan_pagu,
-- 'penambahan_pagu') supaya aplikasi mobile versi lama tetap jalan; di
-- tampilan semuanya disebut "uang jalan".
--
-- AMAN UNTUK KODE LAMA: hanya menambah trigger. Data tidak diubah.
-- ============================================================================

SET search_path = transport, extensions;

-- Pengaruh satu baris uang_jalan terhadap sisa: tambahan menambah, pencairan
-- mengurangi, baris terhapus (status 2) tidak berpengaruh.
CREATE OR REPLACE FUNCTION transport._efek_uang_jalan_ke_sisa(p_status SMALLINT, p_jenis TEXT, p_jumlah NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN p_status IS DISTINCT FROM 1 THEN 0
           WHEN p_jenis = 'penambahan_pagu' THEN COALESCE(p_jumlah, 0)
           ELSE -COALESCE(p_jumlah, 0)
         END;
$$;

-- Tolak bila perubahan ini (p_delta < 0 = sisa berkurang) membuat sisa minus.
CREATE OR REPLACE FUNCTION transport._cek_uang_jalan_tidak_melebihi(p_job_id UUID, p_delta NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_pos   RECORD;
  v_nomor TEXT;
BEGIN
  IF p_job_id IS NULL OR p_delta >= 0 THEN
    RETURN;
  END IF;
  SELECT * INTO v_pos FROM transport.job_uang_jalan_posisi(p_job_id);
  IF v_pos IS NULL OR v_pos.sisa >= 0 THEN
    RETURN;
  END IF;
  SELECT job_number INTO v_nomor FROM transport.jobs WHERE id = p_job_id;
  RAISE EXCEPTION 'Uang jalan yang diberikan (Rp %) melebihi uang jalan job % (Rp %). Catat tambahan uang jalan dulu bila memang perlu lebih.',
    replace(to_char(v_pos.cair, 'FM999,999,999,999'), ',', '.'), COALESCE(v_nomor, ''),
    replace(to_char(v_pos.pagu, 'FM999,999,999,999'), ',', '.')
    USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION transport._cek_uang_jalan_tidak_melebihi(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;

-- ── Trigger: transaksi uang jalan ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.uang_jalan_cek_tidak_melebihi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_efek_baru NUMERIC := transport._efek_uang_jalan_ke_sisa(NEW.status, NEW.jenis::text, NEW.jumlah);
  v_efek_lama NUMERIC := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_efek_lama := transport._efek_uang_jalan_ke_sisa(OLD.status, OLD.jenis::text, OLD.jumlah);
    IF OLD.job_id IS DISTINCT FROM NEW.job_id THEN
      -- Pindah job: job lama kehilangan efek baris ini, job baru mendapatkannya.
      PERFORM transport._cek_uang_jalan_tidak_melebihi(OLD.job_id, -v_efek_lama);
      v_efek_lama := 0;
    END IF;
  END IF;
  PERFORM transport._cek_uang_jalan_tidak_melebihi(NEW.job_id, v_efek_baru - v_efek_lama);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION transport.uang_jalan_cek_tidak_melebihi() FROM PUBLIC, anon, authenticated;
-- AFTER: posisi dihitung ulang setelah baris ini tersimpan.
DROP TRIGGER IF EXISTS trg_uang_jalan_cek_tidak_melebihi ON transport.uang_jalan;
CREATE TRIGGER trg_uang_jalan_cek_tidak_melebihi
  AFTER INSERT OR UPDATE OF jumlah, jenis, status, job_id ON transport.uang_jalan
  FOR EACH ROW EXECUTE FUNCTION transport.uang_jalan_cek_tidak_melebihi();

-- ── Trigger: uang jalan awal job ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.jobs_cek_uang_jalan_awal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  PERFORM transport._cek_uang_jalan_tidak_melebihi(
    NEW.id, COALESCE(NEW.uang_jalan_pagu, 0) - COALESCE(OLD.uang_jalan_pagu, 0));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION transport.jobs_cek_uang_jalan_awal() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_jobs_cek_uang_jalan_awal ON transport.jobs;
CREATE TRIGGER trg_jobs_cek_uang_jalan_awal
  AFTER UPDATE OF uang_jalan_pagu ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_cek_uang_jalan_awal();
