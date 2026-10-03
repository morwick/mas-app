-- ============================================================================
-- Migration 20261003000006: laporan laba per proyek
--
-- Laporan laba sekarang per proyek (bukan per job). Tagihan ditulis per
-- proyek dan nominalnya dibagi rata ke job, jadi laba per job tidak lagi
-- bermakna — yang benar dijumlahkan per proyek.
--
-- Fungsi baru transport.get_proyek_profitability(p_start, p_end):
--   * Angka per job diambil dari get_job_profitability (pendapatan = baris
--     tagihan job, uang jalan bersih, biaya insiden), lalu dijumlah per proyek.
--   * BATASAN: rentang tanggal mengikuti ETD job PERTAMA proyek, dan seluruh
--     job proyek ikut dihitung — satu proyek tidak terpotong ke dua periode.
--   * Job cancelled tidak dihitung (sama seperti get_job_profitability).
--   * Job lama yang unitnya diganti tetap dihitung biayanya (cost proyek),
--     tapi tidak dianggap "belum selesai".
--
-- Perubahan data: tidak ada. get_job_profitability tidak diubah.
-- WAJIB: jalankan setelah 20261001000017 & 20261003000005.
-- ============================================================================

SET search_path = transport, extensions;

DROP FUNCTION IF EXISTS transport.get_proyek_profitability(DATE, DATE);
CREATE OR REPLACE FUNCTION transport.get_proyek_profitability(p_start DATE DEFAULT NULL, p_end DATE DEFAULT NULL)
RETURNS TABLE(
  proyek_id       UUID,
  nomor_proyek    TEXT,
  customer_nama   TEXT,
  kosongan        BOOLEAN,
  unit_kode       TEXT,
  etd_awal        TIMESTAMPTZ,
  jumlah_job      INT,
  semua_selesai   BOOLEAN,
  invoice_id      UUID,
  invoice_number  TEXT,
  pendapatan      BIGINT,
  uang_jalan      BIGINT,
  biaya_insiden   BIGINT,
  laba            BIGINT
)
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  WITH per_job AS (
    SELECT j.proyek_id, x.*
      FROM transport.get_job_profitability(NULL, NULL) x
      JOIN transport.jobs j ON j.id = x.job_id
  ),
  per_proyek AS (
    SELECT
      pj.proyek_id,
      MIN(pj.etd)                                      AS etd_awal,
      COUNT(*)::INT                                    AS jumlah_job,
      -- Job yang sudah diganti unitnya tidak menunggu selesai.
      BOOL_AND(pj.status = 'selesai' OR pj.diganti_oleh IS NOT NULL) AS semua_selesai,
      string_agg(DISTINCT pj.unit_kode, ', ')          AS unit_kode,
      MAX(pj.customer_nama)                            AS customer_nama,
      BOOL_OR(pj.kosongan)                             AS kosongan,
      SUM(pj.pendapatan)::BIGINT                       AS pendapatan,
      SUM(pj.uang_jalan)::BIGINT                       AS uang_jalan,
      SUM(pj.biaya_insiden)::BIGINT                    AS biaya_insiden,
      SUM(pj.laba)::BIGINT                             AS laba
    FROM per_job pj
    GROUP BY pj.proyek_id
  )
  SELECT
    pp.proyek_id,
    p.nomor_proyek,
    pp.customer_nama,
    pp.kosongan,
    pp.unit_kode,
    pp.etd_awal,
    pp.jumlah_job,
    pp.semua_selesai,
    tg.invoice_id,
    tg.invoice_number,
    pp.pendapatan,
    pp.uang_jalan,
    pp.biaya_insiden,
    pp.laba
  FROM per_proyek pp
  JOIN transport.proyek p ON p.id = pp.proyek_id AND p.status = 1
  LEFT JOIN LATERAL (
    -- Tagihan aktif proyek ini (satu proyek hanya satu tagihan).
    SELECT i.id AS invoice_id, i.invoice_number
      FROM transport.invoice_items ii
      JOIN transport.jobs jj ON jj.id = ii.job_id
      JOIN transport.invoices i ON i.id = ii.invoice_id
     WHERE jj.proyek_id = pp.proyek_id AND ii.status = 1
       AND i.status = 1 AND i.status_tagihan <> 'batal'
     LIMIT 1
  ) tg ON true
  WHERE (p_start IS NULL OR pp.etd_awal >= p_start::TIMESTAMPTZ)
    AND (p_end   IS NULL OR pp.etd_awal <  (p_end + 1)::TIMESTAMPTZ)
  ORDER BY pp.etd_awal DESC;
$$;
REVOKE ALL ON FUNCTION transport.get_proyek_profitability(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.get_proyek_profitability(DATE, DATE) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
