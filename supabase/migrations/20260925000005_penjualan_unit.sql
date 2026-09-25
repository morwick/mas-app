-- ============================================================================
-- Migration 20260925000005: Penjualan Unit & Unit Trailer
--
-- Menu baru khusus superadmin untuk mencatat transaksi penjualan sebuah unit
-- atau unit trailer (pembeli, kontak, harga, tanggal, catatan, bukti
-- dokumen). Begitu dicatat, aset berstatus "Terjual":
--   * units.status_operasional sudah punya nilai 'terjual' & seluruh
--     guard-nya sejak migration 20260924000028/000029 — tidak diubah di sini.
--   * unit_trailer.status_trailer BELUM punya 'terjual' sama sekali —
--     ditambahkan di migration ini, berikut guard yang meniru pola units
--     (tidak bisa dipakai job; tidak bisa dijual kalau masih dipakai job
--     yang belum selesai).
--
-- "Terjual" HANYA bisa dicapai lewat fungsi catat_penjualan_unit() di bawah
-- (bukan lewat endpoint ubah-status generik) — sisi Python
-- (units/service.py change_status) sudah menolak status='terjual' di situ,
-- supaya penjualan selalu tercatat dengan data pembeli & harganya.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. unit_trailer: tambah status "Terjual" ────────────────────────────────
ALTER TABLE transport.unit_trailer DROP CONSTRAINT IF EXISTS unit_trailer_status_trailer_check;
ALTER TABLE transport.unit_trailer
  ADD CONSTRAINT unit_trailer_status_trailer_check
  CHECK (status_trailer IN ('standby', 'perbaikan', 'terjual'));

CREATE OR REPLACE FUNCTION transport.jobs_cek_unit_trailer_terjual()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_kode TEXT;
BEGIN
  IF NEW.unit_trailer_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.unit_trailer_id IS NOT DISTINCT FROM OLD.unit_trailer_id THEN
    RETURN NEW;
  END IF;
  SELECT ut.kode_trailer INTO v_kode FROM transport.unit_trailer ut
   WHERE ut.id = NEW.unit_trailer_id AND ut.status_trailer = 'terjual';
  IF v_kode IS NOT NULL THEN
    RAISE EXCEPTION 'Unit trailer % sudah terjual — tidak bisa dipakai untuk job.', v_kode
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_jobs_cek_unit_trailer_terjual ON transport.jobs;
CREATE TRIGGER trg_jobs_cek_unit_trailer_terjual BEFORE INSERT OR UPDATE OF unit_trailer_id ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_cek_unit_trailer_terjual();

CREATE OR REPLACE FUNCTION transport.unit_trailer_cek_terjual()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_job TEXT;
BEGIN
  IF NEW.status_trailer <> 'terjual' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status_trailer <> 'terjual' THEN
    SELECT j.job_number INTO v_job FROM transport.jobs j
     WHERE j.unit_trailer_id = NEW.id AND j.status = 1
       AND j.status_job NOT IN ('selesai', 'cancelled')
     ORDER BY j.etd LIMIT 1;
    IF v_job IS NOT NULL THEN
      RAISE EXCEPTION 'Unit trailer % tidak bisa diubah menjadi Terjual: masih dipakai job % yang belum selesai.',
        NEW.kode_trailer, v_job USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_unit_trailer_cek_terjual ON transport.unit_trailer;
CREATE TRIGGER trg_unit_trailer_cek_terjual BEFORE INSERT OR UPDATE OF status_trailer ON transport.unit_trailer
  FOR EACH ROW EXECUTE FUNCTION transport.unit_trailer_cek_terjual();

