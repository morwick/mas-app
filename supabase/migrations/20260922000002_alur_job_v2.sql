-- ============================================================================
-- Migration 20260922000002: Alur Job v2 — Lock System, Sequence Lock,
-- foto per slot, pengajuan uang jalan, validasi admin, notifikasi kejadian.
--
-- Jalankan SETELAH 20260922000001 (nilai enum) selesai.
-- Acuan: PRD-Alur-Kerja-Job-v2.md.
--
-- Prinsip: semua kunci ditegakkan di database (trigger/RPC), bukan di UI.
--   BR-01 Lock System     → trg_jobs_driver_lock + admin_validate_job
--   BR-02 Sequence Lock   → driver_update_job_status
--   BR-04 Uang jalan awal → trg_jobs_require_pagu
--   BR-05 Pengajuan       → driver_request_uang_jalan
--   BR-06 Foto per slot   → job_stage_complete + driver_update_job_status
--   BR-07 Validasi        → trg_jobs_require_validation + admin_validate_job
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. jobs: kolom validasi & estimasi ETA
-- ---------------------------------------------------------------------------
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS validated_by     UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS validated_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validation_note  TEXT,
  ADD COLUMN IF NOT EXISTS eta_is_estimated BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN jobs.validated_at IS
  'Kapan admin menekan Approve. Job hanya boleh selesai bila ini terisi.';
COMMENT ON COLUMN jobs.validation_note IS
  'Catatan admin saat mengembalikan job ke driver untuk diperbaiki.';
COMMENT ON COLUMN jobs.eta_is_estimated IS
  'True bila ETA diisi sistem dari durasi rute, bukan oleh admin.';

-- Migrasi data: menunggu_pickup → ditugaskan / diterima.
UPDATE jobs SET status = 'diterima'   WHERE status = 'menunggu_pickup' AND accepted_at IS NOT NULL;
UPDATE jobs SET status = 'ditugaskan' WHERE status = 'menunggu_pickup';

-- Job yang sudah selesai lewat alur lama dianggap tervalidasi (FR-VAL-06).
UPDATE jobs SET validated_at = COALESCE(completed_at, updated_at)
 WHERE status = 'selesai' AND validated_at IS NULL;

ALTER TABLE jobs ALTER COLUMN status SET DEFAULT 'ditugaskan';

DROP INDEX IF EXISTS idx_jobs_driver_belum_konfirmasi;
CREATE INDEX IF NOT EXISTS idx_jobs_driver_belum_konfirmasi
  ON jobs(driver_id, etd)
  WHERE accepted_at IS NULL AND status NOT IN ('selesai', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_jobs_driver_aktif
  ON jobs(driver_id)
  WHERE status NOT IN ('selesai', 'cancelled');

-- ---------------------------------------------------------------------------
-- 2. BR-04: uang jalan wajib diisi saat job dibuat
--
-- Dipakai trigger, bukan CHECK: CHECK ikut dievaluasi saat UPDATE apa pun,
-- sehingga job lama yang pagunya 0 tidak bisa lagi diubah statusnya.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jobs_require_pagu()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.uang_jalan_pagu, 0) <= 0 THEN
    RAISE EXCEPTION 'Uang jalan wajib diisi saat membuat job' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_require_pagu ON jobs;
CREATE TRIGGER trg_jobs_require_pagu
  BEFORE INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION jobs_require_pagu();

