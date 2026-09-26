-- ============================================================================
-- Migration 20260926000007: jual aset Breakdown menutup insidennya
--
--   * catat_penjualan_unit(): unit / unit trailer Breakdown boleh dijual
--     (frontend meminta konfirmasi dulu). Setelah aset jadi Terjual, insiden
--     yang masih terbuka ditutup "Selesai (terjual)" (ditutup_karena =
--     'terjual'). Unit trailer Bertugas kini juga ditolak (status baru dari
--     migration 20260926000006).
--   * batalkan_penjualan_unit(): aset kembali Standby dan insiden yang
--     ditutup karena penjualan dibuka lagi ke status sebelumnya; status aset
--     lalu mengikuti insiden (Open → Breakdown). Aset yang Diafkirkan saat
--     dijual kembali ke Diafkirkan (kolom baru status_aset_sebelum).
-- Satu fungsi = satu transaksi. WAJIB: jalankan setelah 20260926000006.
-- Perubahan data: tidak ada.
-- ============================================================================

SET search_path = transport, extensions;

-- Status aset sebelum dijual — supaya batal jual mengembalikan Diafkirkan
-- ke Diafkirkan (bukan Standby).
ALTER TABLE transport.penjualan_unit ADD COLUMN IF NOT EXISTS status_aset_sebelum TEXT;

CREATE OR REPLACE FUNCTION transport.catat_penjualan_unit(
  p_jenis_aset      TEXT,
  p_asset_id        UUID,
  p_nama_pembeli    TEXT,
  p_no_hp_pembeli   TEXT,
  p_email_pembeli   TEXT,
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
    harga_jual, tanggal_jual, catatan, created_by, status_aset_sebelum)
  VALUES (
    p_jenis_aset,
    CASE WHEN p_jenis_aset = 'unit' THEN p_asset_id END,
    CASE WHEN p_jenis_aset = 'unit_trailer' THEN p_asset_id END,
    btrim(p_nama_pembeli), NULLIF(btrim(COALESCE(p_no_hp_pembeli, '')), ''),
    NULLIF(lower(btrim(COALESCE(p_email_pembeli, ''))), ''),
    p_harga_jual, p_tanggal_jual, NULLIF(btrim(COALESCE(p_catatan, '')), ''), auth.uid(), v_status)
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

NOTIFY pgrst, 'reload schema';
