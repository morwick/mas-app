-- ============================================================================
-- Migration 20260928000002: link tracking customer — selesai saat unloading
--                           tuntas, berlaku sampai 24 jam sesudahnya
--
-- Sebelumnya link tracking (share token) langsung mati begitu admin
-- memvalidasi job (status 'selesai'), dan selama job di pool / menunggu
-- validasi customer masih melihat tahap "Unloading".
--
-- Aturan baru:
--   * Bagi customer, job SELESAI begitu driver menuntaskan unloading — yaitu
--     saat job pertama kali masuk 'serah_terima_pool'. Fungsi
--     driver_update_job_status sudah mewajibkan 5 foto unloading (4 sisi
--     kendaraan + surat jalan) sebelum langkah itu.
--   * Waktunya dicatat di kolom baru jobs.unloading_selesai_at (trigger).
--     Bila admin mengembalikan job ke tahap sebelum pool, kolom dikosongkan
--     lagi dan diisi ulang saat unloading dituntaskan kembali.
--   * Link masih bisa dibuka selama now() <= unloading_selesai_at + 24 jam,
--     apa pun status internalnya (pool / menunggu validasi / selesai).
--     Job 'cancelled' tetap langsung tertutup.
--
-- Data lama (butuh sesi log — superadmin aktif pertama): unloading_selesai_at
-- diisi dari riwayat status pertama kali masuk 'serah_terima_pool'; bila tidak
-- ada riwayatnya, dari completed_at / validated_at / updated_at.
-- Jalankan setelah 20260928000001.
-- ============================================================================

SET search_path = transport, extensions;

ALTER TABLE transport.jobs
  ADD COLUMN IF NOT EXISTS unloading_selesai_at TIMESTAMPTZ;
COMMENT ON COLUMN transport.jobs.unloading_selesai_at IS
  'Saat driver menuntaskan unloading (masuk serah_terima_pool). Link tracking customer berlaku sampai +24 jam.';

-- ── Masa berlaku link tracking publik ──────────────────────────────────────
-- Dipakai semua policy anon di bawah supaya aturannya di satu tempat.
CREATE OR REPLACE FUNCTION transport.tracking_publik_aktif(
  p_status_job transport.job_status,
  p_unloading_selesai_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  SELECT CASE
    WHEN p_status_job = 'cancelled' THEN FALSE
    WHEN p_status_job IN ('serah_terima_pool', 'menunggu_validasi', 'selesai')
      -- Tanpa catatan waktu (seharusnya tidak terjadi setelah backfill) → tutup.
      THEN COALESCE(p_unloading_selesai_at >= now() - INTERVAL '24 hours', FALSE)
    ELSE TRUE
  END;
$$;
GRANT EXECUTE ON FUNCTION transport.tracking_publik_aktif(transport.job_status, TIMESTAMPTZ) TO anon, authenticated;

-- ── Catat waktu unloading tuntas ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.jobs_catat_unloading_selesai()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = transport, extensions
AS $$
BEGIN
  IF NEW.status_job IN ('serah_terima_pool', 'menunggu_validasi', 'selesai') THEN
    -- Pertama kali lewat unloading (termasuk admin yang melompati tahap).
    IF NEW.unloading_selesai_at IS NULL THEN
      NEW.unloading_selesai_at := now();
    END IF;
  ELSIF NEW.status_job <> 'cancelled' THEN
    -- Dikembalikan admin ke tahap sebelum pool: unloading belum tuntas lagi.
    NEW.unloading_selesai_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ── Data lama ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_karyawan UUID;
  v_isi      INTEGER;
BEGIN
  SELECT p.karyawan_id INTO v_karyawan FROM transport.profiles p
   WHERE p.role = 'superadmin' AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_karyawan IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat perubahan data.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_karyawan, 'Migrasi 20260928000002');

  UPDATE transport.jobs j
     SET unloading_selesai_at = COALESCE(
           (SELECT min(h.changed_at) FROM transport.job_status_history h
             WHERE h.job_id = j.id AND h.status_new = 'serah_terima_pool'),
           j.completed_at, j.validated_at, j.updated_at)
   WHERE j.status_job IN ('serah_terima_pool', 'menunggu_validasi', 'selesai')
     AND j.unloading_selesai_at IS NULL;
  GET DIAGNOSTICS v_isi = ROW_COUNT;

  PERFORM transport.selesai_sesi_manual();
  RAISE NOTICE 'Job lama yang diisi waktu selesai unloading: %', v_isi;
