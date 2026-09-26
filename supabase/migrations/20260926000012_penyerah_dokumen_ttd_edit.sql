-- ============================================================================
-- Migration 20260926000012: penyerah unit, dokumen bertanda tangan, edit transaksi
--
--   * penjualan_unit: penyerah_nama & penyerah_jabatan (orang yang
--     menyerahkan unit — tercetak di tanda tangan penjual / PIHAK PERTAMA),
--     bukti_bast_path (+ waktu unggah) untuk BAST bertanda tangan. bukti_path
--     yang sudah ada kini berarti SURAT PENJUALAN bertanda tangan. Keduanya
--     opsional dan boleh diunggah tidak bersamaan.
--   * penghapusan_aset.bukti_path = berita acara penghapusan bertanda tangan.
--   * Edit (ubah_penjualan_unit / ubah_penghapusan_aset) dan batalkan hanya
--     boleh selama BELUM ada dokumen bertanda tangan yang diunggah. Aset &
--     nomor dokumen tidak berubah saat diedit.
--   * catat_penjualan_unit(): parameter p_penyerah_nama & p_penyerah_jabatan
--     (signature lama di-DROP). Fungsi disalin dari 000011 / 000007 / 000008.
-- WAJIB: jalankan setelah 20260926000011. Naikkan backend & frontend bersamaan.
-- Perubahan data: tidak ada.
-- ============================================================================

SET search_path = transport, extensions;

ALTER TABLE transport.penjualan_unit
  ADD COLUMN IF NOT EXISTS penyerah_nama TEXT,
  ADD COLUMN IF NOT EXISTS penyerah_jabatan TEXT,
  ADD COLUMN IF NOT EXISTS bukti_bast_path TEXT,
  ADD COLUMN IF NOT EXISTS bukti_bast_uploaded_at TIMESTAMPTZ;
COMMENT ON COLUMN transport.penjualan_unit.bukti_path IS 'Surat penjualan bertanda tangan (opsional)';
COMMENT ON COLUMN transport.penjualan_unit.bukti_bast_path IS 'BAST bertanda tangan (opsional)';
COMMENT ON COLUMN transport.penghapusan_aset.bukti_path IS 'Berita acara penghapusan bertanda tangan (opsional)';

-- ── Catat penjualan (+ penyerah) ────────────────────────────────────────────
DROP FUNCTION IF EXISTS transport.catat_penjualan_unit(TEXT, UUID, TEXT, TEXT, TEXT, BIGINT, DATE, TEXT);

