-- ============================================================================
-- Migration 20261003000001: master Sales + sales per job
--
--   * transport.sales      — data master sales (nama, No HP).
--   * transport.jobs       — kolom baru sales_id (boleh kosong: ada job tanpa
--                            sales).
--
-- Sales dipilih / diketik di form proyek (Detail Pengiriman) dan edit job.
-- Nama yang belum ada di daftar disimpan sebagai sales baru di transaksi yang
-- sama dengan job-nya. Hanya untuk internal: portal driver & halaman publik
-- tidak membawa data sales.
--
-- BATASAN:
--   * nama sales unik (tanpa beda huruf besar/kecil & spasi tepi) di antara
--     sales aktif;
--   * job pengganti (ganti unit) otomatis memakai sales job yang digantikan.
--
-- AMAN UNTUK KODE LAMA: hanya menambah tabel, kolom nullable, trigger, dan
-- salinan `_log_label` dengan satu baris tambahan. Tidak ada perubahan data.
-- WAJIB: jalankan setelah 20261001000029. Aman dijalankan ulang.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Tabel sales ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.sales (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama        TEXT NOT NULL CONSTRAINT sales_nama_check CHECK (btrim(nama) <> ''),
  no_hp       TEXT,
  created_by  UUID REFERENCES transport.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      SMALLINT NOT NULL DEFAULT 1 CONSTRAINT sales_status_check CHECK (status IN (1, 2))
);
COMMENT ON TABLE transport.sales IS 'Master sales. Dirujuk jobs.sales_id.';
COMMENT ON COLUMN transport.sales.status IS '1 = aktif, 2 = dihapus (soft delete)';
-- BATASAN: nama sales aktif tidak boleh kembar.
CREATE UNIQUE INDEX IF NOT EXISTS sales_nama_unique
  ON transport.sales (lower(btrim(nama))) WHERE status = 1;

-- ── 2. Kolom sales di job ───────────────────────────────────────────────────
ALTER TABLE transport.jobs
  ADD COLUMN IF NOT EXISTS sales_id UUID REFERENCES transport.sales(id);
COMMENT ON COLUMN transport.jobs.sales_id IS 'Sales job ini; NULL = job tanpa sales.';
CREATE INDEX IF NOT EXISTS idx_jobs_sales ON transport.jobs (sales_id) WHERE status = 1 AND sales_id IS NOT NULL;

-- BATASAN: job pengganti (ganti unit) mewarisi sales job yang digantikan.
-- Fungsi ganti_unit_job_baru menyebut kolom satu per satu, jadi sales diisi
-- di sini tanpa mengubah fungsinya.
CREATE OR REPLACE FUNCTION transport.jobs_sales_dari_job_lama()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = transport, extensions
AS $$
BEGIN
  IF NEW.menggantikan_job_id IS NOT NULL AND NEW.sales_id IS NULL THEN
    SELECT j.sales_id INTO NEW.sales_id FROM transport.jobs j WHERE j.id = NEW.menggantikan_job_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_jobs_sales_dari_job_lama ON transport.jobs;
CREATE TRIGGER trg_jobs_sales_dari_job_lama
  BEFORE INSERT ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_sales_dari_job_lama();

-- ── 3. updated_at, soft delete, log sistem (pola sama dengan tabel lain) ────
DROP TRIGGER IF EXISTS trg_sales_updated_at ON transport.sales;
CREATE TRIGGER trg_sales_updated_at BEFORE UPDATE ON transport.sales
  FOR EACH ROW EXECUTE FUNCTION transport.set_updated_at();
DROP TRIGGER IF EXISTS trg_soft_delete ON transport.sales;
CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.sales
  FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead();
DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.sales;
CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.sales
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.sales;
CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.sales
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_log_sistem ON transport.sales;
CREATE TRIGGER trg_log_sistem AFTER INSERT OR UPDATE ON transport.sales
  FOR EACH ROW EXECUTE FUNCTION transport.log_perubahan_data();

-- ── 4. Akses: staf aktif (yang boleh membuat job) membaca & menulis ─────────
ALTER TABLE transport.sales ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON transport.sales TO authenticated;
GRANT ALL ON transport.sales TO service_role;
REVOKE ALL ON transport.sales FROM anon;
DROP POLICY IF EXISTS "staf_baca_sales" ON transport.sales;
CREATE POLICY "staf_baca_sales" ON transport.sales FOR SELECT TO authenticated
  USING (transport.is_active_admin());
DROP POLICY IF EXISTS "staf_tambah_sales" ON transport.sales;
CREATE POLICY "staf_tambah_sales" ON transport.sales FOR INSERT TO authenticated
  WITH CHECK (transport.is_active_admin());
DROP POLICY IF EXISTS "staf_ubah_sales" ON transport.sales;
CREATE POLICY "staf_ubah_sales" ON transport.sales FOR UPDATE TO authenticated
  USING (transport.is_active_admin()) WITH CHECK (transport.is_active_admin());

