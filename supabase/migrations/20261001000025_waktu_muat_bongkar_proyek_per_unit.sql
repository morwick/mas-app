-- ============================================================================
-- Migration 20261001000025: waktu muat & bongkar job + daftar "Proyek per unit"
--
-- 1. Kolom baru di jobs (diisi otomatis trigger, BATASAN):
--      muat_at    = saat job pertama kali masuk tahap 'loading' (muat)
--      bongkar_at = saat job pertama kali masuk tahap 'unloading' (bongkar)
--    Admin yang melompati tahap (mis. langsung 'dalam_perjalanan') tetap
--    mengisi muat_at saat itu. Bila admin mengembalikan job ke tahap sebelum
--    muat / bongkar, kolomnya dikosongkan lagi lalu diisi ulang.
--    Job lama diisi dari riwayat status (job_status_history) — butuh sesi log
--    (superadmin aktif pertama).
-- 2. Fungsi daftar_proyek_per_unit: Tab "Proyek per unit" di menu Proyek.
--    Satu baris per unit aktif (paging LIMIT/OFFSET per unit) + daftar proyek
--    yang memakai unit itu pada periode terpilih, urut tanggal muat.
--    Periode & urutan memakai tanggal muat; job yang belum muat memakai ETD.
--    Filter: bulan, tahun, status proyek ('aktif' | 'batal' | NULL),
--    pencarian (kode unit, no. polisi, nomor proyek, customer).
--    BATASAN: semua unit aktif tampil walau tidak punya proyek di periode itu
--    (kecuali sedang mencari). RLS pemanggil tetap berlaku (SECURITY INVOKER).
--
-- WAJIB: jalankan setelah 20261001000024. Naikkan backend & frontend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Kolom waktu muat & bongkar ───────────────────────────────────────────
ALTER TABLE transport.jobs ADD COLUMN IF NOT EXISTS muat_at TIMESTAMPTZ;
ALTER TABLE transport.jobs ADD COLUMN IF NOT EXISTS bongkar_at TIMESTAMPTZ;
COMMENT ON COLUMN transport.jobs.muat_at IS 'Saat job pertama kali masuk tahap loading (muat).';
COMMENT ON COLUMN transport.jobs.bongkar_at IS 'Saat job pertama kali masuk tahap unloading (bongkar).';
CREATE INDEX IF NOT EXISTS idx_jobs_unit_muat ON transport.jobs (unit_id, muat_at) WHERE status = 1;

CREATE OR REPLACE FUNCTION transport.jobs_catat_muat_bongkar()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = transport, extensions
AS $$
BEGIN
  -- Muat: tahap loading dan sesudahnya (kecuali tutup/batal).
  IF NEW.status_job IN ('loading', 'dalam_perjalanan', 'unloading', 'serah_terima_pool', 'menunggu_validasi') THEN
    IF NEW.muat_at IS NULL THEN
      NEW.muat_at := now();
    END IF;
  ELSIF NEW.status_job IN ('menunggu_pickup', 'ditugaskan', 'diterima') THEN
    NEW.muat_at := NULL;   -- dikembalikan admin ke sebelum muat
  END IF;

  -- Bongkar: tahap unloading dan sesudahnya.
  IF NEW.status_job IN ('unloading', 'serah_terima_pool', 'menunggu_validasi') THEN
    IF NEW.bongkar_at IS NULL THEN
      NEW.bongkar_at := now();
    END IF;
  ELSIF NEW.status_job IN ('menunggu_pickup', 'ditugaskan', 'diterima', 'loading', 'dalam_perjalanan') THEN
    NEW.bongkar_at := NULL;   -- dikembalikan admin ke sebelum bongkar
  END IF;
  -- 'selesai' & 'cancelled': nilai yang ada dipertahankan (job yang ditutup
  -- karena ganti unit tidak pernah bongkar → tetap kosong).
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.jobs_catat_muat_bongkar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_jobs_catat_muat_bongkar ON transport.jobs;
CREATE TRIGGER trg_jobs_catat_muat_bongkar
  BEFORE INSERT OR UPDATE OF status_job ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_catat_muat_bongkar();

-- Data lama: dari riwayat status (pertama kali masuk loading / unloading).
DO $$
DECLARE
  v_karyawan UUID;
  v_isi      INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM transport.jobs j
     WHERE j.status = 1 AND (j.muat_at IS NULL OR j.bongkar_at IS NULL)
       AND EXISTS (SELECT 1 FROM transport.job_status_history h
                    WHERE h.job_id = j.id AND h.status_new IN ('loading', 'unloading'))
  ) THEN
    RETURN;
  END IF;
  SELECT p.karyawan_id INTO v_karyawan FROM transport.profiles p
   WHERE 'superadmin' = ANY (p.roles) AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_karyawan IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat perubahan data.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_karyawan, 'Migrasi 20261001000025');

  UPDATE transport.jobs j
     SET muat_at = COALESCE(j.muat_at,
           (SELECT min(h.changed_at) FROM transport.job_status_history h
             WHERE h.job_id = j.id AND h.status_new = 'loading')),
         bongkar_at = COALESCE(j.bongkar_at,
           (SELECT min(h.changed_at) FROM transport.job_status_history h
             WHERE h.job_id = j.id AND h.status_new = 'unloading'))
   WHERE j.status = 1
     AND (j.muat_at IS NULL OR j.bongkar_at IS NULL)
     AND EXISTS (SELECT 1 FROM transport.job_status_history h
                  WHERE h.job_id = j.id AND h.status_new IN ('loading', 'unloading'));
  GET DIAGNOSTICS v_isi = ROW_COUNT;

  PERFORM transport.selesai_sesi_manual();
  RAISE NOTICE 'Job lama yang diisi waktu muat / bongkar: %', v_isi;
