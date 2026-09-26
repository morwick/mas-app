-- ============================================================================
-- Migration 20260926000015: keputusan deal / tolak per item penawaran
--
--   * quotation_items:
--       keputusan      'menunggu' | 'deal' | 'ditolak' (default 'menunggu')
--       harga_revisi   harga satuan hasil negosiasi (NULL = pakai harga awal).
--                      Harga awal (harga_satuan) tidak pernah ditimpa.
--       alasan_ditolak, diputuskan_at
--       subtotal_final = qty × COALESCE(harga_revisi, harga_satuan)
--   * jobs.quotation_item_id: job dibuat per item penawaran yang deal.
--     Dijaga DB: item harus milik penawaran job itu, berkeputusan 'deal', dan
--     penawarannya berstatus 'deal'.
--   * Keputusan item dikunci selama item itu dipakai job aktif.
--
-- Status penawaran (diatur backend, satu transaksi dengan keputusan item):
--   semua item diputuskan & ada yang deal → 'deal'; semua ditolak → 'ditolak';
--   masih ada yang menunggu → tetap 'terkirim'.
--
-- Data lama (butuh sesi log — superadmin aktif pertama):
--   * item dari penawaran 'deal' → keputusan 'deal'; 'ditolak' → 'ditolak'.
--   * job lama dari penawaran ber-item tunggal → quotation_item_id diisi.
--     Job dari penawaran multi-item dibiarkan kosong (dilaporkan lewat NOTICE).
-- Jalankan setelah 000014.
-- ============================================================================

SET search_path = transport, extensions;

ALTER TABLE transport.quotation_items
  ADD COLUMN IF NOT EXISTS keputusan TEXT NOT NULL DEFAULT 'menunggu',
  ADD COLUMN IF NOT EXISTS harga_revisi BIGINT,
  ADD COLUMN IF NOT EXISTS alasan_ditolak TEXT,
  ADD COLUMN IF NOT EXISTS diputuskan_at TIMESTAMPTZ;

ALTER TABLE transport.quotation_items DROP CONSTRAINT IF EXISTS quotation_items_keputusan_check;
ALTER TABLE transport.quotation_items ADD CONSTRAINT quotation_items_keputusan_check
  CHECK (keputusan IN ('menunggu', 'deal', 'ditolak'));
ALTER TABLE transport.quotation_items DROP CONSTRAINT IF EXISTS quotation_items_harga_revisi_check;
ALTER TABLE transport.quotation_items ADD CONSTRAINT quotation_items_harga_revisi_check
  CHECK (harga_revisi IS NULL OR harga_revisi >= 0);

ALTER TABLE transport.quotation_items
  ADD COLUMN IF NOT EXISTS subtotal_final BIGINT
  GENERATED ALWAYS AS (qty * COALESCE(harga_revisi, harga_satuan)) STORED;

ALTER TABLE transport.jobs
  ADD COLUMN IF NOT EXISTS quotation_item_id UUID REFERENCES transport.quotation_items(id);
CREATE INDEX IF NOT EXISTS idx_jobs_quotation_item
  ON transport.jobs(quotation_item_id) WHERE quotation_item_id IS NOT NULL;

-- ── Job ↔ item penawaran ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.job_cek_item_penawaran()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_item   transport.quotation_items%ROWTYPE;
  v_status TEXT;
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
  SELECT status_penawaran::text, quote_number INTO v_status, v_nomor
    FROM transport.quotations WHERE id = v_item.quotation_id AND status = 1;
  IF v_item.keputusan <> 'deal' OR v_status IS DISTINCT FROM 'deal' THEN
    RAISE EXCEPTION 'Job hanya bisa dibuat dari item penawaran % yang disetujui (deal).', COALESCE(v_nomor, '')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_job_cek_item_penawaran ON transport.jobs;
CREATE TRIGGER trg_job_cek_item_penawaran
  BEFORE INSERT OR UPDATE OF quotation_item_id, quotation_id, status ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.job_cek_item_penawaran();

-- ── Keputusan item dikunci selama dipakai job aktif ─────────────────────────
CREATE OR REPLACE FUNCTION transport.quotation_item_cek_keputusan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF (NEW.keputusan, NEW.harga_revisi) IS NOT DISTINCT FROM (OLD.keputusan, OLD.harga_revisi) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM transport.jobs j
              WHERE j.quotation_item_id = OLD.id AND j.status = 1 AND j.status_job <> 'cancelled') THEN
    RAISE EXCEPTION 'Keputusan / harga item penawaran tidak bisa diubah karena sudah dibuat job.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_quotation_item_cek_keputusan ON transport.quotation_items;
CREATE TRIGGER trg_quotation_item_cek_keputusan
  BEFORE UPDATE OF keputusan, harga_revisi ON transport.quotation_items
  FOR EACH ROW EXECUTE FUNCTION transport.quotation_item_cek_keputusan();

-- ── Data lama ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_karyawan UUID;
  v_deal     INTEGER;
  v_tolak    INTEGER;
  v_job      INTEGER;
  v_sisa     INTEGER;
BEGIN
  SELECT p.karyawan_id INTO v_karyawan FROM transport.profiles p
   WHERE p.role = 'superadmin' AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_karyawan IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat perubahan data.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_karyawan, 'Migrasi 20260926000015');

  UPDATE transport.quotation_items it
     SET keputusan = 'deal', diputuskan_at = COALESCE(q.decided_at, now())
    FROM transport.quotations q
   WHERE q.id = it.quotation_id AND q.status_penawaran = 'deal'
     AND it.status = 1 AND it.keputusan = 'menunggu';
  GET DIAGNOSTICS v_deal = ROW_COUNT;

  UPDATE transport.quotation_items it
     SET keputusan = 'ditolak', diputuskan_at = COALESCE(q.decided_at, now()),
         alasan_ditolak = q.alasan_ditolak
    FROM transport.quotations q
   WHERE q.id = it.quotation_id AND q.status_penawaran = 'ditolak'
     AND it.status = 1 AND it.keputusan = 'menunggu';
  GET DIAGNOSTICS v_tolak = ROW_COUNT;

  UPDATE transport.jobs j
     SET quotation_item_id = it.id
    FROM transport.quotation_items it
   WHERE it.quotation_id = j.quotation_id AND it.status = 1 AND it.keputusan = 'deal'
     AND j.quotation_item_id IS NULL AND j.status = 1
     AND (SELECT count(*) FROM transport.quotation_items x
           WHERE x.quotation_id = j.quotation_id AND x.status = 1) = 1;
  GET DIAGNOSTICS v_job = ROW_COUNT;

  SELECT count(*) INTO v_sisa FROM transport.jobs
   WHERE quotation_id IS NOT NULL AND quotation_item_id IS NULL AND status = 1;

  PERFORM transport.selesai_sesi_manual();
  RAISE NOTICE E'Item deal: %\nItem ditolak: %\nJob lama terhubung ke item: %\nJob dari penawaran multi-item tanpa item (tidak diubah): %',
    v_deal, v_tolak, v_job, v_sisa;
END $$;
