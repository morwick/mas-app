-- ============================================================================
-- Migration 20261001000006: status penawaran = draft / terkirim / completed
--
-- Status surat penawaran kini hanya menggambarkan tahap suratnya:
--   draft       → belum dikirim (bisa diedit / dihapus)
--   terkirim    → sudah dikirim, masih ada item yang belum diputuskan
--   completed   → SEMUA item sudah diputuskan (deal maupun ditolak)
--   kedaluwarsa → TIDAK disimpan: dihitung saat dibaca (draft / terkirim yang
--                 lewat tanggal berlaku)
-- Deal / ditolak adalah keputusan per ITEM (quotation_items.keputusan), bukan
-- status surat — sebelumnya surat dengan 2 item deal & 1 ditolak berstatus
-- "deal" sehingga tidak muncul di filter Ditolak.
--
--   * Data lama: status 'deal' / 'ditolak' → 'completed' (tercatat di log
--     sistem atas nama superadmin aktif pertama).
--   * CHECK: status tersimpan hanya draft / terkirim / completed.
--   * job_cek_item_penawaran: job cukup dari item yang keputusannya deal —
--     status surat tidak lagi diperiksa (item deal boleh dibuatkan job walau
--     item lain di surat yang sama masih menunggu).
--   * rekomendasi_harga_penawaran: item deal di penawaran terkirim / completed.
--
-- WAJIB: jalankan setelah 20261001000005 (nilai enum 'completed') dan
-- 20261001000003 (fungsi rekomendasi harga). Backend & frontend versi baru
-- harus naik bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Data lama ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_karyawan UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM transport.quotations WHERE status_penawaran IN ('deal', 'ditolak')) THEN
    RETURN;
  END IF;
  SELECT p.karyawan_id INTO v_karyawan FROM transport.profiles p
   WHERE 'superadmin' = ANY (p.roles) AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_karyawan IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat perubahan data.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_karyawan, 'Migrasi 20261001000006');
  UPDATE transport.quotations
     SET status_penawaran = 'completed'
   WHERE status_penawaran IN ('deal', 'ditolak');
  PERFORM transport.selesai_sesi_manual();
END $$;

-- ── 2. Status tersimpan hanya tiga nilai ────────────────────────────────────
ALTER TABLE transport.quotations DROP CONSTRAINT IF EXISTS quotations_status_penawaran_check;
ALTER TABLE transport.quotations ADD CONSTRAINT quotations_status_penawaran_check
  CHECK (status_penawaran IN ('draft', 'terkirim', 'completed'));

-- ── 3. Job dari item deal (keputusan item, bukan status surat) ──────────────
-- Salinan 20260926000015 tanpa pemeriksaan status surat.
CREATE OR REPLACE FUNCTION transport.job_cek_item_penawaran()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_item   transport.quotation_items%ROWTYPE;
  v_nomor  TEXT;
BEGIN
  IF NEW.quotation_item_id IS NULL OR NEW.status <> 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.quotation_item_id IS NOT DISTINCT FROM OLD.quotation_item_id
     AND NEW.quotation_id IS NOT DISTINCT FROM OLD.quotation_id THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_item FROM transport.quotation_items WHERE id = NEW.quotation_item_id AND status = 1;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Item penawaran tidak ditemukan.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.quotation_id IS DISTINCT FROM v_item.quotation_id THEN
    RAISE EXCEPTION 'Item penawaran bukan milik penawaran job ini.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT quote_number INTO v_nomor
    FROM transport.quotations WHERE id = v_item.quotation_id AND status = 1;
  IF v_nomor IS NULL THEN
    RAISE EXCEPTION 'Penawaran tidak ditemukan.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_item.keputusan <> 'deal' THEN
    RAISE EXCEPTION 'Job hanya bisa dibuat dari item penawaran % yang disetujui (deal).', v_nomor
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4. Rekomendasi harga: salinan 20261001000003 dengan status baru ─────────
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
             (qi.keputusan = 'deal' AND q.status_penawaran::text IN ('terkirim', 'completed'))
          OR (qi.keputusan = 'menunggu' AND q.status_penawaran::text = 'terkirim')
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

NOTIFY pgrst, 'reload schema';
