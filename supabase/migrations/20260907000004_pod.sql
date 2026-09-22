-- ============================================================================
-- Migration 20260907000004: Bukti terima barang (e-POD)
--
-- Sampai sekarang bukti bongkar hanya ada di kertas: surat jalan dicetak,
-- ditandatangani penerima di lokasi, lalu menunggu sopir kembali ke kantor.
-- Selama kertasnya belum sampai, tagihan belum bisa dilengkapi lampirannya —
-- padahal job-nya sudah selesai berhari-hari sebelumnya.
--
-- Yang disimpan di sini adalah keterangan penerima dan tanda tangannya, yang
-- diambil driver di layar HP saat bongkar. Tanda tangan itu sendiri berupa
-- berkas gambar di bucket job-photos, sejalur dengan foto loading/unloading.
--
-- Tidak dibuatkan tabel sendiri: satu job hanya punya satu serah terima, dan
-- memisahkannya ke tabel lain hanya akan menambah join tanpa menambah apa pun.
-- ============================================================================

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS pod_penerima_nama    TEXT,
  ADD COLUMN IF NOT EXISTS pod_penerima_jabatan TEXT,
  ADD COLUMN IF NOT EXISTS pod_signature_path   TEXT,
  ADD COLUMN IF NOT EXISTS pod_catatan          TEXT,
  ADD COLUMN IF NOT EXISTS pod_at               TIMESTAMPTZ;

COMMENT ON COLUMN jobs.pod_signature_path IS
  'Path tanda tangan penerima di bucket job-photos: <job_id>/pod/<ts>.png';
COMMENT ON COLUMN jobs.pod_at IS
  'Kapan serah terima dicatat driver. NULL = belum ada bukti terima digital.';

-- ---------------------------------------------------------------------------
-- RPC: driver mencatat serah terima lalu menutup job
--
-- Digabung jadi satu langkah dengan sengaja. Kalau serah terima dan penutupan
-- job dipisah, akan selalu ada job berstatus selesai tanpa bukti terima —
-- persis keadaan yang ingin dihilangkan. Dan karena keduanya dalam satu
-- transaksi, tidak mungkin ada job yang tercatat selesai sementara bukti
-- terimanya gagal tersimpan.
--
-- Admin tetap bisa menutup job dari kantor tanpa POD lewat jalur biasa. Itu
-- jalan keluar untuk penerima yang menolak tanda tangan di layar — keputusan
-- semacam itu memang seharusnya diambil kantor, bukan diam-diam di lapangan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION driver_submit_pod(
  p_job_id         UUID,
  p_nama           TEXT,
  p_jabatan        TEXT DEFAULT NULL,
  p_signature_path TEXT DEFAULT NULL,
  p_catatan        TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver UUID := current_driver_id();
  v_job    jobs%ROWTYPE;
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id AND driver_id = v_driver;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job tidak ditemukan atau bukan job Anda' USING ERRCODE = '42501';
  END IF;

  IF v_job.accepted_at IS NULL THEN
    RAISE EXCEPTION 'Terima job dulu sebelum mencatat serah terima' USING ERRCODE = '22023';
  END IF;

  IF v_job.status <> 'unloading' THEN
    RAISE EXCEPTION 'Serah terima hanya bisa dicatat saat status unloading'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(btrim(p_nama), '') = '' THEN
    RAISE EXCEPTION 'Nama penerima wajib diisi' USING ERRCODE = '22023';
  END IF;

  -- Tanda tangan harus berada di folder job ini. Tanpa pemeriksaan ini, path
  -- yang dikirim klien bisa menunjuk berkas milik job lain.
  IF p_signature_path IS NOT NULL
     AND p_signature_path NOT LIKE (p_job_id::text || '/pod/%') THEN
    RAISE EXCEPTION 'Path tanda tangan tidak sah' USING ERRCODE = '42501';
  END IF;

  UPDATE jobs
     SET pod_penerima_nama    = btrim(p_nama),
         pod_penerima_jabatan = NULLIF(btrim(COALESCE(p_jabatan, '')), ''),
         pod_signature_path   = p_signature_path,
         pod_catatan          = NULLIF(btrim(COALESCE(p_catatan, '')), ''),
         pod_at               = now(),
         status               = 'selesai',
         updated_at           = now()
   WHERE id = p_job_id;
END;
$$;

GRANT EXECUTE ON FUNCTION driver_submit_pod(UUID, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Driver tidak lagi boleh menutup job lewat jalur status biasa
--
-- Sejak ada driver_submit_pod, satu-satunya cara driver menyelesaikan job
-- adalah dengan mencatat serah terima. Aturannya ditaruh di database, bukan
-- di tampilan, supaya versi aplikasi lama di HP driver tidak bisa melewatinya.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION driver_update_job_status(
  p_job_id UUID,
  p_status job_status,
  p_notes  TEXT DEFAULT NULL
)
RETURNS job_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver UUID := current_driver_id();
  v_job    jobs%ROWTYPE;
  v_next   job_status;
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id AND driver_id = v_driver;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job tidak ditemukan atau bukan job Anda' USING ERRCODE = '42501';
  END IF;

  IF v_job.accepted_at IS NULL THEN
    RAISE EXCEPTION 'Terima job dulu sebelum mengubah status' USING ERRCODE = '22023';
  END IF;

  v_next := CASE v_job.status
    WHEN 'menunggu_pickup'  THEN 'loading'
    WHEN 'loading'          THEN 'dalam_perjalanan'
    WHEN 'dalam_perjalanan' THEN 'unloading'
    ELSE NULL
  END;

  IF v_job.status = 'unloading' THEN
    RAISE EXCEPTION 'Job ditutup lewat form serah terima, bukan lewat tombol status'
      USING ERRCODE = '22023';
  END IF;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Job sudah selesai atau dibatalkan' USING ERRCODE = '22023';
  END IF;

  IF p_status IS DISTINCT FROM v_next THEN
    RAISE EXCEPTION 'Status berikutnya untuk job ini adalah %, bukan %', v_next, p_status
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.status_note', COALESCE(NULLIF(btrim(p_notes), ''), ''), true);
  UPDATE jobs SET status = v_next, updated_at = now() WHERE id = p_job_id;
  PERFORM set_config('app.status_note', '', true);

  RETURN v_next;
END;
$$;
