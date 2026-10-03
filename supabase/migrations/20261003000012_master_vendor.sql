-- ============================================================================
-- Migration 20261003000012: master Vendor
--
-- Menu Master Data → Vendor (di bawah Customer). Untuk sementara strukturnya
-- disamakan dengan customer (permintaan user, akan dirombak sesuai kebutuhan):
-- nama perusahaan, alamat, kota, NPWP, NIB, PKP, termin, PIC, catatan, aktif.
--
-- Akses sama dengan customers: semua staf aktif membaca; tambah/ubah/hapus
-- superadmin & admin.
--
-- AMAN UNTUK KODE LAMA: hanya menambah tabel, trigger, dan salinan
-- `_log_label` dengan satu baris tambahan. Tidak ada perubahan data.
-- WAJIB: jalankan setelah 20261003000011. Aman dijalankan ulang.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Tabel ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.vendors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_perusahaan  TEXT NOT NULL CONSTRAINT vendors_nama_check CHECK (btrim(nama_perusahaan) <> ''),
  alamat           TEXT,
  catatan          TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  kota             TEXT,
  npwp             TEXT,
  nib              TEXT,
  status_pkp       BOOLEAN NOT NULL DEFAULT false,
  termin_hari      INTEGER CONSTRAINT vendors_termin_check CHECK (termin_hari IS NULL OR termin_hari >= 0),
  pic_sapaan       TEXT CONSTRAINT vendors_pic_sapaan_check CHECK (pic_sapaan IS NULL OR pic_sapaan IN ('Bapak', 'Ibu')),
  pic_nama         TEXT,
  pic_jabatan      TEXT,
  pic_no_hp        TEXT,
  pic_email        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           SMALLINT NOT NULL DEFAULT 1 CONSTRAINT vendors_status_check CHECK (status IN (1, 2))
);
COMMENT ON TABLE transport.vendors IS 'Master vendor (sementara disamakan dengan customers).';
COMMENT ON COLUMN transport.vendors.status IS '1 = aktif, 2 = dihapus (soft delete)';
CREATE INDEX IF NOT EXISTS idx_vendors_aktif ON transport.vendors (is_active) WHERE status = 1;

-- ── 2. updated_at, soft delete, log sistem (pola sama dengan tabel lain) ────
DROP TRIGGER IF EXISTS trg_vendors_updated_at ON transport.vendors;
CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON transport.vendors
  FOR EACH ROW EXECUTE FUNCTION transport.set_updated_at();
DROP TRIGGER IF EXISTS trg_soft_delete ON transport.vendors;
CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.vendors
  FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead();
DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.vendors;
CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.vendors
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.vendors;
CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.vendors
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_log_sistem ON transport.vendors;
CREATE TRIGGER trg_log_sistem AFTER INSERT OR UPDATE ON transport.vendors
  FOR EACH ROW EXECUTE FUNCTION transport.log_perubahan_data();

-- ── 3. Akses (sama dengan customers) ────────────────────────────────────────
ALTER TABLE transport.vendors ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON transport.vendors TO authenticated;
GRANT ALL ON transport.vendors TO service_role;
REVOKE ALL ON transport.vendors FROM anon;
DROP POLICY IF EXISTS "staf_baca_vendors" ON transport.vendors;
CREATE POLICY "staf_baca_vendors" ON transport.vendors FOR SELECT TO authenticated
  USING (transport.is_active_admin());
DROP POLICY IF EXISTS "admin_tambah_vendors" ON transport.vendors;
CREATE POLICY "admin_tambah_vendors" ON transport.vendors FOR INSERT TO authenticated
  WITH CHECK (transport.is_superadmin() OR transport.is_admin());
DROP POLICY IF EXISTS "admin_ubah_vendors" ON transport.vendors;
CREATE POLICY "admin_ubah_vendors" ON transport.vendors FOR UPDATE TO authenticated
  USING (transport.is_superadmin() OR transport.is_admin())
  WITH CHECK (transport.is_superadmin() OR transport.is_admin());

-- ── 4. Label log sistem: salinan definisi terkini (20261003000009) + vendor ─
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
    WHEN 'transport.sales'                    THEN 'Sales '                 || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.jenis_biaya'              THEN 'Jenis Biaya '           || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.biaya_lain'               THEN 'Biaya Lain Job Rp '     || COALESCE(p_baris ->> 'nominal', '')
    -- Baru (20261003000012)
    WHEN 'transport.vendors'                  THEN 'Vendor '                || COALESCE(p_baris ->> 'nama_perusahaan', '')
  END;
$$;

NOTIFY pgrst, 'reload schema';
