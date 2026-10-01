-- ============================================================================
-- Migration 20261001000003: rute (kecamatan) & jenis unit per item penawaran
--                           + rekomendasi harga terakhir
--
--   * transport.quotation_items.dari_kecamatan_kode / tujuan_kecamatan_kode
--     → hr.kecamatan(kode). Kolom teks `dari` / `tujuan` tetap ada: itulah
--     yang dicetak di surat (bisa lebih rinci, mis. nama site).
--   * transport.quotation_items.jenis_unit_id → transport.jenis_unit(id).
--   * transport.rekomendasi_harga_penawaran(...) — harga terakhir untuk rute
--     (dari → tujuan, arah dibedakan) + jenis unit yang sama, paling banyak
--     4 baris: {customer ini, semua customer} × {deal, menunggu}.
--       - deal     : item deal (harga revisi bila ada), terbaru menurut
--                    waktu diputuskan.
--       - menunggu : item yang belum diputuskan di penawaran TERKIRIM
--                    (draft belum ditawarkan ke customer), terbaru menurut
--                    tanggal surat.
--     SECURITY INVOKER: RLS penawaran tetap berlaku untuk pemanggil.
--
-- AMAN UNTUK KODE LAMA: kolom baru boleh NULL; item lama tidak diubah (rute
-- lama berupa teks bebas, tidak bisa dipetakan otomatis → tidak ikut
-- rekomendasi). Kewajiban mengisi untuk item baru dijaga backend.
-- WAJIB: jalankan setelah 20261001000001 (hr.kecamatan).
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Kolom ────────────────────────────────────────────────────────────────
ALTER TABLE transport.quotation_items
  ADD COLUMN IF NOT EXISTS dari_kecamatan_kode TEXT REFERENCES hr.kecamatan(kode);
ALTER TABLE transport.quotation_items
  ADD COLUMN IF NOT EXISTS tujuan_kecamatan_kode TEXT REFERENCES hr.kecamatan(kode);
ALTER TABLE transport.quotation_items
  ADD COLUMN IF NOT EXISTS jenis_unit_id UUID REFERENCES transport.jenis_unit(id);
COMMENT ON COLUMN transport.quotation_items.dari_kecamatan_kode IS
  'Kecamatan asal (hr.kecamatan). Teks yang dicetak tetap di kolom dari.';
COMMENT ON COLUMN transport.quotation_items.tujuan_kecamatan_kode IS
  'Kecamatan tujuan (hr.kecamatan). Teks yang dicetak tetap di kolom tujuan.';
COMMENT ON COLUMN transport.quotation_items.jenis_unit_id IS
  'Jenis unit yang ditawarkan — bersama rute, dasar rekomendasi harga terakhir.';

CREATE INDEX IF NOT EXISTS idx_quotation_items_rute
  ON transport.quotation_items (dari_kecamatan_kode, tujuan_kecamatan_kode, jenis_unit_id)
  WHERE status = 1;

-- ── 2. Rekomendasi harga terakhir ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.rekomendasi_harga_penawaran(
  p_dari_kecamatan_kode   TEXT,
  p_tujuan_kecamatan_kode TEXT,
  p_jenis_unit_id         UUID,
  p_customer_id           UUID DEFAULT NULL,
  p_kecuali_quotation_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  WITH kandidat AS (
    SELECT q.id AS quotation_id, q.quote_number, q.customer_id, q.customer_nama,
           q.tanggal, q.berlaku_sampai, q.created_at,
           qi.keputusan, qi.diputuskan_at, qi.harga_satuan, qi.harga_revisi,
           COALESCE(qi.harga_revisi, qi.harga_satuan) AS harga,
           qi.nama_alat, qi.qty, qi.satuan
      FROM transport.quotation_items qi
      JOIN transport.quotations q ON q.id = qi.quotation_id
     WHERE qi.status = 1
       AND q.status = 1
       AND qi.dari_kecamatan_kode = p_dari_kecamatan_kode
       AND qi.tujuan_kecamatan_kode = p_tujuan_kecamatan_kode
       AND qi.jenis_unit_id = p_jenis_unit_id
       AND (p_kecuali_quotation_id IS NULL OR q.id <> p_kecuali_quotation_id)
       AND (
             (qi.keputusan = 'deal' AND q.status_penawaran IN ('terkirim', 'deal'))
          OR (qi.keputusan = 'menunggu' AND q.status_penawaran = 'terkirim')
       )
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.lingkup, x.kategori), '[]'::jsonb)
    FROM (VALUES ('customer', 'deal'), ('customer', 'menunggu'), ('semua', 'deal'), ('semua', 'menunggu'))
         AS v(lingkup, kategori)
    CROSS JOIN LATERAL (
      SELECT v.lingkup, v.kategori, c.quotation_id, c.quote_number, c.customer_id, c.customer_nama,
             c.tanggal, c.berlaku_sampai, c.diputuskan_at, c.harga, c.harga_satuan, c.harga_revisi,
             c.nama_alat, c.qty, c.satuan
        FROM kandidat c
       WHERE c.keputusan = v.kategori
         AND (v.lingkup = 'semua' OR c.customer_id = p_customer_id)
       ORDER BY CASE WHEN v.kategori = 'deal' THEN c.diputuskan_at END DESC NULLS LAST,
                c.tanggal DESC, c.created_at DESC
       LIMIT 1
    ) x;
$$;
REVOKE ALL ON FUNCTION transport.rekomendasi_harga_penawaran(TEXT, TEXT, UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.rekomendasi_harga_penawaran(TEXT, TEXT, UUID, UUID, UUID)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
