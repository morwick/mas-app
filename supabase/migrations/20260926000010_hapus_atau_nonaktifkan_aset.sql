-- ============================================================================
-- Migration 20260926000010: hapus aset tanpa riwayat, nonaktifkan yang punya
--
--   * ringkasan_riwayat_aset(): jumlah riwayat job, insiden, service (unit
--     saja), penjualan, dan penghapusan sebuah unit / unit trailer.
--   * hapus_aset(): hanya bila SEMUA riwayat di atas kosong — aset beserta
--     data turunannya (riwayat status, snapshot odometer) ditandai terhapus
--     (soft delete, status = 2; ikut berantai lewat soft_delete_propagate),
--     sehingga hilang dari seluruh aplikasi seakan tidak pernah ada, dan
--     kodenya bisa dipakai lagi. Aset yang sudah punya riwayat ditolak —
--     nonaktifkan saja.
--   * unit_trailer.is_active: unit trailer kini bisa dinonaktifkan seperti
--     unit. Trailer nonaktif tidak muncul di pilihan form job, penjualan, dan
--     penghapusan.
-- WAJIB: jalankan setelah 20260926000009. Naikkan backend & frontend bersamaan.
-- Perubahan data: tidak ada (kolom baru default true).
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Unit trailer bisa dinonaktifkan ──────────────────────────────────────
ALTER TABLE transport.unit_trailer ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Pilihan trailer di form job: versi 20260924000017 + hanya yang aktif.
CREATE OR REPLACE FUNCTION transport.unit_trailer_untuk_unit(p_unit_id UUID)
RETURNS TABLE (
  wajib         BOOLEAN,
  id            UUID,
  kode_trailer  TEXT,
  jenis_nama    TEXT,
  status_trailer TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = transport, extensions
AS $$
  -- Baris pertama selalu ada: `wajib` terisi walau belum ada trailer yang cocok
  -- (id NULL) — form tetap tahu trailer wajib, dan menampilkan daftar kosong.
  WITH jenis AS (
    SELECT u.jenis_unit_id FROM transport.units u WHERE u.id = p_unit_id AND u.status = 1
  ), cek AS (
    SELECT EXISTS (
      SELECT 1 FROM transport.jenis_unit_trailer jt, jenis
       WHERE jt.jenis_unit_id = jenis.jenis_unit_id AND jt.status = 1) AS wajib
  ), trailer AS (
    SELECT t.id, t.kode_trailer, jt.nama AS jenis_nama, t.status_trailer
      FROM transport.unit_trailer t
      JOIN transport.jenis_unit_trailer jt ON jt.id = t.jenis_unit_trailer_id
      JOIN jenis ON jenis.jenis_unit_id = jt.jenis_unit_id
     WHERE t.status = 1 AND t.is_active AND jt.status = 1
  )
  SELECT cek.wajib, trailer.id, trailer.kode_trailer, trailer.jenis_nama, trailer.status_trailer
    FROM cek LEFT JOIN trailer ON cek.wajib
   ORDER BY trailer.kode_trailer NULLS FIRST;
$$;

-- ── 2. Ringkasan riwayat aset ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.ringkasan_riwayat_aset(p_jenis_aset TEXT, p_asset_id UUID)
RETURNS TABLE (job INTEGER, insiden INTEGER, service INTEGER, penjualan INTEGER, penghapusan INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_unit BOOLEAN := p_jenis_aset = 'unit';
BEGIN
  IF NOT transport.is_active_admin()
     OR NOT (CASE WHEN v_unit THEN transport.can_access_unit(p_asset_id)
                  ELSE transport.can_access_unit_trailer(p_asset_id) END) THEN
    RAISE EXCEPTION 'Aset tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY SELECT
    (SELECT count(*)::int FROM transport.jobs j WHERE j.status = 1
       AND CASE WHEN v_unit THEN j.unit_id = p_asset_id ELSE j.unit_trailer_id = p_asset_id END),
    (SELECT count(*)::int FROM transport.incident_logs i WHERE i.status = 1
       AND CASE WHEN v_unit THEN i.unit_id = p_asset_id ELSE i.unit_trailer_id = p_asset_id END),
    CASE WHEN v_unit
         THEN (SELECT count(*)::int FROM transport.service_records s WHERE s.status = 1 AND s.unit_id = p_asset_id)
         ELSE 0 END,
    (SELECT count(*)::int FROM transport.penjualan_unit p WHERE p.status = 1
       AND CASE WHEN v_unit THEN p.unit_id = p_asset_id ELSE p.unit_trailer_id = p_asset_id END),
    (SELECT count(*)::int FROM transport.penghapusan_aset h WHERE h.status = 1
       AND CASE WHEN v_unit THEN h.unit_id = p_asset_id ELSE h.unit_trailer_id = p_asset_id END);
END;
$$;
REVOKE ALL ON FUNCTION transport.ringkasan_riwayat_aset(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.ringkasan_riwayat_aset(TEXT, UUID) TO authenticated;

-- ── 3. Hapus aset tanpa riwayat ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.hapus_aset(p_jenis_aset TEXT, p_asset_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_label TEXT := CASE WHEN p_jenis_aset = 'unit' THEN 'Unit' ELSE 'Unit trailer' END;
  v_kode  TEXT;
  r       RECORD;
  v_ada   TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT (transport.is_superadmin() OR transport.is_admin()) THEN
    RAISE EXCEPTION 'Butuh login superadmin atau admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_jenis_aset NOT IN ('unit', 'unit_trailer') THEN
    RAISE EXCEPTION 'Jenis aset tidak valid.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_jenis_aset = 'unit' THEN
    SELECT kode_unit INTO v_kode FROM transport.units WHERE id = p_asset_id AND status = 1 FOR UPDATE;
  ELSE
    SELECT kode_trailer INTO v_kode FROM transport.unit_trailer WHERE id = p_asset_id AND status = 1 FOR UPDATE;
  END IF;
  IF v_kode IS NULL THEN
    RAISE EXCEPTION '% tidak ditemukan.', v_label USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO r FROM transport.ringkasan_riwayat_aset(p_jenis_aset, p_asset_id);
  IF r.job > 0 THEN v_ada := v_ada || 'job'; END IF;
  IF r.insiden > 0 THEN v_ada := v_ada || 'insiden'; END IF;
  IF r.service > 0 THEN v_ada := v_ada || 'service'; END IF;
  IF r.penjualan > 0 THEN v_ada := v_ada || 'penjualan'; END IF;
  IF r.penghapusan > 0 THEN v_ada := v_ada || 'penghapusan'; END IF;
  IF array_length(v_ada, 1) > 0 THEN
    RAISE EXCEPTION '% % tidak bisa dihapus karena sudah punya riwayat %. Nonaktifkan saja.',
      v_label, v_kode, array_to_string(v_ada, ', ') USING ERRCODE = 'check_violation';
  END IF;

  -- Soft delete; data turunan (riwayat status, snapshot odometer) ikut
  -- ditandai terhapus oleh trigger soft_delete_propagate.
  IF p_jenis_aset = 'unit' THEN
    UPDATE transport.units SET status = 2, default_driver_id = NULL, updated_at = now() WHERE id = p_asset_id;
  ELSE
    -- Riwayat status dulu: FK-nya tanpa CASCADE, jadi pengaman soft delete
    -- menolak trailer yang masih punya riwayat status aktif.
    UPDATE transport.unit_trailer_status_history SET status = 2 WHERE unit_trailer_id = p_asset_id AND status = 1;
    UPDATE transport.unit_trailer SET status = 2, updated_at = now() WHERE id = p_asset_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION transport.hapus_aset(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.hapus_aset(TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
