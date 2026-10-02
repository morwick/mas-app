-- ============================================================================
-- Migration 20261001000029: buat ulang job pengganti (ganti unit)
--
-- Kasus: job A unitnya rusak → "Ganti unit" membuat job pengganti B (kolom
-- B.menggantikan_job_id = A) dan menutup A Selesai. Lalu B DIBATALKAN, padahal
-- muatan A tetap harus diantar. Sebelumnya tidak ada jalan untuk membuat
-- pengganti lagi di proyek yang sama (tombol Ganti unit hanya untuk job yang
-- sedang berjalan; job biasa di proyek wajib memakai unit proyek).
--
-- Fungsi buat_ulang_job_pengganti(A, isian job baru, alasan):
--   * BATASAN: A harus Selesai, punya job pengganti, dan SEMUA job
--     penggantinya sudah dibatalkan (tidak ada pengganti yang masih jalan /
--     selesai).
--   * membuat job pengganti C (menggantikan_job_id = A) di proyek yang sama
--     dengan rute, penawaran & item penawaran A; unit bebas (Stand by, tidak
--     dipakai job lain), driver aktif & tidak sedang menjalankan job lain;
--   * riwayat penggantian A diarahkan ke C, catatan A menjadi
--     "Unit rusak - diganti C";
--   * job pengganti yang dibatalkan (B) DIHAPUS (soft delete, status = 2).
--   Insiden kerusakan & uang jalan supir lama sudah tercatat saat ganti unit
--   pertama — tidak dicatat ulang.
--
-- Tidak ada perubahan data. Aman dijalankan ulang.
-- WAJIB: jalankan setelah 20261001000028. Naikkan backend & frontend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.buat_ulang_job_pengganti(
  p_job_id   UUID,
  p_job_baru JSONB,
  p_alasan   TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_job    transport.jobs%ROWTYPE;
  v_isi    transport.jobs%ROWTYPE;
  v_baru   transport.jobs%ROWTYPE;
  v_unit   transport.units%ROWTYPE;
  v_lain   TEXT;
  v_batal  UUID[];
BEGIN
  IF NOT transport.is_active_admin() THEN
    RAISE EXCEPTION 'Butuh login admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_job FROM transport.jobs WHERE id = p_job_id AND status = 1 FOR UPDATE;
  IF v_job.id IS NULL OR NOT transport.can_access_job(p_job_id) THEN
    RAISE EXCEPTION 'Job tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  -- BATASAN: hanya job lama (Selesai karena ganti unit) yang semua job
  -- penggantinya dibatalkan.
  SELECT array_agg(p.id) INTO v_batal
    FROM transport.jobs p
   WHERE p.menggantikan_job_id = v_job.id AND p.status = 1 AND p.status_job = 'cancelled';
  IF v_job.status_job <> 'selesai' OR v_batal IS NULL THEN
    RAISE EXCEPTION 'Job % tidak punya job pengganti yang dibatalkan.', v_job.job_number
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM transport.jobs p
              WHERE p.menggantikan_job_id = v_job.id AND p.status = 1 AND p.status_job <> 'cancelled') THEN
    RAISE EXCEPTION 'Job % sudah punya job pengganti yang berjalan / selesai.', v_job.job_number
      USING ERRCODE = 'check_violation';
  END IF;

  v_isi := jsonb_populate_record(NULL::transport.jobs, p_job_baru);

  -- Unit: Stand by & tidak dipakai job lain.
  SELECT * INTO v_unit FROM transport.units WHERE id = v_isi.unit_id AND status = 1 FOR UPDATE;
  IF v_unit.id IS NULL OR NOT transport.can_access_unit(v_unit.id) THEN
    RAISE EXCEPTION 'Unit pengganti tidak ditemukan atau di luar scope akses Anda.' USING ERRCODE = 'P0002';
  END IF;
  IF v_unit.status_operasional <> 'standby' THEN
    RAISE EXCEPTION 'Unit % tidak Stand by (status: %).', v_unit.kode_unit, v_unit.status_operasional
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT j.job_number INTO v_lain FROM transport.jobs j
   WHERE j.unit_id = v_unit.id AND j.status = 1 AND j.status_job NOT IN ('selesai', 'cancelled') LIMIT 1;
  IF v_lain IS NOT NULL THEN
    RAISE EXCEPTION 'Unit % sedang dipakai job %.', v_unit.kode_unit, v_lain USING ERRCODE = 'check_violation';
  END IF;
  PERFORM transport._cek_driver_pengganti(v_isi.driver_id, p_job_id);

  INSERT INTO transport.jobs (
    proyek_id, menggantikan_job_id, alat_diangkut, asal, tujuan,
    asal_lat, asal_lng, tujuan_lat, tujuan_lng, route_polyline, route_distance_km, route_duration_min,
    unit_id, unit_trailer_id, driver_id, etd, eta, eta_is_estimated, uang_jalan_awal, catatan,
    quotation_id, quotation_item_id, created_by)
  VALUES (
    v_job.proyek_id, v_job.id, v_job.alat_diangkut, v_job.asal, v_job.tujuan,
    v_job.asal_lat, v_job.asal_lng, v_job.tujuan_lat, v_job.tujuan_lng,
    v_isi.route_polyline, v_isi.route_distance_km, v_isi.route_duration_min,
    v_unit.id, v_isi.unit_trailer_id, v_isi.driver_id, v_isi.etd, v_isi.eta,
    COALESCE(v_isi.eta_is_estimated, false), v_isi.uang_jalan_awal, v_isi.catatan,
    v_job.quotation_id, v_job.quotation_item_id, auth.uid())
  RETURNING * INTO v_baru;

  -- Riwayat ganti unit A kini menunjuk ke pengganti baru; catatan A diperbarui.
  UPDATE transport.job_ganti_unit SET job_pengganti_id = v_baru.id
   WHERE job_id = v_job.id AND status = 1 AND job_pengganti_id = ANY (v_batal);
  UPDATE transport.jobs
     SET validation_note = 'Unit rusak - diganti ' || v_baru.job_number
         || ' (pengganti sebelumnya dibatalkan: ' || btrim(p_alasan) || ')'
   WHERE id = v_job.id;

  -- Job pengganti yang dibatalkan dihapus (soft delete).
  UPDATE transport.jobs SET status = 2 WHERE id = ANY (v_batal) AND status = 1;

  RETURN v_baru.id;
END;
$$;
REVOKE ALL ON FUNCTION transport.buat_ulang_job_pengganti(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.buat_ulang_job_pengganti(UUID, JSONB, TEXT) TO authenticated;
