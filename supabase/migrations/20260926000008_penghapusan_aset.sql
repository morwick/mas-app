-- ============================================================================
-- Migration 20260926000008: menu Penghapusan Unit & Unit Trailer
--
-- Satu-satunya jalan menandai unit / unit trailer "Diafkirkan" — tercatat
-- dengan tanggal, alasan, catatan, dan bukti (berita acara). Polanya sama
-- dengan Penjualan Unit (superadmin saja, satu fungsi = satu transaksi):
--   * catat_penghapusan_aset(): aset semua status kecuali Terjual / Diafkirkan.
--     Aset yang sedang Bertugas (dipakai job yang belum selesai) ditolak —
--     selesaikan / batalkan job-nya dulu. Aset jadi Diafkirkan dan insiden
--     yang masih terbuka ditutup "Selesai (diafkirkan)".
--   * batalkan_penghapusan_aset(): alasan wajib; aset kembali Standby dan
--     insiden tadi dibuka lagi ke Open / Dalam penanganan sesuai pilihan
--     (status aset lalu mengikuti insiden: Breakdown / Perbaikan).
-- Tombol "Ubah status" di detail unit / unit trailer dihapus, sehingga
-- afkirkan_aset() & kembalikan_aset_dari_afkir() (migration 000006) tidak
-- dipakai lagi dan di-DROP.
-- WAJIB: jalankan setelah 20260926000007. Naikkan backend & frontend bersamaan.
-- Perubahan data: tidak ada.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Tabel penghapusan_aset ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transport.penghapusan_aset (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis_aset          TEXT NOT NULL
                      CONSTRAINT penghapusan_aset_jenis_check CHECK (jenis_aset IN ('unit', 'unit_trailer')),
  unit_id             UUID REFERENCES transport.units(id),
  unit_trailer_id     UUID REFERENCES transport.unit_trailer(id),
  tanggal_hapus       DATE NOT NULL,
  alasan              TEXT NOT NULL CONSTRAINT penghapusan_aset_alasan_check CHECK (btrim(alasan) <> ''),
  catatan             TEXT,
  status_aset_sebelum TEXT,
  bukti_path          TEXT,
  bukti_uploaded_at   TIMESTAMPTZ,
  alasan_batal        TEXT,
  created_by          UUID REFERENCES transport.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  status              SMALLINT NOT NULL DEFAULT 1
                      CONSTRAINT penghapusan_aset_status_check CHECK (status IN (1, 2)),
  CONSTRAINT penghapusan_aset_aset_check CHECK (
    (jenis_aset = 'unit' AND unit_id IS NOT NULL AND unit_trailer_id IS NULL) OR
    (jenis_aset = 'unit_trailer' AND unit_trailer_id IS NOT NULL AND unit_id IS NULL)
  )
);
COMMENT ON COLUMN transport.penghapusan_aset.status IS '1 = aktif, 2 = dibatalkan (soft delete)';

CREATE UNIQUE INDEX IF NOT EXISTS penghapusan_aset_unit_unique
  ON transport.penghapusan_aset (unit_id) WHERE status = 1 AND unit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS penghapusan_aset_unit_trailer_unique
  ON transport.penghapusan_aset (unit_trailer_id) WHERE status = 1 AND unit_trailer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_penghapusan_aset_tanggal
  ON transport.penghapusan_aset (tanggal_hapus DESC) WHERE status = 1;

DROP TRIGGER IF EXISTS trg_penghapusan_aset_updated_at ON transport.penghapusan_aset;
CREATE TRIGGER trg_penghapusan_aset_updated_at BEFORE UPDATE ON transport.penghapusan_aset
  FOR EACH ROW EXECUTE FUNCTION transport.set_updated_at();

-- Soft delete (migration 20260924000007).
DROP TRIGGER IF EXISTS trg_soft_delete ON transport.penghapusan_aset;
CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.penghapusan_aset
  FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead();
DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.penghapusan_aset;
CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.penghapusan_aset
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.penghapusan_aset;
CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.penghapusan_aset
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();

-- Log sistem (migration 20260924000009).
DROP TRIGGER IF EXISTS trg_log_sistem ON transport.penghapusan_aset;
CREATE TRIGGER trg_log_sistem AFTER INSERT OR UPDATE ON transport.penghapusan_aset
  FOR EACH ROW EXECUTE FUNCTION transport.log_perubahan_data();

