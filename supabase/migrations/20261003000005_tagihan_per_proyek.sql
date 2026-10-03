-- ============================================================================
-- Migration 20261003000005: rincian tagihan per proyek
--
-- Rincian tagihan sekarang ditulis per proyek: satu baris berisi teks bebas
-- (yang tercetak di invoice) dan nominal yang ditagihkan. Job-job proyek
-- tetap tercatat satu baris per job di invoice_items — nominal proyek dibagi
-- rata ke job-jobnya oleh backend — supaya semua kuncian yang sudah ada
-- (satu job satu tagihan, satu proyek satu tagihan, job harus tervalidasi,
-- tagihan terkunci) dan pendapatan per job (get_job_profitability) tetap
-- berjalan tanpa diubah.
--
-- BATASAN:
--   1. Satu proyek hanya satu baris aktif per tagihan (unique partial index).
--   2. Nominal tidak boleh negatif.
--   3. Tagihan terkunci (sudah ada pembayaran / faktur pajak) → baris proyek
--      tidak bisa ditambah, diubah, atau dihapus (pakai fungsi yang sama
--      dengan invoice_items).
--
-- Perubahan data: tidak ada. Tagihan lama tanpa baris proyek tetap tampil
-- per job seperti sebelumnya.
-- ============================================================================

SET search_path = transport, extensions;

CREATE TABLE IF NOT EXISTS transport.invoice_proyek (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES transport.invoices(id) ON DELETE CASCADE,
  proyek_id   UUID NOT NULL REFERENCES transport.proyek(id),
  urutan      INT NOT NULL DEFAULT 0,
  uraian      TEXT NOT NULL,
  nominal     BIGINT NOT NULL DEFAULT 0 CHECK (nominal >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      SMALLINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_invoice_proyek_parent
  ON transport.invoice_proyek (invoice_id, urutan) WHERE status = 1;
-- BATASAN 1
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_proyek_aktif
  ON transport.invoice_proyek (invoice_id, proyek_id) WHERE status = 1;

-- BATASAN 3
DROP TRIGGER IF EXISTS trg_invoice_proyek_cek_terkunci ON transport.invoice_proyek;
CREATE TRIGGER trg_invoice_proyek_cek_terkunci
  BEFORE INSERT OR UPDATE OR DELETE ON transport.invoice_proyek
  FOR EACH ROW EXECUTE FUNCTION transport.invoice_item_cek_terkunci();

-- Soft delete (pola 20260924000007).
DROP TRIGGER IF EXISTS trg_soft_delete ON transport.invoice_proyek;
CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.invoice_proyek
  FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead();
DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.invoice_proyek;
CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.invoice_proyek
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.invoice_proyek;
CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.invoice_proyek
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();

-- Akses sama seperti invoice_items: semua admin aktif.
ALTER TABLE transport.invoice_proyek ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON transport.invoice_proyek TO authenticated;
GRANT ALL ON transport.invoice_proyek TO service_role;
REVOKE ALL ON transport.invoice_proyek FROM anon;
DROP POLICY IF EXISTS "admin_all_invoice_proyek" ON transport.invoice_proyek;
CREATE POLICY "admin_all_invoice_proyek" ON transport.invoice_proyek FOR ALL TO authenticated
  USING (transport.is_active_admin()) WITH CHECK (transport.is_active_admin());

NOTIFY pgrst, 'reload schema';