-- ---------------------------------------------------------------------------
-- 3. BR-01: Lock System — status driver diturunkan dari job aktif
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION driver_active_job_id(p_driver_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.id FROM jobs j
  WHERE j.driver_id = p_driver_id
    AND j.status NOT IN ('selesai', 'cancelled')
  ORDER BY j.created_at
  LIMIT 1;
$$;

-- Driver yang masih In Job tidak boleh dipasang ke job lain. Berlaku saat
-- insert maupun saat admin memindahkan driver di job yang sudah ada.
CREATE OR REPLACE FUNCTION jobs_driver_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other UUID;
BEGIN
  IF NEW.status IN ('selesai', 'cancelled') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.driver_id = OLD.driver_id
     AND OLD.status NOT IN ('selesai', 'cancelled') THEN
    RETURN NEW; -- job yang sama tetap aktif, bukan penugasan baru
  END IF;

  SELECT j.id INTO v_other FROM jobs j
   WHERE j.driver_id = NEW.driver_id
     AND j.id <> NEW.id
     AND j.status NOT IN ('selesai', 'cancelled')
   LIMIT 1;

  IF v_other IS NOT NULL THEN
    RAISE EXCEPTION 'Driver masih In Job (job %). Tunggu admin memvalidasi job itu.',
      (SELECT job_number FROM jobs WHERE id = v_other)
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_driver_lock ON jobs;
CREATE TRIGGER trg_jobs_driver_lock
  BEFORE INSERT OR UPDATE OF driver_id, status ON jobs
  FOR EACH ROW EXECUTE FUNCTION jobs_driver_lock();

-- ---------------------------------------------------------------------------
-- 4. BR-07: `selesai` hanya lewat Approve (validated_at terisi)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jobs_require_validation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'selesai' AND OLD.status <> 'selesai' AND NEW.validated_at IS NULL THEN
    RAISE EXCEPTION 'Job harus divalidasi admin (Approve) sebelum selesai'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_require_validation ON jobs;
CREATE TRIGGER trg_jobs_require_validation
  BEFORE UPDATE OF status ON jobs
  FOR EACH ROW EXECUTE FUNCTION jobs_require_validation();

-- ---------------------------------------------------------------------------
-- 5. Sinkron status unit mengikuti status job yang baru
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_unit_status_with_job()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status NOT IN ('selesai', 'cancelled') THEN
    UPDATE units SET status = 'bertugas', updated_at = now()
     WHERE id = NEW.unit_id AND status <> 'perbaikan';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status IN ('selesai', 'cancelled') THEN
      UPDATE units SET status = 'standby', updated_at = now()
       WHERE id = NEW.unit_id AND status = 'bertugas';
    ELSIF OLD.status IN ('selesai', 'cancelled') THEN
      UPDATE units SET status = 'bertugas', updated_at = now()
       WHERE id = NEW.unit_id AND status = 'standby';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 6. job_photos: slot per sisi, skor kualitas, stempel waktu & lokasi
-- ---------------------------------------------------------------------------
ALTER TABLE job_photos
  ADD COLUMN IF NOT EXISTS stage           TEXT,
  ADD COLUMN IF NOT EXISTS slot            TEXT,
  ADD COLUMN IF NOT EXISTS sharpness_score NUMERIC,
  ADD COLUMN IF NOT EXISTS kualitas_rendah BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS taken_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lat             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS uploaded_by_driver UUID REFERENCES drivers(id);

-- Data lama: tahap = type, slot kosong (arsip, tidak dihitung kelengkapan).
UPDATE job_photos SET stage = type::text WHERE stage IS NULL;
ALTER TABLE job_photos ALTER COLUMN stage SET NOT NULL;

ALTER TABLE job_photos DROP CONSTRAINT IF EXISTS job_photos_stage_check;
ALTER TABLE job_photos ADD CONSTRAINT job_photos_stage_check
  CHECK (stage IN ('loading', 'unloading', 'serah_terima'));

ALTER TABLE job_photos DROP CONSTRAINT IF EXISTS job_photos_slot_check;
ALTER TABLE job_photos ADD CONSTRAINT job_photos_slot_check
  CHECK (
    slot IS NULL
    OR (stage IN ('loading', 'unloading')
        AND slot IN ('depan', 'belakang', 'kanan', 'kiri', 'surat_timbang'))
    OR (stage = 'serah_terima' AND slot = 'serah_terima')
  );

-- Satu foto per slot; unggah ulang mengganti (FR-PHOTO-01).
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_photos_slot
  ON job_photos(job_id, stage, slot)
  WHERE slot IS NOT NULL;

COMMENT ON COLUMN job_photos.sharpness_score IS
  'Variance of Laplacian yang dihitung backend; makin kecil makin buram.';
COMMENT ON COLUMN job_photos.kualitas_rendah IS
  'True bila skor ketajaman di bawah ambang — hanya penanda, tidak menolak.';

-- Kelengkapan slot sebuah tahap (BR-06).
CREATE OR REPLACE FUNCTION job_stage_complete(p_job_id UUID, p_stage TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_stage
    WHEN 'serah_terima' THEN EXISTS (
      SELECT 1 FROM job_photos
      WHERE job_id = p_job_id AND stage = 'serah_terima' AND slot = 'serah_terima')
    ELSE (
      SELECT COUNT(DISTINCT slot) = 5 FROM job_photos
      WHERE job_id = p_job_id AND stage = p_stage
        AND slot IN ('depan', 'belakang', 'kanan', 'kiri', 'surat_timbang'))
  END;
$$;

-- Driver mendaftarkan foto slot (setelah objek diunggah ke bucket). Upsert:
-- foto lama untuk slot yang sama diganti; path lamanya dikembalikan supaya
-- pemanggil bisa membersihkan objeknya.
CREATE OR REPLACE FUNCTION driver_register_job_photo(
  p_job_id    UUID,
  p_stage     TEXT,
  p_slot      TEXT,
  p_file_path TEXT,
  p_file_size INTEGER DEFAULT NULL,
  p_sharpness NUMERIC DEFAULT NULL,
  p_kualitas_rendah BOOLEAN DEFAULT false,
  p_taken_at  TIMESTAMPTZ DEFAULT NULL,
  p_lat       DOUBLE PRECISION DEFAULT NULL,
  p_lng       DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (id UUID, replaced_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver UUID := current_driver_id();
  v_job    jobs%ROWTYPE;
  v_old    job_photos%ROWTYPE;
  v_id     UUID;
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM jobs WHERE jobs.id = p_job_id AND driver_id = v_driver;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job tidak ditemukan atau bukan job Anda' USING ERRCODE = '42501';
  END IF;
  IF v_job.accepted_at IS NULL OR v_job.status IN ('selesai', 'cancelled') THEN
    RAISE EXCEPTION 'Job tidak dalam tahap yang menerima foto' USING ERRCODE = '22023';
  END IF;
  IF p_file_path NOT LIKE (p_job_id::text || '/%') THEN
    RAISE EXCEPTION 'Path foto tidak sah' USING ERRCODE = '42501';
  END IF;

  -- Foto hanya untuk tahap yang sedang atau sudah dilalui.
  IF (p_stage = 'loading'      AND v_job.status NOT IN ('diterima', 'loading', 'dalam_perjalanan', 'unloading', 'serah_terima_pool'))
  OR (p_stage = 'unloading'    AND v_job.status NOT IN ('dalam_perjalanan', 'unloading', 'serah_terima_pool'))
  OR (p_stage = 'serah_terima' AND v_job.status NOT IN ('serah_terima_pool')) THEN
    RAISE EXCEPTION 'Foto % belum bisa diunggah pada status %', p_stage, v_job.status
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old FROM job_photos jp
   WHERE jp.job_id = p_job_id AND jp.stage = p_stage AND jp.slot = p_slot;
  IF v_old.id IS NOT NULL THEN
    DELETE FROM job_photos WHERE job_photos.id = v_old.id;
  END IF;

  INSERT INTO job_photos (
    job_id, type, stage, slot, file_path, file_size,
    sharpness_score, kualitas_rendah, taken_at, lat, lng, uploaded_by_driver
  ) VALUES (
    p_job_id, p_stage::photo_type, p_stage, p_slot, p_file_path, p_file_size,
    p_sharpness, COALESCE(p_kualitas_rendah, false), p_taken_at, p_lat, p_lng, v_driver
  )
  RETURNING job_photos.id INTO v_id;

  RETURN QUERY SELECT v_id, v_old.file_path;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Uang jalan: bukti transfer & pengajuan driver
-- ---------------------------------------------------------------------------
ALTER TABLE uang_jalan
  ADD COLUMN IF NOT EXISTS bukti_transfer_path TEXT,
  ADD COLUMN IF NOT EXISTS request_id          UUID;

COMMENT ON COLUMN uang_jalan.bukti_transfer_path IS
  'Path foto bukti transfer di bucket bukti-transfer: <job_id>/<ts>.<ext>. Wajib untuk pencairan baru.';

CREATE TABLE IF NOT EXISTS uang_jalan_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  driver_id     UUID NOT NULL REFERENCES drivers(id),
  nominal       BIGINT NOT NULL CHECK (nominal > 0),
  catatan       TEXT,
  status        TEXT NOT NULL DEFAULT 'diajukan'
                CHECK (status IN ('diajukan', 'dicairkan', 'ditolak')),
  alasan_tolak  TEXT,
  uang_jalan_id UUID REFERENCES uang_jalan(id) ON DELETE SET NULL,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ,
  decided_by    UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_uj_requests_job ON uang_jalan_requests(job_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_uj_requests_pending ON uang_jalan_requests(status) WHERE status = 'diajukan';

ALTER TABLE uang_jalan
  DROP CONSTRAINT IF EXISTS uang_jalan_request_fk,
  ADD CONSTRAINT uang_jalan_request_fk
    FOREIGN KEY (request_id) REFERENCES uang_jalan_requests(id) ON DELETE SET NULL;

-- Posisi uang jalan sebuah job: pagu (awal + penambahan), cair, sisa.
CREATE OR REPLACE FUNCTION job_uang_jalan_posisi(p_job_id UUID)
RETURNS TABLE (pagu BIGINT, cair BIGINT, sisa BIGINT, ada_bukti BOOLEAN, pending_request BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT
      COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'penambahan_pagu'), 0) AS tambah,
      COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'pencairan'), 0)       AS cair,
      bool_or(jenis = 'pencairan' AND bukti_transfer_path IS NOT NULL)  AS ada_bukti
    FROM uang_jalan WHERE job_id = p_job_id
  )
  SELECT
    (j.uang_jalan_pagu + t.tambah)::BIGINT,
    t.cair::BIGINT,
    (j.uang_jalan_pagu + t.tambah - t.cair)::BIGINT,
    COALESCE(t.ada_bukti, false),
    EXISTS (SELECT 1 FROM uang_jalan_requests r WHERE r.job_id = p_job_id AND r.status = 'diajukan')
  FROM jobs j, t WHERE j.id = p_job_id;
$$;

-- Pencairan baru wajib berbukti (FR-UJ-06). Baris lama tidak disentuh.
CREATE OR REPLACE FUNCTION uang_jalan_require_bukti()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.jenis = 'pencairan' AND NEW.bukti_transfer_path IS NULL THEN
    RAISE EXCEPTION 'Pencairan uang jalan wajib menyertakan foto bukti transfer'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uang_jalan_require_bukti ON uang_jalan;
CREATE TRIGGER trg_uang_jalan_require_bukti
  BEFORE INSERT ON uang_jalan
  FOR EACH ROW EXECUTE FUNCTION uang_jalan_require_bukti();

-- Pencairan yang memenuhi pengajuan → pengajuan ditandai dicairkan.
CREATE OR REPLACE FUNCTION uang_jalan_fulfil_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.jenis = 'pencairan' AND NEW.request_id IS NOT NULL THEN
    UPDATE uang_jalan_requests
       SET status = 'dicairkan', uang_jalan_id = NEW.id,
           decided_at = now(), decided_by = COALESCE(NEW.created_by, auth.uid())
     WHERE id = NEW.request_id AND status = 'diajukan';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uang_jalan_fulfil_request ON uang_jalan;
CREATE TRIGGER trg_uang_jalan_fulfil_request
  AFTER INSERT ON uang_jalan
  FOR EACH ROW EXECUTE FUNCTION uang_jalan_fulfil_request();

-- RPC driver: ajukan uang jalan (BR-05).
CREATE OR REPLACE FUNCTION driver_request_uang_jalan(
  p_job_id  UUID,
  p_nominal BIGINT,
  p_catatan TEXT DEFAULT NULL
)
RETURNS uang_jalan_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver UUID := current_driver_id();
  v_job    jobs%ROWTYPE;
  v_pos    RECORD;
  v_row    uang_jalan_requests;
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id AND driver_id = v_driver;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job tidak ditemukan atau bukan job Anda' USING ERRCODE = '42501';
  END IF;
  IF v_job.accepted_at IS NULL OR v_job.status IN ('ditugaskan', 'menunggu_validasi', 'selesai', 'cancelled') THEN
    RAISE EXCEPTION 'Uang jalan hanya bisa diajukan setelah Terima Pekerjaan dan sebelum job diselesaikan'
      USING ERRCODE = '22023';
  END IF;
  IF p_nominal IS NULL OR p_nominal <= 0 THEN
    RAISE EXCEPTION 'Nominal harus lebih dari nol' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pos FROM job_uang_jalan_posisi(p_job_id);
  IF v_pos.pending_request THEN
    RAISE EXCEPTION 'Masih ada pengajuan yang menunggu dicairkan' USING ERRCODE = '22023';
  END IF;
  IF v_pos.sisa <= 0 THEN
    RAISE EXCEPTION 'Uang jalan job sudah diterima seluruhnya' USING ERRCODE = '22023';
  END IF;
  IF p_nominal > v_pos.sisa THEN
    RAISE EXCEPTION 'Nominal melebihi sisa uang jalan (Rp %)', v_pos.sisa USING ERRCODE = '22023';
  END IF;

  INSERT INTO uang_jalan_requests (job_id, driver_id, nominal, catatan)
  VALUES (p_job_id, v_driver, p_nominal, NULLIF(btrim(COALESCE(p_catatan, '')), ''))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Alur status driver (BR-02, BR-06) — pengganti versi lama
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION driver_accept_job(p_job_id UUID)
RETURNS TIMESTAMPTZ
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
  IF v_job.status IN ('selesai', 'cancelled') THEN
    RAISE EXCEPTION 'Job sudah ditutup, tidak bisa dikonfirmasi' USING ERRCODE = '22023';
  END IF;
  IF v_job.accepted_at IS NOT NULL THEN
    RETURN v_job.accepted_at;
  END IF;

  UPDATE jobs
     SET accepted_at = now(),
         status = CASE WHEN status = 'ditugaskan' THEN 'diterima'::job_status ELSE status END,
         updated_at = now()
   WHERE id = p_job_id;

  RETURN (SELECT accepted_at FROM jobs WHERE id = p_job_id);
END;
$$;

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
  v_pos    RECORD;
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM jobs WHERE id = p_job_id AND driver_id = v_driver;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Job tidak ditemukan atau bukan job Anda' USING ERRCODE = '42501';
  END IF;
  IF v_job.accepted_at IS NULL THEN
    RAISE EXCEPTION 'Terima pekerjaan dulu sebelum mengubah status' USING ERRCODE = '22023';
  END IF;

  -- Satu langkah maju saja; koreksi mundur adalah wewenang admin.
  v_next := CASE v_job.status
    WHEN 'diterima'          THEN 'loading'
    WHEN 'loading'           THEN 'dalam_perjalanan'
    WHEN 'dalam_perjalanan'  THEN 'unloading'
    WHEN 'unloading'         THEN 'serah_terima_pool'
    WHEN 'serah_terima_pool' THEN 'menunggu_validasi'
    ELSE NULL
  END;
  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Job tidak bisa dimajukan dari status %', v_job.status USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'Lengkapi 5 foto loading (depan, belakang, kanan, kiri, surat timbang) dulu.'
      USING ERRCODE = '22023';
  END IF;
  IF v_next = 'serah_terima_pool' AND NOT job_stage_complete(p_job_id, 'unloading') THEN
    RAISE EXCEPTION 'Lengkapi 5 foto unloading (depan, belakang, kanan, kiri, surat timbang) dulu.'
      USING ERRCODE = '22023';
  END IF;
  IF v_next = 'menunggu_validasi' AND NOT job_stage_complete(p_job_id, 'serah_terima') THEN
    RAISE EXCEPTION 'Unggah foto serah terima dokumen dulu.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.status_note', COALESCE(NULLIF(btrim(p_notes), ''), ''), true);
  UPDATE jobs SET status = v_next, updated_at = now() WHERE id = p_job_id;
  PERFORM set_config('app.status_note', '', true);

  RETURN v_next;
