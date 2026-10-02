-- ============================================================================
-- Migration 20261001000015: filter status proyek (Aktif / Dibatalkan)
--
-- daftar_proyek mendapat parameter baru p_status_proyek ('aktif' | 'batal' |
-- NULL = semua) untuk filter Semua/Aktif/Dibatalkan di Tab Proyek.
--
-- BATASAN: proyek berstatus "Dibatalkan" bila punya job dan SEMUA job-nya
-- dibatalkan (termasuk proyek 1 job yang job-nya dibatalkan). Status ini
-- turunan dari job — tidak ada kolom baru; proyek kembali Aktif otomatis bila
-- job baru ditambahkan.
--
-- Tidak ada perubahan data.
-- WAJIB: jalankan setelah 20261001000014. Naikkan backend & frontend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

DROP FUNCTION IF EXISTS transport.daftar_proyek(TEXT, UUID, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION transport.daftar_proyek(
  p_q              TEXT    DEFAULT NULL,
  p_customer_id    UUID    DEFAULT NULL,
  p_tanpa_customer BOOLEAN DEFAULT false,
  p_bulan          INTEGER DEFAULT NULL,
  p_tahun          INTEGER DEFAULT NULL,
  p_status_tagih   TEXT    DEFAULT NULL,
  -- 'aktif' | 'batal' | NULL (semua). Lihat BATASAN di kepala file.
  p_status_proyek  TEXT    DEFAULT NULL,
  p_limit          INTEGER DEFAULT 10,
  p_offset         INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                 UUID,
  nomor_proyek       TEXT,
  customer_id        UUID,
  customer_nama      TEXT,
  pic_nama           TEXT,
  pic_no_hp          TEXT,
  created_by_nama    TEXT,
  created_at         TIMESTAMPTZ,
  jumlah_job         INTEGER,
  jumlah_job_selesai INTEGER,
  jumlah_job_batal   INTEGER,
  invoice_id         UUID,
  invoice_number     TEXT,
  unit_kode          TEXT,
  quote_number       TEXT,
  total              BIGINT
)
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  WITH tagihan AS (
    -- Tagihan aktif (tidak batal) per proyek — maksimal satu.
    SELECT DISTINCT ON (j.proyek_id) j.proyek_id, i.id AS invoice_id, i.invoice_number
      FROM transport.invoice_items it
      JOIN transport.invoices i ON i.id = it.invoice_id
      JOIN transport.jobs j ON j.id = it.job_id
     WHERE it.status = 1 AND i.status = 1 AND i.status_tagihan <> 'batal' AND j.status = 1
     ORDER BY j.proyek_id, i.created_at
  ),
  hitung AS (
    SELECT j.proyek_id,
           count(*)::INTEGER AS jumlah_job,
           count(*) FILTER (WHERE j.status_job = 'selesai')::INTEGER AS jumlah_job_selesai,
           count(*) FILTER (WHERE j.status_job = 'cancelled')::INTEGER AS jumlah_job_batal,
           -- Unit proyek (bisa lebih dari satu setelah ganti unit), urut dipakai.
           string_agg(DISTINCT u.kode_unit, ', ') AS unit_kode,
           (array_agg(q.quote_number ORDER BY j.created_at) FILTER (WHERE q.quote_number IS NOT NULL))[1] AS quote_number
      FROM transport.jobs j
      JOIN transport.units u ON u.id = j.unit_id
      LEFT JOIN transport.quotations q ON q.id = j.quotation_id
     WHERE j.status = 1
     GROUP BY j.proyek_id
  ),
  kata AS (
    SELECT NULLIF(btrim(COALESCE(p_q, '')), '') AS q
  )
  SELECT p.id, p.nomor_proyek, p.customer_id, c.nama_perusahaan, p.pic_nama, p.pic_no_hp,
         pr.nama, p.created_at,
         COALESCE(h.jumlah_job, 0), COALESCE(h.jumlah_job_selesai, 0), COALESCE(h.jumlah_job_batal, 0),
         t.invoice_id, t.invoice_number, h.unit_kode, h.quote_number,
         count(*) OVER ()
    FROM transport.proyek p
    LEFT JOIN transport.customers c ON c.id = p.customer_id
    LEFT JOIN transport.profiles pr ON pr.id = p.created_by
    LEFT JOIN hitung h ON h.proyek_id = p.id
    LEFT JOIN tagihan t ON t.proyek_id = p.id
    CROSS JOIN kata
   WHERE p.status = 1
     AND (p_customer_id IS NULL OR p.customer_id = p_customer_id)
     AND (NOT COALESCE(p_tanpa_customer, false) OR p.customer_id IS NULL)
     AND (p_bulan IS NULL OR EXTRACT(MONTH FROM p.created_at AT TIME ZONE 'Asia/Jakarta') = p_bulan)
     AND (p_tahun IS NULL OR EXTRACT(YEAR FROM p.created_at AT TIME ZONE 'Asia/Jakarta') = p_tahun)
     AND (p_status_tagih IS NULL
          OR (p_status_tagih = 'sudah' AND t.invoice_id IS NOT NULL)
          OR (p_status_tagih = 'belum' AND t.invoice_id IS NULL))
     -- BATASAN: proyek dibatalkan = punya job dan semua job-nya dibatalkan.
     AND (p_status_proyek IS NULL
          OR (p_status_proyek = 'batal'
              AND COALESCE(h.jumlah_job, 0) > 0 AND h.jumlah_job_batal >= h.jumlah_job)
          OR (p_status_proyek = 'aktif'
              AND NOT (COALESCE(h.jumlah_job, 0) > 0 AND h.jumlah_job_batal >= h.jumlah_job)))
     AND (kata.q IS NULL
          OR p.nomor_proyek ILIKE '%' || kata.q || '%'
          OR c.nama_perusahaan ILIKE '%' || kata.q || '%'
          OR p.pic_nama ILIKE '%' || kata.q || '%'
          OR h.unit_kode ILIKE '%' || kata.q || '%'
          OR h.quote_number ILIKE '%' || kata.q || '%'
          OR EXISTS (SELECT 1 FROM transport.jobs j
                      WHERE j.proyek_id = p.id AND j.status = 1
                        AND j.job_number ILIKE '%' || kata.q || '%'))
   ORDER BY p.created_at DESC, p.nomor_proyek DESC
   LIMIT CASE WHEN p_limit IS NULL OR p_limit < 0 THEN 5000 ELSE LEAST(p_limit, 5000) END
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
REVOKE ALL ON FUNCTION transport.daftar_proyek(TEXT, UUID, BOOLEAN, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.daftar_proyek(TEXT, UUID, BOOLEAN, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER)
  TO authenticated, service_role;
