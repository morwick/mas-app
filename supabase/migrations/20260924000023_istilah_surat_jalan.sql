-- ============================================================================
-- Migration 20260924000023: istilah "surat timbang" → "surat jalan"
--
-- Hanya teks yang dilihat pengguna (pesan error driver_update_job_status).
-- Kode slot foto diganti terpisah di migration 000024. Definisi fungsi disalin dari migration
-- 20260924000007 dengan pesan yang diganti; logikanya tidak berubah.
-- Perubahan data: tidak ada.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.driver_update_job_status(p_job_id uuid, p_status transport.job_status, p_notes text DEFAULT NULL::text)
 RETURNS transport.job_status
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
DECLARE
  v_driver UUID := current_driver_id();
  v_job    jobs%ROWTYPE;
  v_next   transport.job_status;
  v_pos    RECORD;
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id AND driver_id = v_driver AND status = 1;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job tidak ditemukan atau bukan job Anda' USING ERRCODE = '42501';
  END IF;
  IF v_job.accepted_at IS NULL THEN
    RAISE EXCEPTION 'Terima pekerjaan dulu sebelum mengubah status' USING ERRCODE = '22023';
  END IF;

  -- Satu langkah maju saja; koreksi mundur adalah wewenang admin.
  v_next := CASE v_job.status_job
    WHEN 'diterima'          THEN 'loading'
    WHEN 'loading'           THEN 'dalam_perjalanan'
    WHEN 'dalam_perjalanan'  THEN 'unloading'
    WHEN 'unloading'         THEN 'serah_terima_pool'
    WHEN 'serah_terima_pool' THEN 'menunggu_validasi'
    ELSE NULL
  END;
  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Job tidak bisa dimajukan dari status %', v_job.status_job USING ERRCODE = '22023';
  END IF;
  IF p_status IS DISTINCT FROM v_next THEN
    RAISE EXCEPTION 'Status berikutnya untuk job ini adalah %, bukan %', v_next, p_status
      USING ERRCODE = '22023';
  END IF;

  -- BR-02 Sequence Lock.
  SELECT * INTO v_pos FROM job_uang_jalan_posisi(p_job_id);
  IF v_pos.pending_request THEN
    RAISE EXCEPTION 'Menunggu admin mengunggah bukti transfer uang jalan.' USING ERRCODE = '22023';
  END IF;
  IF v_next = 'loading' AND NOT v_pos.ada_bukti THEN
    RAISE EXCEPTION 'Menunggu admin mengunggah bukti transfer uang jalan.' USING ERRCODE = '22023';
  END IF;

  -- BR-06 kelengkapan foto tahap.
  IF v_next = 'dalam_perjalanan' AND NOT job_stage_complete(p_job_id, 'loading') THEN
    RAISE EXCEPTION 'Lengkapi 5 foto loading (depan, belakang, kanan, kiri, surat jalan) dulu.'
      USING ERRCODE = '22023';
  END IF;
  IF v_next = 'serah_terima_pool' AND NOT job_stage_complete(p_job_id, 'unloading') THEN
    RAISE EXCEPTION 'Lengkapi 5 foto unloading (depan, belakang, kanan, kiri, surat jalan) dulu.'
      USING ERRCODE = '22023';
  END IF;
  IF v_next = 'menunggu_validasi' AND NOT job_stage_complete(p_job_id, 'serah_terima') THEN
    RAISE EXCEPTION 'Unggah foto serah terima dokumen dulu.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.status_note', COALESCE(NULLIF(btrim(p_notes), ''), ''), true);
  UPDATE jobs SET status_job = v_next, updated_at = now() WHERE id = p_job_id AND status = 1;
  PERFORM set_config('app.status_note', '', true);

  RETURN v_next;
END;
$function$;

NOTIFY pgrst, 'reload schema';
