-- ============================================================================
-- Migration 20261001000008: istilah "pagu" → "uang jalan" di database
--
-- Supaya seragam dengan tampilan, semua nama yang memakai "pagu" diganti:
--   * kolom   transport.jobs.uang_jalan_pagu        → uang_jalan_awal
--   * check   jobs_uang_jalan_pagu_check            → jobs_uang_jalan_awal_check
--   * enum    uang_jalan_jenis 'penambahan_pagu'    → 'tambahan'
--   * fungsi  job_uang_jalan_posisi: kolom hasil pagu → uang_jalan
--             (uang jalan job = awal + tambahan)
--   * trigger jobs_require_pagu → jobs_wajib_uang_jalan_awal
--   * fungsi/trigger dari 20261001000007 ditulis ulang dengan nama baru.
--
-- Rename kolom & nilai enum tidak mengubah data. CHECK constraint yang memakai
-- nilai enum (uang_jalan_sumber_check) ikut otomatis karena menyimpan nilai
-- enum, bukan teksnya; badan fungsi yang menulis teks 'penambahan_pagu' /
-- uang_jalan_pagu ditulis ulang di bawah.
--
-- TIDAK KOMPATIBEL DENGAN KODE LAMA: backend, web, dan aplikasi mobile versi
-- baru wajib naik bersamaan dengan migration ini.
-- WAJIB: jalankan setelah 20261001000007.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Kolom & enum ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'transport' AND table_name = 'jobs' AND column_name = 'uang_jalan_pagu') THEN
    ALTER TABLE transport.jobs RENAME COLUMN uang_jalan_pagu TO uang_jalan_awal;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_uang_jalan_pagu_check') THEN
    ALTER TABLE transport.jobs RENAME CONSTRAINT jobs_uang_jalan_pagu_check TO jobs_uang_jalan_awal_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'uang_jalan_jenis' AND e.enumlabel = 'penambahan_pagu') THEN
    ALTER TYPE transport.uang_jalan_jenis RENAME VALUE 'penambahan_pagu' TO 'tambahan';
  END IF;
END $$;
COMMENT ON COLUMN transport.jobs.uang_jalan_awal IS
  'Uang jalan yang ditetapkan saat job dibuat. Uang jalan job = ini + tambahan (uang_jalan jenis tambahan).';

-- ── 2. Uang jalan awal wajib diisi saat membuat job ─────────────────────────
-- Trigger, bukan CHECK: CHECK ikut dievaluasi saat UPDATE apa pun, sehingga
-- job lama yang uang jalannya 0 tidak bisa lagi diubah statusnya.
DROP TRIGGER IF EXISTS trg_jobs_require_pagu ON transport.jobs;
DROP FUNCTION IF EXISTS transport.jobs_require_pagu();
CREATE OR REPLACE FUNCTION transport.jobs_wajib_uang_jalan_awal()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = transport, extensions
AS $$
BEGIN
  IF COALESCE(NEW.uang_jalan_awal, 0) <= 0 THEN
    RAISE EXCEPTION 'Uang jalan wajib diisi saat membuat job' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_jobs_wajib_uang_jalan_awal ON transport.jobs;
CREATE TRIGGER trg_jobs_wajib_uang_jalan_awal
  BEFORE INSERT ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_wajib_uang_jalan_awal();

-- ── 3. Posisi uang jalan per job ────────────────────────────────────────────
-- Nama kolom hasil berubah → DROP dulu (pemanggilnya fungsi plpgsql, tidak
-- terikat dependensi; mereka hanya memakai sisa / pending_request / ada_bukti).
DROP FUNCTION IF EXISTS transport.job_uang_jalan_posisi(UUID);
CREATE FUNCTION transport.job_uang_jalan_posisi(p_job_id UUID)
RETURNS TABLE (uang_jalan BIGINT, cair BIGINT, sisa BIGINT, ada_bukti BOOLEAN, pending_request BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  WITH t AS (
    SELECT
      COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'tambahan'), 0)  AS tambah,
      COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'pencairan'), 0) AS cair,
      bool_or(jenis = 'pencairan' AND bukti_transfer_path IS NOT NULL) AS ada_bukti
    FROM transport.uang_jalan WHERE job_id = p_job_id AND status = 1
  )
  SELECT
    (j.uang_jalan_awal + t.tambah)::BIGINT,          -- uang jalan job
    t.cair::BIGINT,                                   -- sudah diberikan
    (j.uang_jalan_awal + t.tambah - t.cair)::BIGINT,  -- sisa
    COALESCE(t.ada_bukti, false),
    EXISTS (SELECT 1 FROM transport.uang_jalan_requests r
             WHERE r.job_id = p_job_id AND r.status = 1 AND r.status_pengajuan = 'diajukan')
  FROM transport.jobs j, t WHERE j.id = p_job_id AND j.status = 1;
$$;
GRANT EXECUTE ON FUNCTION transport.job_uang_jalan_posisi(UUID) TO anon, authenticated, service_role;

-- ── 4. Batas uang jalan (20261001000007) dengan nama baru ───────────────────
CREATE OR REPLACE FUNCTION transport._efek_uang_jalan_ke_sisa(p_status SMALLINT, p_jenis TEXT, p_jumlah NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN p_status IS DISTINCT FROM 1 THEN 0
           WHEN p_jenis = 'tambahan' THEN COALESCE(p_jumlah, 0)
           ELSE -COALESCE(p_jumlah, 0)
         END;
$$;

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
  -- BATASAN: hanya perubahan yang memperkecil sisa yang diperiksa, supaya data
  -- lama yang terlanjur minus tetap bisa diperbaiki.
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
    replace(to_char(v_pos.uang_jalan, 'FM999,999,999,999'), ',', '.')
    USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION transport._cek_uang_jalan_tidak_melebihi(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION transport.jobs_cek_uang_jalan_awal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  PERFORM transport._cek_uang_jalan_tidak_melebihi(
    NEW.id, COALESCE(NEW.uang_jalan_awal, 0) - COALESCE(OLD.uang_jalan_awal, 0));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION transport.jobs_cek_uang_jalan_awal() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_jobs_cek_uang_jalan_awal ON transport.jobs;
CREATE TRIGGER trg_jobs_cek_uang_jalan_awal
  AFTER UPDATE OF uang_jalan_awal ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_cek_uang_jalan_awal();

NOTIFY pgrst, 'reload schema';
