-- ============================================================================
-- Migration 20261001000028: koreksi uang jalan yang dikasih > uang jalan job
--
-- BATASAN (20261001000007): uang yang dikasih ke driver tidak boleh melebihi
-- uang jalan job (awal + tambahan yang disetujui). Data lama sebelum batasan
-- itu ada yang melebihi (mis. JOB-2026-017: awal 8 jt, dikasih 13 jt).
--
-- Koreksi (keputusan user): uang jalan AWAL job dinaikkan sehingga
--   awal + tambahan disetujui = uang yang sudah dikasih (cair bersih:
--   pencairan − pengembalian; kasbon tidak mengurangi).
-- Pencairan tidak diubah — uangnya memang sudah keluar.
--
-- Uang jalan awal terkunci setelah ada pencairan (20261001000022); kunci itu
-- diberi pintu khusus `app.koreksi_uang_jalan` = 'on' yang hanya dipasang di
-- dalam migrasi ini (lokal transaksi). Dari aplikasi kunci tetap berlaku.
-- Perubahan tercatat di log sistem (sesi superadmin aktif pertama).
-- Aman dijalankan ulang (job yang sudah sesuai tidak tersentuh).
-- WAJIB: jalankan setelah 20261001000027.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Kunci uang jalan awal + pintu koreksi data ───────────────────────────
CREATE OR REPLACE FUNCTION transport.jobs_kunci_uang_jalan_awal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  -- Koreksi data oleh migrasi (bukan dari aplikasi).
  IF COALESCE(current_setting('app.koreksi_uang_jalan', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
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

-- ── 2. Koreksi data ─────────────────────────────────────────────────────────
DO $$
DECLARE
  v_karyawan UUID;
  r          RECORD;
  v_isi      INTEGER := 0;
BEGIN
  -- Job yang uang dikasih-nya melebihi uang jalan job.
  CREATE TEMP TABLE _uj_lebih ON COMMIT DROP AS
  SELECT j.id, j.job_number, j.uang_jalan_awal,
         COALESCE(SUM(u.jumlah) FILTER (WHERE u.jenis = 'tambahan' AND u.status_approval = 'disetujui'), 0) AS tambah,
         COALESCE(SUM(u.jumlah) FILTER (WHERE u.jenis = 'pencairan'), 0)
           - COALESCE(SUM(u.jumlah) FILTER (WHERE u.jenis = 'pengembalian'), 0) AS cair
    FROM transport.jobs j
    LEFT JOIN transport.uang_jalan u ON u.job_id = j.id AND u.status = 1
   WHERE j.status = 1
   GROUP BY j.id, j.job_number, j.uang_jalan_awal
  HAVING COALESCE(SUM(u.jumlah) FILTER (WHERE u.jenis = 'pencairan'), 0)
           - COALESCE(SUM(u.jumlah) FILTER (WHERE u.jenis = 'pengembalian'), 0)
         > COALESCE(j.uang_jalan_awal, 0)
           + COALESCE(SUM(u.jumlah) FILTER (WHERE u.jenis = 'tambahan' AND u.status_approval = 'disetujui'), 0);

  IF NOT EXISTS (SELECT 1 FROM _uj_lebih) THEN
    RAISE NOTICE 'Tidak ada uang jalan yang melebihi — tidak ada yang dikoreksi.';
    RETURN;
  END IF;

  SELECT p.karyawan_id INTO v_karyawan FROM transport.profiles p
   WHERE 'superadmin' = ANY (p.roles) AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_karyawan IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat perubahan data.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_karyawan, 'Migrasi 20261001000028');
  PERFORM set_config('app.koreksi_uang_jalan', 'on', true);

  FOR r IN SELECT * FROM _uj_lebih LOOP
    UPDATE transport.jobs SET uang_jalan_awal = r.cair - r.tambah WHERE id = r.id;
    v_isi := v_isi + 1;
    RAISE NOTICE 'Job %: uang jalan awal % → % (dikasih %).',
      r.job_number, r.uang_jalan_awal, r.cair - r.tambah, r.cair;
  END LOOP;

  PERFORM set_config('app.koreksi_uang_jalan', '', true);
  PERFORM transport.selesai_sesi_manual();
  RAISE NOTICE 'Job yang dikoreksi: %', v_isi;
END $$;