-- ── 2. Tabel penjualan_unit ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.penjualan_unit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis_aset        TEXT NOT NULL
                    CONSTRAINT penjualan_unit_jenis_aset_check CHECK (jenis_aset IN ('unit', 'unit_trailer')),
  unit_id           UUID REFERENCES transport.units(id),
  unit_trailer_id   UUID REFERENCES transport.unit_trailer(id),
  nama_pembeli      TEXT NOT NULL CONSTRAINT penjualan_unit_nama_pembeli_check CHECK (btrim(nama_pembeli) <> ''),
  kontak_pembeli    TEXT,
  harga_jual        BIGINT NOT NULL CONSTRAINT penjualan_unit_harga_check CHECK (harga_jual > 0),
  tanggal_jual      DATE NOT NULL,
  catatan           TEXT,
  bukti_path        TEXT,
  bukti_uploaded_at TIMESTAMPTZ,
  created_by        UUID REFERENCES transport.profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  status            SMALLINT NOT NULL DEFAULT 1 CONSTRAINT penjualan_unit_status_check CHECK (status IN (1, 2)),
  CONSTRAINT penjualan_unit_aset_check CHECK (
    (jenis_aset = 'unit' AND unit_id IS NOT NULL AND unit_trailer_id IS NULL) OR
    (jenis_aset = 'unit_trailer' AND unit_trailer_id IS NOT NULL AND unit_id IS NULL)
  )
);
COMMENT ON COLUMN transport.penjualan_unit.status IS '1 = aktif, 2 = dibatalkan (soft delete, bisa dikembalikan)';

CREATE UNIQUE INDEX IF NOT EXISTS penjualan_unit_unit_unique
  ON transport.penjualan_unit (unit_id) WHERE status = 1 AND unit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS penjualan_unit_unit_trailer_unique
  ON transport.penjualan_unit (unit_trailer_id) WHERE status = 1 AND unit_trailer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_penjualan_unit_tanggal ON transport.penjualan_unit (tanggal_jual DESC) WHERE status = 1;

DROP TRIGGER IF EXISTS trg_penjualan_unit_updated_at ON transport.penjualan_unit;
CREATE TRIGGER trg_penjualan_unit_updated_at BEFORE UPDATE ON transport.penjualan_unit
  FOR EACH ROW EXECUTE FUNCTION transport.set_updated_at();

-- Soft delete (migration 20260924000007).
DROP TRIGGER IF EXISTS trg_soft_delete ON transport.penjualan_unit;
CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.penjualan_unit
  FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead();
DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.penjualan_unit;
CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.penjualan_unit
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.penjualan_unit;
CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.penjualan_unit
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();

-- Log sistem (migration 20260924000009).
DROP TRIGGER IF EXISTS trg_log_sistem ON transport.penjualan_unit;
CREATE TRIGGER trg_log_sistem AFTER INSERT OR UPDATE ON transport.penjualan_unit
  FOR EACH ROW EXECUTE FUNCTION transport.log_perubahan_data();

-- Label log sistem: salinan definisi terkini (20260924000022) + baris baru.
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
    WHEN 'transport.job_ganti_unit'      THEN 'Ganti Truk Job'
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
    WHEN 'hr.karyawan'                   THEN 'Karyawan '             || COALESCE(p_baris ->> 'nama', '')
  END;
$$;

-- ── Akses: superadmin saja (baca & tulis) ────────────────────────────────────
ALTER TABLE transport.penjualan_unit ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON transport.penjualan_unit TO authenticated;
GRANT ALL ON transport.penjualan_unit TO service_role;
REVOKE ALL ON transport.penjualan_unit FROM anon;

DROP POLICY IF EXISTS "superadmin_all_penjualan_unit" ON transport.penjualan_unit;
CREATE POLICY "superadmin_all_penjualan_unit"
  ON transport.penjualan_unit FOR ALL TO authenticated
  USING (transport.is_superadmin())
  WITH CHECK (transport.is_superadmin());