END;
$$;

-- e-POD dihapus dari alur (FR-PHOTO-09).
DROP FUNCTION IF EXISTS driver_submit_pod(UUID, TEXT, TEXT, TEXT, TEXT);

-- ---------------------------------------------------------------------------
-- 9. Validasi admin (Fase 7)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_validate_job(p_job_id UUID)
RETURNS job_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job jobs%ROWTYPE;
BEGIN
  IF NOT is_active_admin() OR NOT can_access_job(p_job_id) THEN
    RAISE EXCEPTION 'Tidak berhak memvalidasi job ini' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;
  IF v_job.status <> 'menunggu_validasi' THEN
    RAISE EXCEPTION 'Hanya job berstatus menunggu validasi yang bisa di-approve' USING ERRCODE = '22023';
  END IF;

  UPDATE jobs
     SET status = 'selesai', validated_by = auth.uid(), validated_at = now(),
         validation_note = NULL, updated_at = now()
   WHERE id = p_job_id;
  RETURN 'selesai';
END;
$$;

CREATE OR REPLACE FUNCTION admin_return_job(
  p_job_id UUID,
  p_note   TEXT,
  p_to_status job_status DEFAULT 'serah_terima_pool'
)
RETURNS job_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job jobs%ROWTYPE;
BEGIN
  IF NOT is_active_admin() OR NOT can_access_job(p_job_id) THEN
    RAISE EXCEPTION 'Tidak berhak mengembalikan job ini' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;
  IF v_job.status <> 'menunggu_validasi' THEN
    RAISE EXCEPTION 'Hanya job berstatus menunggu validasi yang bisa dikembalikan' USING ERRCODE = '22023';
  END IF;
  IF p_to_status NOT IN ('loading', 'dalam_perjalanan', 'unloading', 'serah_terima_pool') THEN
    RAISE EXCEPTION 'Status tujuan tidak valid' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(p_note), '') = '' THEN
    RAISE EXCEPTION 'Catatan pengembalian wajib diisi' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.status_note', 'Dikembalikan admin: ' || btrim(p_note), true);
  UPDATE jobs
     SET status = p_to_status, validation_note = btrim(p_note), updated_at = now()
   WHERE id = p_job_id;
  PERFORM set_config('app.status_note', '', true);
  RETURN p_to_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Perangkat driver (token push FCM)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_devices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  fcm_token    TEXT NOT NULL UNIQUE,
  platform     TEXT NOT NULL DEFAULT 'android',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_devices_driver ON driver_devices(driver_id);

