-- ============================================================================
-- Migration 20260926000014: tagihan yang sudah ada pembayaran / faktur pajak
-- tidak boleh diedit & dihapus
--
-- Dijaga di database (bukan cuma tombol & backend):
--   * Tagihan dengan pembayaran aktif (dibayar > 0) atau faktur pajak
--     (faktur_pajak_path terisi) tidak bisa dihapus (soft delete status → 2).
--   * Rinciannya (invoice_items) tidak bisa ditambah, diubah, atau dihapus.
--   * Isi header tagihan (customer, tanggal, termin, PPN, TTD, bank, catatan…)
--     tidak bisa diubah. Kolom yang diisi sistem tetap boleh berubah:
--     dibayar / status_tagihan / lunas_at (hitung ulang pembayaran), total
--     (hitung ulang rincian), sent_at, alasan_batal, faktur pajak, updated_at.
-- Perubahan data: tidak ada.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport._invoice_terkunci(p_invoice transport.invoices)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  SELECT CASE
    WHEN COALESCE(p_invoice.dibayar, 0) > 0 THEN
      format('Tagihan %s sudah ada pembayarannya sehingga tidak bisa diedit atau dihapus.', p_invoice.invoice_number)
    WHEN p_invoice.faktur_pajak_path IS NOT NULL THEN
      format('Tagihan %s sudah ada faktur pajaknya sehingga tidak bisa diedit atau dihapus.', p_invoice.invoice_number)
  END;
$$;
REVOKE ALL ON FUNCTION transport._invoice_terkunci(transport.invoices) FROM PUBLIC, anon, authenticated;

-- ── Header tagihan ──────────────────────────────────────────────────────────
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
      NEW.termin_hari, NEW.jatuh_tempo, NEW.ppn_aktif, NEW.ppn_persen, NEW.ttd_nama, NEW.ttd_jabatan,
      NEW.bank_nama, NEW.bank_rekening, NEW.bank_atas_nama, NEW.catatan)
     IS DISTINCT FROM
     (OLD.customer_id, OLD.quotation_id, OLD.pic_sapaan, OLD.pic_nama, OLD.kota_terbit, OLD.tanggal,
      OLD.termin_hari, OLD.jatuh_tempo, OLD.ppn_aktif, OLD.ppn_persen, OLD.ttd_nama, OLD.ttd_jabatan,
      OLD.bank_nama, OLD.bank_rekening, OLD.bank_atas_nama, OLD.catatan) THEN
    RAISE EXCEPTION '%', v_alasan USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_invoice_cek_terkunci ON transport.invoices;
CREATE TRIGGER trg_invoice_cek_terkunci
  BEFORE UPDATE ON transport.invoices
  FOR EACH ROW EXECUTE FUNCTION transport.invoice_cek_terkunci();

-- ── Rincian tagihan ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.invoice_item_cek_terkunci()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_inv    transport.invoices%ROWTYPE;
  v_alasan TEXT;
BEGIN
  SELECT * INTO v_inv FROM transport.invoices
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
  IF v_inv.id IS NULL OR v_inv.status <> 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_alasan := transport._invoice_terkunci(v_inv);
  IF v_alasan IS NOT NULL THEN
    RAISE EXCEPTION '%', v_alasan USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_invoice_item_cek_terkunci ON transport.invoice_items;
CREATE TRIGGER trg_invoice_item_cek_terkunci
  BEFORE INSERT OR UPDATE OR DELETE ON transport.invoice_items
  FOR EACH ROW EXECUTE FUNCTION transport.invoice_item_cek_terkunci();
