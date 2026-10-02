-- ============================================================================
-- Migration 20261001000027: "Proyek per unit" — kolom Rute (asal & tujuan)
--
-- Kolom Tujuan di Tab Proyek per unit diganti Rute (asal → tujuan, sama dengan
-- kolom Rute di daftar Job), jadi tiap job kini juga membawa `asal`.
-- Isi lain daftar_proyek_per_unit sama dengan 20261001000026.
--
-- Tidak ada perubahan data. Aman dijalankan ulang.
-- WAJIB: jalankan setelah 20261001000026. Naikkan backend & frontend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

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
  jobs             JSONB,
  total            BIGINT
)
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  WITH kata AS (
    SELECT NULLIF(btrim(COALESCE(p_q, '')), '') AS q
  ),
  -- Satu baris per job pada periode terpilih (periode & urutan: tanggal muat,
  -- job yang belum muat memakai ETD).
  anak AS (
    SELECT j.id AS job_id, j.job_number, j.unit_id, j.proyek_id, p.nomor_proyek,
           c.nama_perusahaan AS customer_nama, j.asal, j.tujuan, j.etd,
           j.muat_at AS tanggal_muat, j.bongkar_at AS tanggal_bongkar,
           COALESCE(j.muat_at, j.etd) AS urut,
           (j.status_job = 'cancelled') AS dibatalkan
      FROM transport.jobs j
      JOIN transport.proyek p ON p.id = j.proyek_id AND p.status = 1
      LEFT JOIN transport.customers c ON c.id = p.customer_id
     WHERE j.status = 1
       AND (p_bulan IS NULL OR extract(month FROM COALESCE(j.muat_at, j.etd) AT TIME ZONE 'Asia/Jakarta') = p_bulan)
       AND (p_tahun IS NULL OR extract(year FROM COALESCE(j.muat_at, j.etd) AT TIME ZONE 'Asia/Jakarta') = p_tahun)
  ),
  -- Status: aktif = job tidak dibatalkan; batal = job dibatalkan; NULL = semua.
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
                      'job_id', a.job_id, 'job_number', a.job_number,
                      'proyek_id', a.proyek_id, 'nomor_proyek', a.nomor_proyek,
                      'customer_nama', a.customer_nama, 'asal', a.asal, 'tujuan', a.tujuan, 'etd', a.etd,
                      'tanggal_muat', a.tanggal_muat, 'tanggal_bongkar', a.tanggal_bongkar,
                      'dibatalkan', a.dibatalkan)
                      ORDER BY a.urut, a.job_number)
               FROM anak_saring a, kata
              WHERE a.unit_id = uc.id
                -- Unit cocok dengan kata kunci → semua job-nya; selain itu hanya
                -- job yang nomor job / proyek / customer-nya cocok.
                AND (uc.cocok_unit
                     OR a.job_number ILIKE '%' || kata.q || '%'
                     OR a.nomor_proyek ILIKE '%' || kata.q || '%'
                     OR a.customer_nama ILIKE '%' || kata.q || '%')), '[]'::jsonb) AS jobs,
           uc.cocok_unit
      FROM unit_cocok uc
  )
  SELECT b.id, b.kode_unit, b.no_polisi, b.jenis_unit_nama, b.jobs, count(*) OVER ()
    FROM baris b
   -- Hanya unit yang punya job (setelah periode, status & pencarian).
   WHERE jsonb_array_length(b.jobs) > 0
   ORDER BY b.kode_unit
   LIMIT CASE WHEN p_limit IS NULL OR p_limit < 0 THEN 5000 ELSE LEAST(p_limit, 5000) END
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
REVOKE ALL ON FUNCTION transport.daftar_proyek_per_unit(TEXT, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.daftar_proyek_per_unit(TEXT, INTEGER, INTEGER, TEXT, INTEGER, INTEGER)
  TO authenticated, service_role;