-- ── 5. Label log sistem: salinan definisi terkini (20261001000014) + sales ──
CREATE OR REPLACE FUNCTION transport._log_label(p_tabel TEXT, p_baris JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = transport, extensions
AS $$
  SELECT CASE p_tabel
    WHEN 'transport.customers'           THEN 'Customer '             || COALESCE(p_baris ->> 'nama_perusahaan', '')
    WHEN 'transport.drivers'             THEN 'Driver '               || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.units'               THEN 'Unit '                 || COALESCE(p_baris ->> 'kode_unit', '')
    WHEN 'transport.unit_trailer'        THEN 'Unit Trailer '         || COALESCE(p_baris ->> 'kode_trailer', '')
    WHEN 'transport.jenis_unit_trailer'  THEN 'Jenis Unit Trailer '   || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.jenis_unit'          THEN 'Jenis Unit '           || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.jobs'                THEN 'Job '                  || COALESCE(p_baris ->> 'job_number', '')
    WHEN 'transport.job_ganti_unit'      THEN 'Penggantian Job ('     || replace(COALESCE(p_baris ->> 'jenis', 'ganti_truk'), '_', ' ') || ')'
    WHEN 'transport.job_photos'          THEN 'Foto Job '             || COALESCE(p_baris ->> 'stage', '') || COALESCE(' ' || (p_baris ->> 'slot'), '')
    WHEN 'transport.incident_logs'       THEN 'Insiden '              || COALESCE(p_baris ->> 'tipe', '')
    WHEN 'transport.incident_photos'     THEN 'Foto Insiden'
    WHEN 'transport.service_records'     THEN 'Servis Unit '          || COALESCE(p_baris ->> 'jenis', '')
    WHEN 'transport.quotations'          THEN 'Penawaran '            || COALESCE(p_baris ->> 'quote_number', '')
    WHEN 'transport.invoices'            THEN 'Tagihan '              || COALESCE(p_baris ->> 'invoice_number', '')
    WHEN 'transport.invoice_payments'    THEN 'Pembayaran Tagihan Rp ' || COALESCE(p_baris ->> 'jumlah', '')
    WHEN 'transport.uang_jalan'          THEN 'Uang Jalan '           || COALESCE(p_baris ->> 'jenis', '') || ' Rp ' || COALESCE(p_baris ->> 'jumlah', '')
    WHEN 'transport.uang_jalan_requests' THEN 'Pengajuan Uang Jalan Rp ' || COALESCE(p_baris ->> 'nominal', '')
    WHEN 'transport.sumber_dana'         THEN 'Sumber Dana '          || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.profiles'            THEN 'Pengguna '             || COALESCE(p_baris ->> 'email', '')
    WHEN 'transport.penjualan_unit'      THEN 'Penjualan '            || COALESCE(p_baris ->> 'nama_pembeli', '')
    WHEN 'transport.penghapusan_aset'    THEN 'Penghapusan '          || COALESCE(p_baris ->> 'jenis_aset', '')
    WHEN 'hr.karyawan'                   THEN 'Karyawan '             || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.asuransi'                 THEN 'Asuransi '              || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.asuransi_pic'             THEN 'PIC Asuransi '          || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.asuransi_bengkel_rekanan' THEN 'Bengkel Rekanan '       || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.polis_asuransi'           THEN 'Polis Asuransi '        || COALESCE(p_baris ->> 'nomor_polis', '')
    WHEN 'transport.bengkel'                  THEN 'Bengkel '               || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.mekanik'                  THEN 'Mekanik'
    WHEN 'transport.perintah_kerja'           THEN 'Perintah Kerja '        || COALESCE(p_baris ->> 'nomor', '')
    WHEN 'transport.perintah_kerja_mekanik'   THEN 'Mekanik Perintah Kerja'
    WHEN 'transport.perintah_kerja_jasa'      THEN 'Jasa Perintah Kerja '   || COALESCE(p_baris ->> 'uraian', '')
    WHEN 'transport.perintah_kerja_sparepart' THEN 'Sparepart Perintah Kerja ' || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.perintah_kerja_biaya_lain' THEN 'Biaya Lain Perintah Kerja ' || COALESCE(p_baris ->> 'uraian', '')
    WHEN 'transport.perintah_kerja_foto'      THEN 'Foto Perintah Kerja'
    WHEN 'transport.klaim_asuransi'           THEN 'Klaim Asuransi '        || COALESCE(p_baris ->> 'nomor_klaim', '')
    WHEN 'transport.approval_fitur'           THEN 'Mode Approval '         || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.approver'                 THEN 'Approver '              || COALESCE(p_baris ->> 'fitur_kode', '')
    WHEN 'transport.proyek'                   THEN 'Proyek '                || COALESCE(p_baris ->> 'nomor_proyek', '')
    WHEN 'transport.kasbon_driver'            THEN 'Kasbon Supir Rp '       || COALESCE(p_baris ->> 'jumlah', '')
    -- Baru (20261003000001)
    WHEN 'transport.sales'                    THEN 'Sales '                 || COALESCE(p_baris ->> 'nama', '')
  END;
$$;

NOTIFY pgrst, 'reload schema';