-- Label log sistem: salinan definisi terkini (20260925000005) + baris baru.
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
    WHEN 'transport.penghapusan_aset'    THEN 'Penghapusan '          || COALESCE(p_baris ->> 'jenis_aset', '')
    WHEN 'hr.karyawan'                   THEN 'Karyawan '             || COALESCE(p_baris ->> 'nama', '')
  END;
$$;

-- ── 2. Akses: superadmin saja (baca & tulis) ────────────────────────────────
ALTER TABLE transport.penghapusan_aset ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON transport.penghapusan_aset TO authenticated;
GRANT ALL ON transport.penghapusan_aset TO service_role;
REVOKE ALL ON transport.penghapusan_aset FROM anon;

DROP POLICY IF EXISTS "superadmin_all_penghapusan_aset" ON transport.penghapusan_aset;
CREATE POLICY "superadmin_all_penghapusan_aset"
  ON transport.penghapusan_aset FOR ALL TO authenticated
  USING (transport.is_superadmin())
  WITH CHECK (transport.is_superadmin());

-- ── 3. Catat penghapusan ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.catat_penghapusan_aset(
  p_jenis_aset    TEXT,
  p_asset_id      UUID,
  p_tanggal_hapus DATE,
  p_alasan        TEXT,
  p_catatan       TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_id     UUID;
  v_kode   TEXT;
  v_status TEXT;
  v_job    TEXT;
  v_label  TEXT := CASE WHEN p_jenis_aset = 'unit' THEN 'unit' ELSE 'unit trailer' END;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Butuh login superadmin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_jenis_aset NOT IN ('unit', 'unit_trailer') THEN
    RAISE EXCEPTION 'Jenis aset tidak valid.' USING ERRCODE = 'check_violation';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan penghapusan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tanggal_hapus IS NULL THEN
    RAISE EXCEPTION 'Tanggal penghapusan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_jenis_aset = 'unit' THEN
    SELECT kode_unit, status_operasional::text INTO v_kode, v_status
      FROM transport.units WHERE id = p_asset_id AND status = 1 FOR UPDATE;
    SELECT j.job_number INTO v_job FROM transport.jobs j
     WHERE j.unit_id = p_asset_id AND j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled')
     ORDER BY j.etd LIMIT 1;
  ELSE
    SELECT kode_trailer, status_trailer INTO v_kode, v_status
      FROM transport.unit_trailer WHERE id = p_asset_id AND status = 1 FOR UPDATE;
    SELECT j.job_number INTO v_job FROM transport.jobs j
     WHERE j.unit_trailer_id = p_asset_id AND j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled')
     ORDER BY j.etd LIMIT 1;
  END IF;
  IF v_kode IS NULL THEN
    RAISE EXCEPTION '% tidak ditemukan.', initcap(v_label) USING ERRCODE = 'P0002';
  END IF;
  IF v_status IN ('terjual', 'diafkirkan') THEN
    RAISE EXCEPTION 'Tidak bisa menghapus % % karena % sudah %.', v_label, v_kode, v_label, v_status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_status = 'bertugas' OR v_job IS NOT NULL THEN
    RAISE EXCEPTION 'Tidak bisa menghapus % % karena % sedang bertugas%. Selesaikan atau batalkan job-nya dulu.',
      v_label, v_kode, v_label, COALESCE(' (job ' || v_job || ' belum selesai)', '')
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO transport.penghapusan_aset (
    jenis_aset, unit_id, unit_trailer_id, tanggal_hapus, alasan, catatan, status_aset_sebelum, created_by)
  VALUES (
    p_jenis_aset,
    CASE WHEN p_jenis_aset = 'unit' THEN p_asset_id END,
    CASE WHEN p_jenis_aset = 'unit_trailer' THEN p_asset_id END,
    p_tanggal_hapus, btrim(p_alasan), NULLIF(btrim(COALESCE(p_catatan, '')), ''), v_status, auth.uid())
  RETURNING id INTO v_id;

  -- Aset dulu (trigger insiden tidak mengubah aset Diafkirkan), lalu insiden
  -- yang masih terbuka ditutup "Selesai (diafkirkan)".
  PERFORM set_config('app.status_note', 'Dihapus: ' || btrim(p_alasan), true);
  IF p_jenis_aset = 'unit' THEN
    UPDATE transport.units SET status_operasional = 'diafkirkan', updated_at = now() WHERE id = p_asset_id;
  ELSE
    UPDATE transport.unit_trailer SET status_trailer = 'diafkirkan', updated_at = now() WHERE id = p_asset_id;
  END IF;
  PERFORM set_config('app.status_note', '', true);
  PERFORM transport._tutup_insiden_aset(p_jenis_aset, p_asset_id, 'diafkirkan');

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION transport.catat_penghapusan_aset(TEXT, UUID, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.catat_penghapusan_aset(TEXT, UUID, DATE, TEXT, TEXT) TO authenticated;

-- ── 4. Batalkan penghapusan ─────────────────────────────────────────────────
-- p_insiden: [{"id": "<uuid>", "status": "open" | "in_progress"}, ...];
-- insiden yang tidak disebut dibuka ke status sebelum ditutup.
CREATE OR REPLACE FUNCTION transport.batalkan_penghapusan_aset(
  p_id UUID, p_alasan TEXT, p_insiden JSONB DEFAULT '[]'::jsonb)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_row    transport.penghapusan_aset%ROWTYPE;
  v_aset   UUID;
  v_kode   TEXT;
  v_status TEXT;
  v_label  TEXT;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Butuh login superadmin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_row FROM transport.penghapusan_aset WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Catatan penghapusan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  v_label := CASE WHEN v_row.jenis_aset = 'unit' THEN 'unit' ELSE 'unit trailer' END;
  IF v_row.jenis_aset = 'unit' THEN
    v_aset := v_row.unit_id;
    SELECT kode_unit, status_operasional::text INTO v_kode, v_status
      FROM transport.units WHERE id = v_aset FOR UPDATE;
  ELSE
    v_aset := v_row.unit_trailer_id;
    SELECT kode_trailer, status_trailer INTO v_kode, v_status
      FROM transport.unit_trailer WHERE id = v_aset FOR UPDATE;
  END IF;
  -- Aset yang sudah dijual setelah dihapus: batalkan penjualannya dulu.
  IF v_status IS DISTINCT FROM 'diafkirkan' THEN
    RAISE EXCEPTION 'Penghapusan % % tidak bisa dibatalkan karena statusnya kini %.', v_label, v_kode, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE transport.penghapusan_aset
     SET status = 2, alasan_batal = btrim(p_alasan), updated_at = now()
   WHERE id = p_id;

  PERFORM set_config('app.status_note', 'Penghapusan dibatalkan: ' || btrim(p_alasan), true);
  IF v_row.jenis_aset = 'unit' THEN
    UPDATE transport.units SET status_operasional = 'standby', updated_at = now() WHERE id = v_aset;
  ELSE
    UPDATE transport.unit_trailer SET status_trailer = 'standby', updated_at = now() WHERE id = v_aset;
  END IF;
  PERFORM set_config('app.status_note', '', true);

  -- Insiden yang ditutup karena penghapusan dibuka lagi; status aset lalu
  -- mengikuti insidennya (Open → Breakdown, Dalam penanganan → Perbaikan).
  PERFORM transport._buka_insiden_aset(v_row.jenis_aset, v_aset, 'diafkirkan', p_insiden);
END;
$$;
REVOKE ALL ON FUNCTION transport.batalkan_penghapusan_aset(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.batalkan_penghapusan_aset(UUID, TEXT, JSONB) TO authenticated;

-- ── 5. Jalan lama (tombol Ubah status) tidak dipakai lagi ───────────────────
DROP FUNCTION IF EXISTS transport.afkirkan_aset(TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS transport.kembalikan_aset_dari_afkir(TEXT, UUID, TEXT, JSONB);

-- ── 6. Bucket dokumen bukti (privat, pola sama seperti bukti-penjualan) ─────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bukti-penghapusan', 'bukti-penghapusan', false, 10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "admins_all_bukti_penghapusan" ON storage.objects;
CREATE POLICY "admins_all_bukti_penghapusan"
  ON storage.objects FOR ALL
  USING (bucket_id = 'bukti-penghapusan' AND transport.storage_is_active_admin())
  WITH CHECK (bucket_id = 'bukti-penghapusan' AND transport.storage_is_active_admin());

NOTIFY pgrst, 'reload schema';
