-- ============================================================================
-- Migration 20260926000001: ganti truk wajib mencatat insiden kerusakan
--
-- Sebelumnya ganti truk langsung mengubah truk lama jadi Perbaikan tanpa
-- insiden, sehingga status unit bisa Perbaikan tanpa jejak insiden. Sekarang
-- ganti_unit_job() sekaligus mencatat insiden tipe "kerusakan" (Open) untuk
-- truk lama — tanggal & jam, lokasi (posisi terakhir truk), dan deskripsi
-- diisi dari form ganti truk. Status truk lama mengikuti alur insiden:
-- Open → Breakdown, Dalam penanganan → Perbaikan, Selesai → Standby.
--
-- Semua dalam satu fungsi = satu transaksi: gagal di tengah → rollback semua.
-- Signature lama (5 parameter) di-DROP supaya tidak ada overload ganda.
-- Fungsi disalin dari 20260924000030 dan hanya diubah pada bagian di atas.
-- WAJIB: naikkan backend & frontend versi baru bersamaan.
-- Perubahan data: tidak ada.
-- ============================================================================

SET search_path = transport, extensions;

DROP FUNCTION IF EXISTS transport.ganti_unit_job(UUID, UUID, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION transport.ganti_unit_job(p_job_id uuid, p_unit_baru_id uuid, p_alasan text, p_driver_baru_id uuid DEFAULT NULL::uuid, p_unit_trailer_baru_id uuid DEFAULT NULL::uuid, p_insiden_tanggal timestamp with time zone DEFAULT NULL::timestamp with time zone, p_insiden_lokasi text DEFAULT NULL::text, p_insiden_deskripsi text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  -- Status job yang sedang "berjalan" (unit/driver sedang dipakai).
  c_berjalan CONSTANT TEXT[] := ARRAY['diterima', 'loading', 'dalam_perjalanan', 'unloading', 'serah_terima_pool'];
  v_job     transport.jobs%ROWTYPE;
  v_unit    transport.units%ROWTYPE;
  v_driver  transport.drivers%ROWTYPE;
  v_driver_baru UUID;
  v_lain    TEXT;
  v_id      UUID;
BEGIN
  IF NOT transport.is_active_admin() THEN
    RAISE EXCEPTION 'Butuh login admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan ganti truk wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_insiden_tanggal IS NULL THEN
    RAISE EXCEPTION 'Tanggal & jam insiden wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  IF btrim(COALESCE(p_insiden_deskripsi, '')) = '' THEN
    RAISE EXCEPTION 'Deskripsi insiden wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_job FROM transport.jobs WHERE id = p_job_id AND status = 1 FOR UPDATE;
  IF v_job.id IS NULL OR NOT transport.can_access_job(p_job_id) THEN
    RAISE EXCEPTION 'Job tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.status_job NOT IN ('loading', 'dalam_perjalanan', 'unloading') THEN
    RAISE EXCEPTION 'Ganti truk hanya bisa saat job di perjalanan (loading, dalam perjalanan, atau unloading).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Truk baru.
  -- Dikunci supaya dua pergantian bersamaan tidak memakai truk yang sama.
  SELECT * INTO v_unit FROM transport.units WHERE id = p_unit_baru_id AND status = 1 FOR UPDATE;
  IF v_unit.id IS NULL OR NOT transport.can_access_unit(p_unit_baru_id) THEN
    RAISE EXCEPTION 'Truk pengganti tidak ditemukan atau di luar scope akses Anda.' USING ERRCODE = 'P0002';
  END IF;
  IF v_unit.id = v_job.unit_id THEN
    RAISE EXCEPTION 'Truk pengganti tidak boleh sama dengan truk saat ini.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_unit.status_operasional <> 'standby' THEN
    RAISE EXCEPTION 'Truk % tidak Stand by (status: %).', v_unit.kode_unit, v_unit.status_operasional
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT j.job_number INTO v_lain FROM transport.jobs j
   WHERE j.unit_id = v_unit.id AND j.id <> p_job_id AND j.status = 1 AND j.status_job::text = ANY (c_berjalan)
   LIMIT 1;
  IF v_lain IS NOT NULL THEN
    RAISE EXCEPTION 'Truk % sedang dipakai job %.', v_unit.kode_unit, v_lain USING ERRCODE = 'check_violation';
  END IF;

  -- Driver (opsional).
  v_driver_baru := COALESCE(p_driver_baru_id, v_job.driver_id);
  IF v_driver_baru IS DISTINCT FROM v_job.driver_id THEN
    SELECT * INTO v_driver FROM transport.drivers WHERE id = v_driver_baru AND status = 1 FOR UPDATE;
    IF v_driver.id IS NULL OR NOT v_driver.is_active OR NOT transport.karyawan_aktif(v_driver.karyawan_id) THEN
      RAISE EXCEPTION 'Driver pengganti tidak ditemukan atau tidak aktif.' USING ERRCODE = 'P0002';
    END IF;
    SELECT j.job_number INTO v_lain FROM transport.jobs j
     WHERE j.driver_id = v_driver.id AND j.id <> p_job_id AND j.status = 1 AND j.status_job::text = ANY (c_berjalan)
     LIMIT 1;
    IF v_lain IS NOT NULL THEN
      RAISE EXCEPTION 'Driver % sedang menjalankan job %.', v_driver.nama, v_lain USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO transport.job_ganti_unit (
    job_id, unit_lama_id, unit_baru_id, driver_lama_id, driver_baru_id,
    unit_trailer_lama_id, unit_trailer_baru_id, status_job_saat_ganti, alasan, diganti_oleh)
  VALUES (
    p_job_id, v_job.unit_id, v_unit.id, v_job.driver_id, v_driver_baru,
    v_job.unit_trailer_id, p_unit_trailer_baru_id, v_job.status_job::text, btrim(p_alasan), auth.uid())
  RETURNING id INTO v_id;

  -- Trailer divalidasi trigger jobs_cek_unit_trailer.
  UPDATE transport.jobs
     SET unit_id = v_unit.id,
         driver_id = v_driver_baru,
         unit_trailer_id = p_unit_trailer_baru_id,
         updated_at = now()
   WHERE id = p_job_id;

  -- Truk baru → Bertugas.
  UPDATE transport.units SET status_operasional = 'bertugas', updated_at = now()
   WHERE id = v_unit.id AND status = 1;

  -- Truk lama rusak → dicatat sebagai insiden kerusakan (Open). Trigger
  -- incident_sync_status_unit mengubah truk lama jadi Breakdown; alur
  -- selanjutnya (Perbaikan → Standby) lewat fitur Insiden.
  INSERT INTO transport.incident_logs (unit_id, job_id, tipe, tanggal, lokasi, deskripsi, created_by)
  VALUES (
    v_job.unit_id, p_job_id, 'kerusakan', p_insiden_tanggal,
    NULLIF(btrim(COALESCE(p_insiden_lokasi, '')), ''), btrim(p_insiden_deskripsi), auth.uid());

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION transport.ganti_unit_job(UUID, UUID, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.ganti_unit_job(UUID, UUID, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
