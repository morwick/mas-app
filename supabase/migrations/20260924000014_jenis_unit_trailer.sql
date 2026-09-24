-- ============================================================================
-- Migration 20260924000014: master Jenis Unit Trailer (tabel sendiri)
--
-- Jenis trailer tidak lagi memakai master jenis_unit (jenis truk). Tabel baru
-- transport.jenis_unit_trailer, dan unit_trailer.jenis_unit_id diganti
-- unit_trailer.jenis_unit_trailer_id.
--
-- Aman dijalankan walau 20260924000013 sudah terlanjur dipakai: jenis yang
-- sudah dipakai trailer dipindahkan ke jenis_unit_trailer dengan nama sama.
--
-- Mengikuti aturan proyek: kolom status soft delete (default 1) + trigger,
-- log sistem, nama unik di antara baris aktif.
-- ============================================================================

SET search_path = transport, extensions;

-- ── Label log sistem ────────────────────────────────────────────────────────
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

-- Pencatat log tidak boleh menggagalkan penyimpanan hanya karena label tabel
-- belum terdaftar di _log_label(): nama tabel dipakai sebagai gantinya.
CREATE OR REPLACE FUNCTION transport.log_perubahan_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_tabel TEXT := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
  v_baru JSONB := to_jsonb(NEW);
  v_lama JSONB;
  v_aksi TEXT;
BEGIN
  -- Hanya aksi langsung pengguna (kedalaman trigger 1). Perubahan yang dipicu
  -- trigger lain dilewati — kecuali DELETE yang diubah jadi soft delete oleh
  -- soft_delete_instead() (kedalaman 2, ditandai app.log_hapus).
  IF pg_trigger_depth() > 1
     AND NOT (pg_trigger_depth() = 2 AND current_setting('app.log_hapus', true) = 'on') THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_aksi := 'Tambah Data';
  ELSE
    v_lama := to_jsonb(OLD);
    IF (v_lama ->> 'status') = '1' AND (v_baru ->> 'status') = '2' THEN
      v_aksi := 'Hapus Data';
    ELSIF (v_baru - 'updated_at' - 'last_seen_at') = (v_lama - 'updated_at' - 'last_seen_at') THEN
      RETURN NULL;  -- tidak ada isi yang berubah
    ELSE
      v_aksi := 'Update Data';
    END IF;
  END IF;

  PERFORM transport._tulis_log(
    v_aksi,
    'Data ' || btrim(COALESCE(transport._log_label(v_tabel, v_baru), TG_TABLE_NAME))
      || ' (ID ' || COALESCE(v_baru ->> 'id', '-') || ')'
      || transport._log_pelaku());
  RETURN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS transport.jenis_unit_trailer (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama        TEXT NOT NULL CONSTRAINT jenis_unit_trailer_nama_check CHECK (btrim(nama) <> ''),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      SMALLINT NOT NULL DEFAULT 1
              CONSTRAINT jenis_unit_trailer_status_aktif_check CHECK (status IN (1, 2))
);
COMMENT ON COLUMN transport.jenis_unit_trailer.status IS '1 = aktif, 2 = dihapus pengguna (soft delete, bisa dikembalikan)';

-- Unik tanpa beda huruf besar/kecil & spasi berlebih, di antara baris aktif.
CREATE UNIQUE INDEX IF NOT EXISTS jenis_unit_trailer_nama_unique
  ON transport.jenis_unit_trailer (lower(regexp_replace(btrim(nama), '\s+', ' ', 'g')))
  WHERE status = 1;

DROP TRIGGER IF EXISTS trg_jenis_unit_trailer_updated_at ON transport.jenis_unit_trailer;
CREATE TRIGGER trg_jenis_unit_trailer_updated_at BEFORE UPDATE ON transport.jenis_unit_trailer
  FOR EACH ROW EXECUTE FUNCTION transport.set_updated_at();

DROP TRIGGER IF EXISTS trg_soft_delete ON transport.jenis_unit_trailer;
CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.jenis_unit_trailer
  FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead();
DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.jenis_unit_trailer;
CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.jenis_unit_trailer
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.jenis_unit_trailer;
CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.jenis_unit_trailer
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();

DROP TRIGGER IF EXISTS trg_log_sistem ON transport.jenis_unit_trailer;
CREATE TRIGGER trg_log_sistem AFTER INSERT OR UPDATE ON transport.jenis_unit_trailer
  FOR EACH ROW EXECUTE FUNCTION transport.log_perubahan_data();

ALTER TABLE transport.jenis_unit_trailer ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON transport.jenis_unit_trailer TO authenticated;
GRANT ALL ON transport.jenis_unit_trailer TO service_role;
REVOKE ALL ON transport.jenis_unit_trailer FROM anon;

DROP POLICY IF EXISTS "admin_read_jenis_unit_trailer" ON transport.jenis_unit_trailer;
CREATE POLICY "admin_read_jenis_unit_trailer"
  ON transport.jenis_unit_trailer FOR SELECT TO authenticated
  USING (transport.is_active_admin());
DROP POLICY IF EXISTS "superadmin_insert_jenis_unit_trailer" ON transport.jenis_unit_trailer;
CREATE POLICY "superadmin_insert_jenis_unit_trailer"
  ON transport.jenis_unit_trailer FOR INSERT TO authenticated
  WITH CHECK (transport.is_superadmin());
DROP POLICY IF EXISTS "superadmin_update_jenis_unit_trailer" ON transport.jenis_unit_trailer;
CREATE POLICY "superadmin_update_jenis_unit_trailer"
  ON transport.jenis_unit_trailer FOR UPDATE TO authenticated
  USING (transport.is_superadmin())
  WITH CHECK (transport.is_superadmin());

-- ── unit_trailer: jenis_unit_id → jenis_unit_trailer_id ─────────────────────
ALTER TABLE transport.unit_trailer
  ADD COLUMN IF NOT EXISTS jenis_unit_trailer_id UUID REFERENCES transport.jenis_unit_trailer(id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'transport' AND table_name = 'unit_trailer'
                AND column_name = 'jenis_unit_id') THEN
    -- Jenis yang sudah dipakai trailer → jenis unit trailer dengan nama sama.
    INSERT INTO transport.jenis_unit_trailer (nama)
    SELECT DISTINCT ju.nama
      FROM transport.unit_trailer t
      JOIN transport.jenis_unit ju ON ju.id = t.jenis_unit_id
     WHERE NOT EXISTS (
       SELECT 1 FROM transport.jenis_unit_trailer x
        WHERE lower(btrim(x.nama)) = lower(btrim(ju.nama)) AND x.status = 1);

    UPDATE transport.unit_trailer t
       SET jenis_unit_trailer_id = x.id
      FROM transport.jenis_unit ju, transport.jenis_unit_trailer x
     WHERE ju.id = t.jenis_unit_id
       AND lower(btrim(x.nama)) = lower(btrim(ju.nama)) AND x.status = 1
       AND t.jenis_unit_trailer_id IS NULL;

    -- Policy baca lama memakai jenis_unit_id (scope jenis truk) — ganti dulu.
    DROP POLICY IF EXISTS "user_read_unit_trailer_in_scope" ON transport.unit_trailer;
    DROP INDEX IF EXISTS transport.idx_unit_trailer_jenis;
    ALTER TABLE transport.unit_trailer DROP COLUMN jenis_unit_id;
  END IF;
END $$;

ALTER TABLE transport.unit_trailer ALTER COLUMN jenis_unit_trailer_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unit_trailer_jenis_trailer
  ON transport.unit_trailer (jenis_unit_trailer_id) WHERE status = 1;

-- Jenis trailer bukan jenis truk, jadi scope operator (per jenis unit) tidak
-- berlaku: semua admin aktif boleh melihat; tulis tetap superadmin.
DROP POLICY IF EXISTS "admin_read_unit_trailer" ON transport.unit_trailer;
CREATE POLICY "admin_read_unit_trailer"
  ON transport.unit_trailer FOR SELECT TO authenticated
  USING (transport.is_active_admin());

NOTIFY pgrst, 'reload schema';
