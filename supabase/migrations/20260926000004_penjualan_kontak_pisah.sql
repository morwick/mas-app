-- ============================================================================
-- Migration 20260926000004: kontak pembeli dipisah jadi No HP & Email
--
--   * penjualan_unit: kolom baru no_hp_pembeli & email_pembeli, kolom lama
--     kontak_pembeli dihapus. Isi lama dipindah: bagian yang berbentuk email
--     → email_pembeli, sisanya → no_hp_pembeli.
--   * catat_penjualan_unit(): parameter p_kontak_pembeli diganti
--     p_no_hp_pembeli & p_email_pembeli (signature lama di-DROP).
--   * Format dijaga CHECK: no HP 8–15 digit (boleh +, spasi, -, titik, kurung),
--     email berbentuk nama@domain.
--
-- Pemindahan data tercatat di log sistem atas nama superadmin aktif pertama.
-- WAJIB: naikkan backend & frontend versi baru bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

ALTER TABLE transport.penjualan_unit
  ADD COLUMN IF NOT EXISTS no_hp_pembeli TEXT,
  ADD COLUMN IF NOT EXISTS email_pembeli TEXT;

-- ── Pindahkan isi kontak_pembeli ────────────────────────────────────────────
DO $$
DECLARE
  v_admin UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'transport' AND table_name = 'penjualan_unit' AND column_name = 'kontak_pembeli')
  THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM transport.penjualan_unit WHERE NULLIF(btrim(kontak_pembeli), '') IS NOT NULL) THEN
    SELECT p.karyawan_id INTO v_admin FROM transport.profiles p
     WHERE p.role = 'superadmin' AND p.is_active AND p.status = 1
     ORDER BY p.created_at LIMIT 1;
    IF v_admin IS NULL THEN
      RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat pemindahan kontak pembeli.';
    END IF;
    PERFORM transport.mulai_sesi_manual(v_admin, 'Migrasi 20260926000004');
    EXECUTE $q$
      WITH k AS (
        SELECT id, kontak_pembeli AS kontak,
               substring(kontak_pembeli FROM '[^[:space:],;/()]+@[^[:space:],;/()]+') AS email
          FROM transport.penjualan_unit
         WHERE NULLIF(btrim(kontak_pembeli), '') IS NOT NULL
      )
      UPDATE transport.penjualan_unit p
         SET email_pembeli = lower(k.email),
             no_hp_pembeli = NULLIF(btrim(
               regexp_replace(
                 CASE WHEN k.email IS NULL THEN k.kontak ELSE replace(k.kontak, k.email, '') END,
                 '^[[:space:],;/-]+|[[:space:],;/-]+$', '', 'g')), '')
        FROM k
       WHERE p.id = k.id
    $q$;
    PERFORM transport.selesai_sesi_manual();
  END IF;
END $$;

-- NOT VALID: data lama hasil pemindahan tidak diperiksa (bisa saja formatnya
-- bebas), baris baru / yang diubah wajib memenuhi format.
ALTER TABLE transport.penjualan_unit
  DROP CONSTRAINT IF EXISTS penjualan_unit_no_hp_check,
  DROP CONSTRAINT IF EXISTS penjualan_unit_email_check;
ALTER TABLE transport.penjualan_unit
  ADD CONSTRAINT penjualan_unit_no_hp_check CHECK (
    no_hp_pembeli IS NULL OR (
      no_hp_pembeli ~ '^\+?[0-9 .()-]+$'
      AND length(regexp_replace(no_hp_pembeli, '[^0-9]', '', 'g')) BETWEEN 8 AND 15)) NOT VALID,
  ADD CONSTRAINT penjualan_unit_email_check CHECK (
    email_pembeli IS NULL OR email_pembeli ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') NOT VALID;

DROP FUNCTION IF EXISTS transport.catat_penjualan_unit(TEXT, UUID, TEXT, TEXT, BIGINT, DATE, TEXT);
ALTER TABLE transport.penjualan_unit DROP COLUMN IF EXISTS kontak_pembeli;

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
    jenis_aset, unit_id, unit_trailer_id, nama_pembeli, no_hp_pembeli, email_pembeli,
    harga_jual, tanggal_jual, catatan, created_by)
  VALUES (
    p_jenis_aset,
    CASE WHEN p_jenis_aset = 'unit' THEN p_asset_id END,
    CASE WHEN p_jenis_aset = 'unit_trailer' THEN p_asset_id END,
    btrim(p_nama_pembeli), NULLIF(btrim(COALESCE(p_no_hp_pembeli, '')), ''),
    NULLIF(lower(btrim(COALESCE(p_email_pembeli, ''))), ''),
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
REVOKE ALL ON FUNCTION transport.catat_penjualan_unit(TEXT, UUID, TEXT, TEXT, TEXT, BIGINT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.catat_penjualan_unit(TEXT, UUID, TEXT, TEXT, TEXT, BIGINT, DATE, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
