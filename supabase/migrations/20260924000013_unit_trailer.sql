-- ============================================================================
-- Migration 20260924000013: master Unit Trailer
--
-- Kolom: kode trailer (wajib & unik), tahun, jenis trailer (memakai master
-- jenis_unit: Lowbed, Highbed, ...), kapasitas muatan (ton), dan status
-- trailer (standby / terpakai / perbaikan) untuk filter.
--
-- Mengikuti aturan proyek:
--   * kolom `status` soft delete (1 = aktif, 2 = dihapus) + trigger soft delete;
--   * tambah/ubah/hapus tercatat di log sistem (trg_log_sistem);
--   * kode trailer unik di antara baris aktif (tanpa beda huruf besar/kecil).
-- Akses sama dengan Unit: baca sesuai scope jenis unit, tulis superadmin.
-- ============================================================================

SET search_path = transport, extensions;

CREATE TABLE IF NOT EXISTS transport.unit_trailer (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_trailer    TEXT NOT NULL CONSTRAINT unit_trailer_kode_check CHECK (btrim(kode_trailer) <> ''),
  tahun           INTEGER CONSTRAINT unit_trailer_tahun_check CHECK (tahun BETWEEN 1950 AND 2100),
  jenis_unit_id   UUID NOT NULL REFERENCES transport.jenis_unit(id),
  kapasitas_ton   NUMERIC(8, 2) CONSTRAINT unit_trailer_kapasitas_check CHECK (kapasitas_ton > 0),
  status_trailer  TEXT NOT NULL DEFAULT 'standby'
                  CONSTRAINT unit_trailer_status_trailer_check
                  CHECK (status_trailer IN ('standby', 'terpakai', 'perbaikan')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          SMALLINT NOT NULL DEFAULT 1
                  CONSTRAINT unit_trailer_status_aktif_check CHECK (status IN (1, 2))
);
COMMENT ON COLUMN transport.unit_trailer.status IS '1 = aktif, 2 = dihapus pengguna (soft delete, bisa dikembalikan)';
COMMENT ON COLUMN transport.unit_trailer.status_trailer IS 'Kondisi trailer: standby / terpakai / perbaikan';

CREATE UNIQUE INDEX IF NOT EXISTS unit_trailer_kode_unique
  ON transport.unit_trailer (lower(btrim(kode_trailer))) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_unit_trailer_jenis  ON transport.unit_trailer (jenis_unit_id) WHERE status = 1;
CREATE INDEX IF NOT EXISTS idx_unit_trailer_status ON transport.unit_trailer (status_trailer) WHERE status = 1;

DROP TRIGGER IF EXISTS trg_unit_trailer_updated_at ON transport.unit_trailer;
CREATE TRIGGER trg_unit_trailer_updated_at BEFORE UPDATE ON transport.unit_trailer
  FOR EACH ROW EXECUTE FUNCTION transport.set_updated_at();

-- Soft delete (migration 20260924000007).
DROP TRIGGER IF EXISTS trg_soft_delete ON transport.unit_trailer;
CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.unit_trailer
  FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead();
DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.unit_trailer;
CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.unit_trailer
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.unit_trailer;
CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.unit_trailer
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();

-- Log sistem (migration 20260924000009).
DROP TRIGGER IF EXISTS trg_log_sistem ON transport.unit_trailer;
CREATE TRIGGER trg_log_sistem AFTER INSERT OR UPDATE ON transport.unit_trailer
  FOR EACH ROW EXECUTE FUNCTION transport.log_perubahan_data();

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
    WHEN 'transport.jenis_unit'          THEN 'Jenis Unit '           || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.jobs'                THEN 'Job '                  || COALESCE(p_baris ->> 'job_number', '')
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
    WHEN 'hr.karyawan'                   THEN 'Karyawan '             || COALESCE(p_baris ->> 'nama', '')
  END;
$$;

-- ── Akses ───────────────────────────────────────────────────────────────────
ALTER TABLE transport.unit_trailer ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON transport.unit_trailer TO authenticated;
GRANT ALL ON transport.unit_trailer TO service_role;
REVOKE ALL ON transport.unit_trailer FROM anon;

DROP POLICY IF EXISTS "user_read_unit_trailer_in_scope" ON transport.unit_trailer;
CREATE POLICY "user_read_unit_trailer_in_scope"
  ON transport.unit_trailer FOR SELECT TO authenticated
  USING (transport.is_active_admin()
         AND (transport.is_superadmin()
              OR jenis_unit_id = ANY (COALESCE(transport.current_user_jenis_scope(), ARRAY[]::UUID[]))));

DROP POLICY IF EXISTS "superadmin_insert_unit_trailer" ON transport.unit_trailer;
CREATE POLICY "superadmin_insert_unit_trailer"
  ON transport.unit_trailer FOR INSERT TO authenticated
  WITH CHECK (transport.is_superadmin());

-- Ubah & hapus (soft delete = UPDATE status = 2) hanya superadmin.
DROP POLICY IF EXISTS "superadmin_update_unit_trailer" ON transport.unit_trailer;
CREATE POLICY "superadmin_update_unit_trailer"
  ON transport.unit_trailer FOR UPDATE TO authenticated
  USING (transport.is_superadmin())
  WITH CHECK (transport.is_superadmin());

NOTIFY pgrst, 'reload schema';