ALTER TABLE driver_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_driver_devices" ON driver_devices;
CREATE POLICY "admin_read_driver_devices" ON driver_devices FOR SELECT USING (is_active_admin());

CREATE OR REPLACE FUNCTION driver_register_device(p_fcm_token TEXT, p_platform TEXT DEFAULT 'android')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver UUID := current_driver_id();
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Sesi driver tidak valid' USING ERRCODE = '28000';
  END IF;
  IF COALESCE(btrim(p_fcm_token), '') = '' THEN
    RAISE EXCEPTION 'Token perangkat kosong' USING ERRCODE = '22023';
  END IF;
  -- Token yang sama bisa berpindah driver (HP dipakai bergantian).
  INSERT INTO driver_devices (driver_id, fcm_token, platform)
  VALUES (v_driver, p_fcm_token, COALESCE(p_platform, 'android'))
  ON CONFLICT (fcm_token) DO UPDATE
    SET driver_id = EXCLUDED.driver_id, platform = EXCLUDED.platform, last_seen_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION driver_unregister_device(p_fcm_token TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM driver_devices
   WHERE fcm_token = p_fcm_token AND driver_id = current_driver_id();
$$;

-- ---------------------------------------------------------------------------
-- 11. Notifikasi berbasis kejadian (FR-NOTIF)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('admin', 'driver')),
  -- admin: NULL = semua admin (dibaca per user lewat notification_reads).
  recipient_id   UUID,
  kind           TEXT NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  href           TEXT,
  job_id         UUID REFERENCES jobs(id) ON DELETE CASCADE,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_admin
  ON notifications(created_at DESC) WHERE recipient_type = 'admin';