CREATE OR REPLACE FUNCTION transport.catat_penjualan_unit(
  p_jenis_aset      TEXT,
  p_asset_id        UUID,
  p_nama_pembeli    TEXT,
  p_no_hp_pembeli   TEXT,
  p_email_pembeli   TEXT,
  p_harga_jual      BIGINT,
  p_tanggal_jual    DATE,
  p_catatan         TEXT DEFAULT NULL,
  p_penyerah_nama   TEXT DEFAULT NULL,
  p_penyerah_jabatan TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_id   UUID;
  v_kode TEXT;
  v_status TEXT;
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
  IF NULLIF(btrim(COALESCE(p_no_hp_pembeli, '')), '') IS NOT NULL
     AND (btrim(p_no_hp_pembeli) !~ '^\+?[0-9 .()-]+$'
          OR length(regexp_replace(p_no_hp_pembeli, '[^0-9]', '', 'g')) NOT BETWEEN 8 AND 15) THEN
    RAISE EXCEPTION 'No HP pembeli tidak valid (8–15 digit).' USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(btrim(COALESCE(p_email_pembeli, '')), '') IS NOT NULL
     AND btrim(p_email_pembeli) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Email pembeli tidak valid.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_harga_jual IS NULL OR p_harga_jual <= 0 THEN
    RAISE EXCEPTION 'Harga jual wajib diisi & lebih dari 0.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tanggal_jual IS NULL THEN
    RAISE EXCEPTION 'Tanggal jual wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_jenis_aset = 'unit' THEN
    SELECT kode_unit, status_operasional::text INTO v_kode, v_status
      FROM transport.units WHERE id = p_asset_id AND status = 1 FOR UPDATE;
    IF v_kode IS NULL THEN
      RAISE EXCEPTION 'Unit tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;
    IF v_status IN ('bertugas', 'perbaikan', 'terjual') THEN
      RAISE EXCEPTION 'Tidak bisa menjual unit % karena %.', v_kode,
        CASE v_status WHEN 'bertugas' THEN 'unit sedang bertugas'
                      WHEN 'perbaikan' THEN 'unit sedang perbaikan'
                      ELSE 'unit sudah terjual' END
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT j.job_number INTO v_job FROM transport.jobs j
     WHERE j.unit_id = p_asset_id AND j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled')
     ORDER BY j.etd LIMIT 1;
    IF v_job IS NOT NULL THEN
      RAISE EXCEPTION 'Tidak bisa menjual unit % karena unit sedang bertugas (job % belum selesai).', v_kode, v_job
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM transport.penjualan_unit WHERE unit_id = p_asset_id AND status = 1) THEN
      RAISE EXCEPTION 'Unit % sudah tercatat terjual.', v_kode USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT kode_trailer, status_trailer INTO v_kode, v_status
      FROM transport.unit_trailer WHERE id = p_asset_id AND status = 1 FOR UPDATE;
    IF v_kode IS NULL THEN
      RAISE EXCEPTION 'Unit trailer tidak ditemukan.' USING ERRCODE = 'P0002';
    END IF;
    IF v_status IN ('bertugas', 'perbaikan', 'terjual') THEN
      RAISE EXCEPTION 'Tidak bisa menjual unit trailer % karena %.', v_kode,
        CASE v_status WHEN 'bertugas' THEN 'unit trailer sedang bertugas'
                      WHEN 'perbaikan' THEN 'unit trailer sedang perbaikan'
                      ELSE 'unit trailer sudah terjual' END
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT j.job_number INTO v_job FROM transport.jobs j
     WHERE j.unit_trailer_id = p_asset_id AND j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled')
     ORDER BY j.etd LIMIT 1;
    IF v_job IS NOT NULL THEN
      RAISE EXCEPTION 'Tidak bisa menjual unit trailer % karena unit trailer sedang bertugas (job % belum selesai).', v_kode, v_job
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM transport.penjualan_unit WHERE unit_trailer_id = p_asset_id AND status = 1) THEN
      RAISE EXCEPTION 'Unit trailer % sudah tercatat terjual.', v_kode USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO transport.penjualan_unit (
    jenis_aset, unit_id, unit_trailer_id, nama_pembeli, no_hp_pembeli, email_pembeli,
    harga_jual, tanggal_jual, catatan, created_by, status_aset_sebelum, nomor_surat, nomor_bast,
    penyerah_nama, penyerah_jabatan)
  VALUES (
    p_jenis_aset,
    CASE WHEN p_jenis_aset = 'unit' THEN p_asset_id END,
    CASE WHEN p_jenis_aset = 'unit_trailer' THEN p_asset_id END,
    btrim(p_nama_pembeli), NULLIF(btrim(COALESCE(p_no_hp_pembeli, '')), ''),
    NULLIF(lower(btrim(COALESCE(p_email_pembeli, ''))), ''),
    p_harga_jual, p_tanggal_jual, NULLIF(btrim(COALESCE(p_catatan, '')), ''), auth.uid(), v_status,
    transport.next_nomor_dokumen('surat_penjualan', 'SPJ', p_tanggal_jual),
    transport.next_nomor_dokumen('bast_penjualan', 'BAST', p_tanggal_jual),
    NULLIF(btrim(COALESCE(p_penyerah_nama, '')), ''), NULLIF(btrim(COALESCE(p_penyerah_jabatan, '')), ''))
  RETURNING id INTO v_id;

  -- Aset dulu (trigger insiden tidak mengubah aset Terjual), lalu insiden
  -- yang masih terbuka (aset Breakdown) ditutup "Selesai (terjual)".
  PERFORM set_config('app.status_note', 'Terjual ke ' || btrim(p_nama_pembeli), true);
  IF p_jenis_aset = 'unit' THEN
    UPDATE transport.units SET status_operasional = 'terjual', updated_at = now() WHERE id = p_asset_id;
  ELSE
    UPDATE transport.unit_trailer SET status_trailer = 'terjual', updated_at = now() WHERE id = p_asset_id;
  END IF;
  PERFORM set_config('app.status_note', '', true);
  PERFORM transport._tutup_insiden_aset(p_jenis_aset, p_asset_id, 'terjual');

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION transport.catat_penjualan_unit(TEXT, UUID, TEXT, TEXT, TEXT, BIGINT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.catat_penjualan_unit(TEXT, UUID, TEXT, TEXT, TEXT, BIGINT, DATE, TEXT, TEXT, TEXT) TO authenticated;

-- ── Edit penjualan ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.ubah_penjualan_unit(
  p_id               UUID,
  p_nama_pembeli     TEXT,
  p_no_hp_pembeli    TEXT,
  p_email_pembeli    TEXT,
  p_harga_jual       BIGINT,
  p_tanggal_jual     DATE,
  p_catatan          TEXT DEFAULT NULL,
  p_penyerah_nama    TEXT DEFAULT NULL,
  p_penyerah_jabatan TEXT DEFAULT NULL
)
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
  IF v_row.bukti_path IS NOT NULL OR v_row.bukti_bast_path IS NOT NULL THEN
    RAISE EXCEPTION 'Penjualan % tidak bisa diedit karena surat / BAST bertanda tangan sudah diunggah.',
      COALESCE(v_row.nomor_surat, '') USING ERRCODE = 'check_violation';
  END IF;
  IF btrim(COALESCE(p_nama_pembeli, '')) = '' THEN
    RAISE EXCEPTION 'Nama pembeli wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(btrim(COALESCE(p_no_hp_pembeli, '')), '') IS NOT NULL
     AND (btrim(p_no_hp_pembeli) !~ '^\+?[0-9 .()-]+$'
          OR length(regexp_replace(p_no_hp_pembeli, '[^0-9]', '', 'g')) NOT BETWEEN 8 AND 15) THEN
    RAISE EXCEPTION 'No HP pembeli tidak valid (8–15 digit).' USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(btrim(COALESCE(p_email_pembeli, '')), '') IS NOT NULL
     AND btrim(p_email_pembeli) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Email pembeli tidak valid.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_harga_jual IS NULL OR p_harga_jual <= 0 THEN
    RAISE EXCEPTION 'Harga jual wajib diisi & lebih dari 0.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tanggal_jual IS NULL THEN
    RAISE EXCEPTION 'Tanggal jual wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE transport.penjualan_unit
     SET nama_pembeli = btrim(p_nama_pembeli),
         no_hp_pembeli = NULLIF(btrim(COALESCE(p_no_hp_pembeli, '')), ''),
         email_pembeli = NULLIF(lower(btrim(COALESCE(p_email_pembeli, ''))), ''),
         harga_jual = p_harga_jual,
         tanggal_jual = p_tanggal_jual,
         catatan = NULLIF(btrim(COALESCE(p_catatan, '')), ''),
         penyerah_nama = NULLIF(btrim(COALESCE(p_penyerah_nama, '')), ''),
         penyerah_jabatan = NULLIF(btrim(COALESCE(p_penyerah_jabatan, '')), ''),
         updated_at = now()
   WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION transport.ubah_penjualan_unit(UUID, TEXT, TEXT, TEXT, BIGINT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.ubah_penjualan_unit(UUID, TEXT, TEXT, TEXT, BIGINT, DATE, TEXT, TEXT, TEXT) TO authenticated;

-- ── Batal penjualan: ditolak bila dokumen bertanda tangan sudah diunggah ───
CREATE OR REPLACE FUNCTION transport.batalkan_penjualan_unit(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_row   transport.penjualan_unit%ROWTYPE;
  v_aset    UUID;
  v_kembali TEXT;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Butuh login superadmin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_row FROM transport.penjualan_unit WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Catatan penjualan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.bukti_path IS NOT NULL OR v_row.bukti_bast_path IS NOT NULL THEN
    RAISE EXCEPTION 'Penjualan % tidak bisa dibatalkan karena surat / BAST bertanda tangan sudah diunggah.',
      COALESCE(v_row.nomor_surat, '') USING ERRCODE = 'check_violation';
  END IF;

  UPDATE transport.penjualan_unit SET status = 2, updated_at = now() WHERE id = p_id;

  -- Aset Diafkirkan yang dijual kembali ke Diafkirkan; lainnya ke Standby
  -- (lalu mengikuti insiden yang dibuka lagi di bawah).
  v_kembali := CASE WHEN v_row.status_aset_sebelum = 'diafkirkan' THEN 'diafkirkan' ELSE 'standby' END;
  PERFORM set_config('app.status_note', 'Penjualan dibatalkan', true);
  IF v_row.jenis_aset = 'unit' THEN
    v_aset := v_row.unit_id;
    UPDATE transport.units SET status_operasional = v_kembali::transport.unit_status, updated_at = now()
     WHERE id = v_aset AND status_operasional = 'terjual';
  ELSE
    v_aset := v_row.unit_trailer_id;
    UPDATE transport.unit_trailer SET status_trailer = v_kembali, updated_at = now()
     WHERE id = v_aset AND status_trailer = 'terjual';
  END IF;
  PERFORM set_config('app.status_note', '', true);

  -- Insiden yang ditutup karena penjualan dibuka lagi ke status sebelumnya.
  PERFORM transport._buka_insiden_aset(v_row.jenis_aset, v_aset, 'terjual', '[]'::jsonb);
END;
$$;

-- ── Edit penghapusan ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.ubah_penghapusan_aset(
  p_id UUID, p_tanggal_hapus DATE, p_alasan TEXT, p_catatan TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_row transport.penghapusan_aset%ROWTYPE;
BEGIN
  IF NOT transport.is_superadmin() THEN
    RAISE EXCEPTION 'Butuh login superadmin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_row FROM transport.penghapusan_aset WHERE id = p_id AND status = 1 FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Catatan penghapusan tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.bukti_path IS NOT NULL THEN
    RAISE EXCEPTION 'Penghapusan % tidak bisa diedit karena berita acara bertanda tangan sudah diunggah.',
      COALESCE(v_row.nomor_berita_acara, '') USING ERRCODE = 'check_violation';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan penghapusan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_tanggal_hapus IS NULL THEN
    RAISE EXCEPTION 'Tanggal penghapusan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE transport.penghapusan_aset
     SET tanggal_hapus = p_tanggal_hapus,
         alasan = btrim(p_alasan),
         catatan = NULLIF(btrim(COALESCE(p_catatan, '')), ''),
         updated_at = now()
   WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION transport.ubah_penghapusan_aset(UUID, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.ubah_penghapusan_aset(UUID, DATE, TEXT, TEXT) TO authenticated;

-- ── Batal penghapusan: ditolak bila berita acara bertanda tangan diunggah ──
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
  IF v_row.bukti_path IS NOT NULL THEN
    RAISE EXCEPTION 'Penghapusan % tidak bisa dibatalkan karena berita acara bertanda tangan sudah diunggah.',
      COALESCE(v_row.nomor_berita_acara, '') USING ERRCODE = 'check_violation';
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

NOTIFY pgrst, 'reload schema';