END $$;

-- ── 2. Daftar "Proyek per unit" ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.daftar_proyek_per_unit(
  p_q             TEXT    DEFAULT NULL,
  p_bulan         INTEGER DEFAULT NULL,
  p_tahun         INTEGER DEFAULT NULL,
  p_status_proyek TEXT    DEFAULT NULL,
  p_limit         INTEGER DEFAULT 10,
  p_offset        INTEGER DEFAULT 0
)
RETURNS TABLE (
  unit_id          UUID,
  kode_unit        TEXT,
  no_polisi        TEXT,
  jenis_unit_nama  TEXT,
  proyek           JSONB,
  total            BIGINT
)
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  WITH kata AS (
    SELECT NULLIF(btrim(COALESCE(p_q, '')), '') AS q
  ),
  -- Ringkasan per proyek (seluruh job proyek) — untuk status dibatalkan.
  proyek_hitung AS (
    SELECT j.proyek_id,
           count(*) AS jumlah_job,
           count(*) FILTER (WHERE j.status_job = 'cancelled') AS jumlah_batal
      FROM transport.jobs j
     WHERE j.status = 1
     GROUP BY j.proyek_id
  ),
  -- Satu baris per (unit, proyek) pada periode terpilih.
  pakai AS (
    SELECT j.unit_id, j.proyek_id,
           min(j.muat_at) AS tanggal_muat,
           max(j.bongkar_at) AS tanggal_bongkar,
           min(COALESCE(j.muat_at, j.etd)) AS urut,
           min(j.etd) AS etd_awal,
           count(*) FILTER (WHERE j.status_job <> 'cancelled') AS jumlah_job
      FROM transport.jobs j
     WHERE j.status = 1
       AND (p_bulan IS NULL OR extract(month FROM COALESCE(j.muat_at, j.etd) AT TIME ZONE 'Asia/Jakarta') = p_bulan)
       AND (p_tahun IS NULL OR extract(year FROM COALESCE(j.muat_at, j.etd) AT TIME ZONE 'Asia/Jakarta') = p_tahun)
     GROUP BY j.unit_id, j.proyek_id
  ),
  anak AS (
    SELECT pk.*, p.nomor_proyek, c.nama_perusahaan AS customer_nama,
           (COALESCE(h.jumlah_job, 0) > 0 AND h.jumlah_batal >= h.jumlah_job) AS dibatalkan
      FROM pakai pk
      JOIN transport.proyek p ON p.id = pk.proyek_id AND p.status = 1
      LEFT JOIN transport.customers c ON c.id = p.customer_id
      LEFT JOIN proyek_hitung h ON h.proyek_id = pk.proyek_id
  ),
  anak_saring AS (
    SELECT a.*
      FROM anak a
     WHERE p_status_proyek IS NULL
        OR (p_status_proyek = 'batal' AND a.dibatalkan)
        OR (p_status_proyek = 'aktif' AND NOT a.dibatalkan)
  ),
  unit_cocok AS (
    SELECT u.id, u.kode_unit, u.no_polisi, ju.nama AS jenis_unit_nama,
           (kata.q IS NULL OR u.kode_unit ILIKE '%' || kata.q || '%' OR u.no_polisi ILIKE '%' || kata.q || '%')
             AS cocok_unit
      FROM transport.units u
      LEFT JOIN transport.jenis_unit ju ON ju.id = u.jenis_unit_id
      CROSS JOIN kata
     WHERE u.status = 1 AND u.is_active
  ),
  baris AS (
    SELECT uc.id, uc.kode_unit, uc.no_polisi, uc.jenis_unit_nama,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'proyek_id', a.proyek_id, 'nomor_proyek', a.nomor_proyek,
                      'customer_nama', a.customer_nama, 'jumlah_job', a.jumlah_job,
                      'tanggal_muat', a.tanggal_muat, 'tanggal_bongkar', a.tanggal_bongkar,
                      'etd_awal', a.etd_awal, 'dibatalkan', a.dibatalkan)
                      ORDER BY a.urut, a.nomor_proyek)
               FROM anak_saring a, kata
              WHERE a.unit_id = uc.id
                -- Unit cocok dengan kata kunci → semua proyeknya; selain itu
                -- hanya proyek yang nomor / customer-nya cocok.
                AND (uc.cocok_unit
                     OR a.nomor_proyek ILIKE '%' || kata.q || '%'
                     OR a.customer_nama ILIKE '%' || kata.q || '%')), '[]'::jsonb) AS proyek,
           uc.cocok_unit
      FROM unit_cocok uc
  )
  SELECT b.id, b.kode_unit, b.no_polisi, b.jenis_unit_nama, b.proyek, count(*) OVER ()
    FROM baris b
   -- Tanpa pencarian: semua unit aktif (walau tanpa proyek). Dengan pencarian:
   -- unit yang cocok, atau yang punya proyek cocok.
   WHERE b.cocok_unit OR jsonb_array_length(b.proyek) > 0
   ORDER BY b.kode_unit
   LIMIT CASE WHEN p_limit IS NULL OR p_limit < 0 THEN 5000 ELSE LEAST(p_limit, 5000) END
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
REVOKE ALL ON FUNCTION transport.daftar_proyek_per_unit(TEXT, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.daftar_proyek_per_unit(TEXT, INTEGER, INTEGER, TEXT, INTEGER, INTEGER)
  TO authenticated, service_role;
