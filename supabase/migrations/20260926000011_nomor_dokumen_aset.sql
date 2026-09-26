-- ============================================================================
-- Migration 20260926000011: nomor otomatis surat penjualan, BAST & BA penghapusan
--
-- Nomor dibuat di database saat transaksi dicatat (satu transaksi dengan
-- catatannya), memakai document_counters seperti invoice & penawaran —
-- urut per jenis dokumen per tahun, bulan romawi dari tanggal dokumen:
--   * Surat penjualan           : 0001/SPJ/MAS/IX/2026   (penjualan_unit.nomor_surat)
--   * BA serah terima (BAST)    : 0001/BAST/MAS/IX/2026  (penjualan_unit.nomor_bast)
--   * BA penghapusan aset       : 0001/BAP/MAS/IX/2026   (penghapusan_aset.nomor_berita_acara)
-- Nomor tidak dipakai ulang walau catatannya dibatalkan.
-- Catatan lama diberi nomor berurutan sesuai waktu dibuat (tercatat di log
-- sistem atas nama superadmin aktif pertama).
-- Fungsi catat_* disalin dari 20260926000007 / 000008; hanya INSERT-nya berubah.
-- WAJIB: jalankan setelah 20260926000010. Naikkan backend & frontend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

ALTER TABLE transport.penjualan_unit
  ADD COLUMN IF NOT EXISTS nomor_surat TEXT,
  ADD COLUMN IF NOT EXISTS nomor_bast TEXT;
ALTER TABLE transport.penghapusan_aset
  ADD COLUMN IF NOT EXISTS nomor_berita_acara TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS penjualan_unit_nomor_surat_unique ON transport.penjualan_unit (nomor_surat);
CREATE UNIQUE INDEX IF NOT EXISTS penjualan_unit_nomor_bast_unique ON transport.penjualan_unit (nomor_bast);
CREATE UNIQUE INDEX IF NOT EXISTS penghapusan_aset_nomor_ba_unique ON transport.penghapusan_aset (nomor_berita_acara);

-- ── Penomoran ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.next_nomor_dokumen(p_doc_type TEXT, p_kode TEXT, p_tanggal DATE)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_tanggal DATE := COALESCE(p_tanggal, (now() AT TIME ZONE 'Asia/Jakarta')::date);
  v_tahun   INTEGER := EXTRACT(YEAR FROM v_tanggal)::INTEGER;
  v_bulan   INTEGER := EXTRACT(MONTH FROM v_tanggal)::INTEGER;
  v_seq     INTEGER;
BEGIN
  INSERT INTO transport.document_counters (doc_type, tahun, last_seq)
  VALUES (p_doc_type, v_tahun, 1)
  ON CONFLICT (doc_type, tahun) DO UPDATE
    SET last_seq = transport.document_counters.last_seq + 1, updated_at = now()
  RETURNING transport.document_counters.last_seq INTO v_seq;

  RETURN LPAD(v_seq::TEXT, 4, '0') || '/' || p_kode || '/MAS/' || transport.to_roman_month(v_bulan) || '/' || v_tahun::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION transport.next_nomor_dokumen(TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;

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
    harga_jual, tanggal_jual, catatan, created_by, status_aset_sebelum, nomor_surat, nomor_bast)
  VALUES (
    p_jenis_aset,
    CASE WHEN p_jenis_aset = 'unit' THEN p_asset_id END,
    CASE WHEN p_jenis_aset = 'unit_trailer' THEN p_asset_id END,
    btrim(p_nama_pembeli), NULLIF(btrim(COALESCE(p_no_hp_pembeli, '')), ''),
    NULLIF(lower(btrim(COALESCE(p_email_pembeli, ''))), ''),
    p_harga_jual, p_tanggal_jual, NULLIF(btrim(COALESCE(p_catatan, '')), ''), auth.uid(), v_status,
    transport.next_nomor_dokumen('surat_penjualan', 'SPJ', p_tanggal_jual),
    transport.next_nomor_dokumen('bast_penjualan', 'BAST', p_tanggal_jual))
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
    jenis_aset, unit_id, unit_trailer_id, tanggal_hapus, alasan, catatan, status_aset_sebelum, created_by,
    nomor_berita_acara)
  VALUES (
    p_jenis_aset,
    CASE WHEN p_jenis_aset = 'unit' THEN p_asset_id END,
    CASE WHEN p_jenis_aset = 'unit_trailer' THEN p_asset_id END,
    p_tanggal_hapus, btrim(p_alasan), NULLIF(btrim(COALESCE(p_catatan, '')), ''), v_status, auth.uid(),
    transport.next_nomor_dokumen('berita_acara_penghapusan', 'BAP', p_tanggal_hapus))
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

-- ── Nomor untuk catatan lama ────────────────────────────────────────────────
DO $$
DECLARE
  v_admin UUID;
  r       RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM transport.penjualan_unit WHERE nomor_surat IS NULL OR nomor_bast IS NULL)
     AND NOT EXISTS (SELECT 1 FROM transport.penghapusan_aset WHERE nomor_berita_acara IS NULL) THEN
    RETURN;
  END IF;
  SELECT p.karyawan_id INTO v_admin FROM transport.profiles p
   WHERE p.role = 'superadmin' AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat penomoran dokumen lama.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_admin, 'Migrasi 20260926000011');

  FOR r IN SELECT id, tanggal_jual FROM transport.penjualan_unit
            WHERE nomor_surat IS NULL OR nomor_bast IS NULL ORDER BY created_at LOOP
    UPDATE transport.penjualan_unit
       SET nomor_surat = COALESCE(nomor_surat, transport.next_nomor_dokumen('surat_penjualan', 'SPJ', r.tanggal_jual)),
           nomor_bast  = COALESCE(nomor_bast, transport.next_nomor_dokumen('bast_penjualan', 'BAST', r.tanggal_jual))
     WHERE id = r.id;
  END LOOP;

  FOR r IN SELECT id, tanggal_hapus FROM transport.penghapusan_aset
            WHERE nomor_berita_acara IS NULL ORDER BY created_at LOOP
    UPDATE transport.penghapusan_aset
       SET nomor_berita_acara = transport.next_nomor_dokumen('berita_acara_penghapusan', 'BAP', r.tanggal_hapus)
     WHERE id = r.id;
  END LOOP;

  PERFORM transport.selesai_sesi_manual();
END $$;

NOTIFY pgrst, 'reload schema';
