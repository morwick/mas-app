-- ============================================================================
-- Migration 20261003000010: potongan PPh 23 di tagihan
--
-- Perusahaan memberikan jasa, jadi customer (pemotong pajak) memotong PPh 23
-- dari tagihan. Di tagihan potongan ini tampil sebagai pengurang (minus).
--
-- Kolom baru di transport.invoices:
--   * pph23_aktif   — default false (tagihan lama tidak berubah);
--   * pph23_persen  — default 2 (%), 0–100;
--   * pph23_nominal — diisi sistem.
--
-- BATASAN:
--   * PPh 23 dihitung dari subtotal (DPP, di luar PPN):
--       pph23_nominal = ROUND(subtotal × pph23_persen / 100)
--       total         = subtotal + ppn_nominal − pph23_nominal
--     `total` = yang benar-benar dibayar customer, jadi status lunas & sisa
--     tagihan otomatis memperhitungkan potongannya.
--   * Kolom PPh 23 ikut terkunci bila tagihan sudah ada pembayaran / faktur
--     pajak (sama dengan PPN).
--
-- Perubahan data: hanya kolom baru dengan nilai default (pph23_aktif = false
-- → total tagihan lama tidak berubah).
-- WAJIB: jalankan setelah 20261003000009. Naikkan backend & frontend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Kolom ────────────────────────────────────────────────────────────────
ALTER TABLE transport.invoices ADD COLUMN IF NOT EXISTS pph23_aktif   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE transport.invoices ADD COLUMN IF NOT EXISTS pph23_persen  NUMERIC(5,2) NOT NULL DEFAULT 2;
ALTER TABLE transport.invoices ADD COLUMN IF NOT EXISTS pph23_nominal BIGINT NOT NULL DEFAULT 0;
ALTER TABLE transport.invoices DROP CONSTRAINT IF EXISTS invoices_pph23_persen_check;
ALTER TABLE transport.invoices ADD CONSTRAINT invoices_pph23_persen_check
  CHECK (pph23_persen >= 0 AND pph23_persen <= 100);
COMMENT ON COLUMN transport.invoices.pph23_aktif IS 'Potong PPh 23 dari tagihan (perusahaan sebagai pemberi jasa).';
COMMENT ON COLUMN transport.invoices.pph23_nominal IS 'ROUND(subtotal × pph23_persen / 100); mengurangi total. Diisi sistem.';

-- ── 2. Hitung ulang total: subtotal + PPN − PPh 23 ──────────────────────────
CREATE OR REPLACE FUNCTION transport.recalc_invoice_totals(p_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_subtotal     BIGINT;
  v_ppn_aktif    BOOLEAN;
  v_ppn_persen   NUMERIC(5,2);
  v_pph23_aktif  BOOLEAN;
  v_pph23_persen NUMERIC(5,2);
  v_ppn          BIGINT;
  v_pph23        BIGINT;
BEGIN
  SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
  FROM invoice_items WHERE invoice_id = p_invoice_id AND status = 1;

  SELECT ppn_aktif, ppn_persen, pph23_aktif, pph23_persen
    INTO v_ppn_aktif, v_ppn_persen, v_pph23_aktif, v_pph23_persen
  FROM invoices WHERE id = p_invoice_id AND status = 1;

  v_ppn   := CASE WHEN v_ppn_aktif   THEN ROUND(v_subtotal * v_ppn_persen / 100.0)   ELSE 0 END;
  -- BATASAN: PPh 23 dari DPP (subtotal), bukan dari subtotal + PPN.
  v_pph23 := CASE WHEN v_pph23_aktif THEN ROUND(v_subtotal * v_pph23_persen / 100.0) ELSE 0 END;

  UPDATE invoices
     SET subtotal      = v_subtotal,
         ppn_nominal   = v_ppn,
         pph23_nominal = v_pph23,
         total         = v_subtotal + v_ppn - v_pph23,
         updated_at    = now()
   WHERE id = p_invoice_id AND status = 1;

  -- Total berubah bisa mengubah status lunas (misal item ditambah setelah
  -- pembayaran masuk), jadi status dihitung ulang di sini juga.
  PERFORM recalc_invoice_payment_state(p_invoice_id);
END;
$function$;

-- Ubah PPN / PPh 23 di header → hitung ulang total.
CREATE OR REPLACE FUNCTION transport.trg_recalc_invoice_on_ppn_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF (NEW.ppn_aktif, NEW.ppn_persen, NEW.pph23_aktif, NEW.pph23_persen)
     IS DISTINCT FROM (OLD.ppn_aktif, OLD.ppn_persen, OLD.pph23_aktif, OLD.pph23_persen) THEN
    PERFORM transport.recalc_invoice_totals(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_invoices_ppn_recalc ON transport.invoices;
CREATE TRIGGER trg_invoices_ppn_recalc
  AFTER UPDATE OF ppn_aktif, ppn_persen, pph23_aktif, pph23_persen ON transport.invoices
  FOR EACH ROW EXECUTE FUNCTION transport.trg_recalc_invoice_on_ppn_change();

-- ── 3. Kuncian header: PPh 23 ikut terkunci (salinan 20260926000014 + PPh 23) ─
CREATE OR REPLACE FUNCTION transport.invoice_cek_terkunci()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_alasan TEXT := transport._invoice_terkunci(OLD);
BEGIN
  IF v_alasan IS NULL OR OLD.status <> 1 THEN
    RETURN NEW;
  END IF;
  -- Dihapus (soft delete).
  IF NEW.status <> 1 THEN
    RAISE EXCEPTION '%', v_alasan USING ERRCODE = 'check_violation';
  END IF;
  -- Isi tagihan diedit.
  IF (NEW.customer_id, NEW.quotation_id, NEW.pic_sapaan, NEW.pic_nama, NEW.kota_terbit, NEW.tanggal,
      NEW.termin_hari, NEW.jatuh_tempo, NEW.ppn_aktif, NEW.ppn_persen, NEW.pph23_aktif, NEW.pph23_persen,
      NEW.ttd_nama, NEW.ttd_jabatan, NEW.bank_nama, NEW.bank_rekening, NEW.bank_atas_nama, NEW.catatan)
     IS DISTINCT FROM
     (OLD.customer_id, OLD.quotation_id, OLD.pic_sapaan, OLD.pic_nama, OLD.kota_terbit, OLD.tanggal,
      OLD.termin_hari, OLD.jatuh_tempo, OLD.ppn_aktif, OLD.ppn_persen, OLD.pph23_aktif, OLD.pph23_persen,
      OLD.ttd_nama, OLD.ttd_jabatan, OLD.bank_nama, OLD.bank_rekening, OLD.bank_atas_nama, OLD.catatan) THEN
    RAISE EXCEPTION '%', v_alasan USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