CREATE INDEX IF NOT EXISTS idx_notifications_driver
  ON notifications(recipient_id, created_at DESC) WHERE recipient_type = 'driver';

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_notifications" ON notifications;
CREATE POLICY "admin_read_notifications" ON notifications FOR SELECT
  USING (recipient_type = 'admin' AND is_active_admin() AND (job_id IS NULL OR can_access_job(job_id)));

DROP POLICY IF EXISTS "driver_read_notifications" ON notifications;
CREATE POLICY "driver_read_notifications" ON notifications FOR SELECT
  USING (recipient_type = 'driver' AND recipient_id = current_driver_id());

DROP POLICY IF EXISTS "driver_mark_notifications" ON notifications;
CREATE POLICY "driver_mark_notifications" ON notifications FOR UPDATE
  USING (recipient_type = 'driver' AND recipient_id = current_driver_id())
  WITH CHECK (recipient_type = 'driver' AND recipient_id = current_driver_id());

DROP POLICY IF EXISTS "admin_own_notification_reads" ON notification_reads;
CREATE POLICY "admin_own_notification_reads" ON notification_reads FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION notify_admin(p_kind TEXT, p_title TEXT, p_body TEXT, p_href TEXT, p_job_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO notifications (recipient_type, kind, title, body, href, job_id)
  VALUES ('admin', p_kind, p_title, p_body, p_href, p_job_id);
$$;

CREATE OR REPLACE FUNCTION notify_driver(p_driver_id UUID, p_kind TEXT, p_title TEXT, p_body TEXT, p_href TEXT, p_job_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO notifications (recipient_type, recipient_id, kind, title, body, href, job_id)
  VALUES ('driver', p_driver_id, p_kind, p_title, p_body, p_href, p_job_id);
$$;

-- Kejadian pada jobs.
CREATE OR REPLACE FUNCTION jobs_emit_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_driver(NEW.driver_id, 'job_baru', 'Job baru untuk Anda',
      NEW.job_number || ' — ' || NEW.asal || ' → ' || NEW.tujuan,
      '/driver/jobs/' || NEW.id, NEW.id);
    RETURN NEW;
  END IF;

  IF OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL THEN
    PERFORM notify_admin('job_diterima', 'Driver menerima job',
      NEW.job_number || ' diterima ' || (SELECT nama FROM drivers WHERE id = NEW.driver_id),
      '/jobs/' || NEW.id, NEW.id);
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'menunggu_validasi' THEN
      PERFORM notify_admin('job_menunggu_validasi', 'Job menunggu validasi',
        NEW.job_number || ' — ' || (SELECT nama FROM drivers WHERE id = NEW.driver_id) || ' sudah menyelesaikan orderan',
        '/jobs/' || NEW.id || '/validasi', NEW.id);
    ELSIF NEW.status = 'selesai' AND NEW.validated_at IS NOT NULL THEN
      PERFORM notify_driver(NEW.driver_id, 'job_divalidasi', 'Job divalidasi admin',
        NEW.job_number || ' selesai. Anda kembali Stand By.', '/driver/jobs/' || NEW.id, NEW.id);
    ELSIF OLD.status = 'menunggu_validasi' AND NEW.validation_note IS NOT NULL THEN
      PERFORM notify_driver(NEW.driver_id, 'job_dikembalikan', 'Job dikembalikan admin',
        NEW.job_number || ': ' || NEW.validation_note, '/driver/jobs/' || NEW.id, NEW.id);
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM notify_driver(NEW.driver_id, 'job_dibatalkan', 'Job dibatalkan',
        NEW.job_number || COALESCE(': ' || NEW.cancelled_reason, ''), '/driver/dashboard', NEW.id);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.driver_id <> NEW.driver_id AND NEW.status NOT IN ('selesai', 'cancelled') THEN
    PERFORM notify_driver(NEW.driver_id, 'job_baru', 'Job baru untuk Anda',
      NEW.job_number || ' — ' || NEW.asal || ' → ' || NEW.tujuan, '/driver/jobs/' || NEW.id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_emit_notifications ON jobs;
CREATE TRIGGER trg_jobs_emit_notifications
  AFTER INSERT OR UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION jobs_emit_notifications();

-- Kejadian uang jalan.
CREATE OR REPLACE FUNCTION uj_requests_emit_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = NEW.job_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_admin('uang_jalan_diajukan', 'Pengajuan uang jalan',
      v_job.job_number || ' — ' || (SELECT nama FROM drivers WHERE id = NEW.driver_id)
        || ' mengajukan Rp ' || to_char(NEW.nominal, 'FM999G999G999'),
      '/jobs/' || v_job.id, v_job.id);
  ELSIF NEW.status = 'ditolak' AND OLD.status <> 'ditolak' THEN
    PERFORM notify_driver(NEW.driver_id, 'uang_jalan_ditolak', 'Pengajuan uang jalan ditolak',
      v_job.job_number || COALESCE(': ' || NEW.alasan_tolak, ''), '/driver/jobs/' || v_job.id, v_job.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uj_requests_emit_notifications ON uang_jalan_requests;
CREATE TRIGGER trg_uj_requests_emit_notifications
  AFTER INSERT OR UPDATE ON uang_jalan_requests
  FOR EACH ROW EXECUTE FUNCTION uj_requests_emit_notifications();

CREATE OR REPLACE FUNCTION uang_jalan_emit_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job jobs%ROWTYPE;
BEGIN
  IF NEW.jenis = 'pencairan' AND NEW.bukti_transfer_path IS NOT NULL THEN
    SELECT * INTO v_job FROM jobs WHERE id = NEW.job_id;
    PERFORM notify_driver(v_job.driver_id, 'bukti_transfer', 'Uang jalan sudah ditransfer',
      v_job.job_number || ' — Rp ' || to_char(NEW.jumlah, 'FM999G999G999') || '. Anda bisa melanjutkan perjalanan.',
      '/driver/jobs/' || v_job.id, v_job.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uang_jalan_emit_notifications ON uang_jalan;
CREATE TRIGGER trg_uang_jalan_emit_notifications
  AFTER INSERT ON uang_jalan
  FOR EACH ROW EXECUTE FUNCTION uang_jalan_emit_notifications();

-- ---------------------------------------------------------------------------
-- 12. RLS tambahan
-- ---------------------------------------------------------------------------
ALTER TABLE uang_jalan_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_uj_requests" ON uang_jalan_requests;
CREATE POLICY "admin_all_uj_requests" ON uang_jalan_requests FOR ALL
  USING (is_active_admin() AND can_access_job(job_id))
  WITH CHECK (is_active_admin() AND can_access_job(job_id));

DROP POLICY IF EXISTS "driver_read_own_uj_requests" ON uang_jalan_requests;
CREATE POLICY "driver_read_own_uj_requests" ON uang_jalan_requests FOR SELECT
  USING (driver_id = current_driver_id());

-- Driver melihat pencairan job miliknya (nominal & kapan), untuk sisa pagu.
DROP POLICY IF EXISTS "driver_read_own_uang_jalan" ON uang_jalan;
CREATE POLICY "driver_read_own_uang_jalan" ON uang_jalan FOR SELECT
  USING (EXISTS (SELECT 1 FROM jobs j WHERE j.id = uang_jalan.job_id AND j.driver_id = current_driver_id()));

-- ---------------------------------------------------------------------------
-- 13. Storage: bukti transfer (privat, admin saja)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bukti-transfer', 'bukti-transfer', false, 5 * 1024 * 1024,
        ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "admins_all_bukti_transfer" ON storage.objects;
CREATE POLICY "admins_all_bukti_transfer" ON storage.objects FOR ALL
  USING (bucket_id = 'bukti-transfer' AND storage_is_active_admin())
  WITH CHECK (bucket_id = 'bukti-transfer' AND storage_is_active_admin());

-- ---------------------------------------------------------------------------
-- 14. Hak akses fungsi
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION driver_active_job_id(UUID)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION job_stage_complete(UUID, TEXT)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION job_uang_jalan_posisi(UUID)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION driver_register_job_photo(UUID, TEXT, TEXT, TEXT, INTEGER, NUMERIC, BOOLEAN, TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION)
                                                                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION driver_request_uang_jalan(UUID, BIGINT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION driver_accept_job(UUID)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION driver_update_job_status(UUID, job_status, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION driver_register_device(TEXT, TEXT)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION driver_unregister_device(TEXT)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_validate_job(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION admin_return_job(UUID, TEXT, job_status)   TO authenticated;