END $$;

DROP TRIGGER IF EXISTS trg_jobs_catat_unloading_selesai ON transport.jobs;
CREATE TRIGGER trg_jobs_catat_unloading_selesai
  BEFORE INSERT OR UPDATE OF status_job ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_catat_unloading_selesai();

-- ── Policy halaman tracking publik (share token) ───────────────────────────
DROP POLICY IF EXISTS "public_read_jobs_by_token" ON transport.jobs;
CREATE POLICY "public_read_jobs_by_token"
  ON transport.jobs FOR SELECT
  USING (
    auth.uid() IS NULL
    AND transport.current_share_token() IS NOT NULL
    AND share_token = transport.current_share_token()
    AND transport.tracking_publik_aktif(status_job, unloading_selesai_at)
    AND status = 1
  );

DROP POLICY IF EXISTS "public_read_photos_via_token" ON transport.job_photos;
CREATE POLICY "public_read_photos_via_token"
  ON transport.job_photos FOR SELECT
  USING (
    auth.uid() IS NULL AND job_photos.status = 1 AND EXISTS (
      SELECT 1 FROM transport.jobs j
      WHERE j.id = job_photos.job_id
        AND transport.current_share_token() IS NOT NULL
        AND j.share_token = transport.current_share_token()
        AND transport.tracking_publik_aktif(j.status_job, j.unloading_selesai_at)
        AND j.status = 1
    )
  );

DROP POLICY IF EXISTS "public_read_units_via_jobs" ON transport.units;
CREATE POLICY "public_read_units_via_jobs"
  ON transport.units FOR SELECT
  USING (
    auth.uid() IS NULL AND units.status = 1 AND EXISTS (
      SELECT 1 FROM transport.jobs j
      WHERE j.unit_id = units.id
        AND transport.current_share_token() IS NOT NULL
        AND j.share_token = transport.current_share_token()
        AND transport.tracking_publik_aktif(j.status_job, j.unloading_selesai_at)
        AND j.status = 1
    )
  );

DROP POLICY IF EXISTS "public_read_drivers_via_jobs" ON transport.drivers;
CREATE POLICY "public_read_drivers_via_jobs"
  ON transport.drivers FOR SELECT
  USING (
    auth.uid() IS NULL AND drivers.status = 1 AND EXISTS (
      SELECT 1 FROM transport.jobs j
      WHERE j.driver_id = drivers.id
        AND transport.current_share_token() IS NOT NULL
        AND j.share_token = transport.current_share_token()
        AND transport.tracking_publik_aktif(j.status_job, j.unloading_selesai_at)
        AND j.status = 1
    )
  );

DROP POLICY IF EXISTS "public_read_customers_via_jobs" ON transport.customers;
CREATE POLICY "public_read_customers_via_jobs"
  ON transport.customers FOR SELECT
  USING (
    auth.uid() IS NULL AND customers.status = 1 AND EXISTS (
      SELECT 1 FROM transport.jobs j
      WHERE j.customer_id = customers.id
        AND transport.current_share_token() IS NOT NULL
        AND j.share_token = transport.current_share_token()
        AND transport.tracking_publik_aktif(j.status_job, j.unloading_selesai_at)
        AND j.status = 1
    )
  );

-- Sebelumnya policy trailer tidak memeriksa share token: siapa pun tanpa login
-- bisa membaca trailer yang sedang dipakai job aktif. Disamakan dengan unit.
DROP POLICY IF EXISTS "public_read_unit_trailer_via_jobs" ON transport.unit_trailer;
CREATE POLICY "public_read_unit_trailer_via_jobs"
  ON transport.unit_trailer FOR SELECT
  USING (
    auth.uid() IS NULL AND EXISTS (
      SELECT 1 FROM transport.jobs j
      WHERE j.unit_trailer_id = unit_trailer.id
        AND transport.current_share_token() IS NOT NULL
        AND j.share_token = transport.current_share_token()
        AND transport.tracking_publik_aktif(j.status_job, j.unloading_selesai_at)
        AND j.status = 1
    )
  );

NOTIFY pgrst, 'reload schema';