-- ── 3. Aksi: catat & batalkan penjualan (SECURITY DEFINER, satu transaksi) ──
CREATE OR REPLACE FUNCTION transport.catat_penjualan_unit(
  p_jenis_aset      TEXT,
  p_asset_id        UUID,
  p_nama_pembeli    TEXT,
  p_kontak_pembeli  TEXT,
  p_harga_jual      BIGINT,
  p_tanggal_jual    DATE,
  p_catatan         TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_id   UUID;
  v_kode TEXT;
  v_job  TEXT;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Butuh login superadmin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_jenis_aset NOT IN ('unit', 'unit_trailer') THEN
    RAISE EXCEPTION 'Jenis aset tidak valid.' USING ERRCODE = 'check_violation';
  END IF;
  IF btrim(COALESCE(p_nama_pembeli, '')) = '' THEN
    RAISE EXCEPTION 'Nama pembeli wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_harga_jual IS NULL OR p_harga_jual <= 0 THEN
    RAISE EXCEPTION 'Harga jual wajib diisi & lebih dari 0.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tanggal_jual IS NULL THEN
    RAISE EXCEPTION 'Tanggal jual wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_jenis_aset = 'unit' THEN
    SELECT kode_unit INTO v_kode FROM transport.units WHERE id = p_asset_id AND status = 1 FOR UPDATE;
    IF v_kode IS NULL THEN
      RAISE EXCEPTION 'Unit tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;
    SELECT j.job_number INTO v_job FROM transport.jobs j
     WHERE j.unit_id = p_asset_id AND j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled')
     ORDER BY j.etd LIMIT 1;
    IF v_job IS NOT NULL THEN
      RAISE EXCEPTION 'Unit % masih dipakai job % yang belum selesai.', v_kode, v_job USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM transport.penjualan_unit WHERE unit_id = p_asset_id AND status = 1) THEN
      RAISE EXCEPTION 'Unit % sudah tercatat terjual.', v_kode USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT kode_trailer INTO v_kode FROM transport.unit_trailer WHERE id = p_asset_id AND status = 1 FOR UPDATE;
    IF v_kode IS NULL THEN
      RAISE EXCEPTION 'Unit trailer tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;
    SELECT j.job_number INTO v_job FROM transport.jobs j
     WHERE j.unit_trailer_id = p_asset_id AND j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled')
     ORDER BY j.etd LIMIT 1;
    IF v_job IS NOT NULL THEN
      RAISE EXCEPTION 'Unit trailer % masih dipakai job % yang belum selesai.', v_kode, v_job USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM transport.penjualan_unit WHERE unit_trailer_id = p_asset_id AND status = 1) THEN
      RAISE EXCEPTION 'Unit trailer % sudah tercatat terjual.', v_kode USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO transport.penjualan_unit (
    jenis_aset, unit_id, unit_trailer_id, nama_pembeli, kontak_pembeli,
    harga_jual, tanggal_jual, catatan, created_by)
  VALUES (
    p_jenis_aset,
    CASE WHEN p_jenis_aset = 'unit' THEN p_asset_id END,
    CASE WHEN p_jenis_aset = 'unit_trailer' THEN p_asset_id END,
    btrim(p_nama_pembeli), NULLIF(btrim(COALESCE(p_kontak_pembeli, '')), ''),
    p_harga_jual, p_tanggal_jual, NULLIF(btrim(COALESCE(p_catatan, '')), ''), auth.uid())
  RETURNING id INTO v_id;

  IF p_jenis_aset = 'unit' THEN
    UPDATE transport.units SET status_operasional = 'terjual', updated_at = now() WHERE id = p_asset_id;
  ELSE
    UPDATE transport.unit_trailer SET status_trailer = 'terjual', updated_at = now() WHERE id = p_asset_id;
  END IF;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION transport.catat_penjualan_unit(TEXT, UUID, TEXT, TEXT, BIGINT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.catat_penjualan_unit(TEXT, UUID, TEXT, TEXT, BIGINT, DATE, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION transport.batalkan_penjualan_unit(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_row transport.penjualan_unit%ROWTYPE;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Butuh login superadmin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_row FROM transport.penjualan_unit WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Catatan penjualan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE transport.penjualan_unit SET status = 2, updated_at = now() WHERE id = p_id;

  IF v_row.jenis_aset = 'unit' THEN
    UPDATE transport.units SET status_operasional = 'standby', updated_at = now()
     WHERE id = v_row.unit_id AND status_operasional = 'terjual';
  ELSE
    UPDATE transport.unit_trailer SET status_trailer = 'standby', updated_at = now()
     WHERE id = v_row.unit_trailer_id AND status_trailer = 'terjual';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION transport.batalkan_penjualan_unit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.batalkan_penjualan_unit(UUID) TO authenticated;

-- ── 4. Bucket dokumen bukti (privat, pola sama seperti faktur-pajak) ────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bukti-penjualan', 'bukti-penjualan', false, 10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "admins_all_bukti_penjualan" ON storage.objects;
CREATE POLICY "admins_all_bukti_penjualan"
  ON storage.objects FOR ALL
  USING (bucket_id = 'bukti-penjualan' AND transport.storage_is_active_admin())
  WITH CHECK (bucket_id = 'bukti-penjualan' AND transport.storage_is_active_admin());

NOTIFY pgrst, 'reload schema';
