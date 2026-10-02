-- ============================================================================
-- Migration 20261001000014: aturan gabung proyek, penggantian di job yang
--                           sedang berjalan, dan kasbon supir
--
-- 1. Aturan gabung proyek (BATASAN, trigger jobs_cek_gabung_proyek):
--    job biasa yang ditambahkan ke proyek yang sudah punya job wajib dari
--    PENAWARAN yang sama dan memakai UNIT yang sama dengan salah satu job
--    proyek itu. Job PENGGANTI (ganti unit karena rusak) dikecualikan — boleh
--    unit lain, jadi satu proyek bisa berisi lebih dari satu unit. Membuat
--    proyek baru untuk unit yang sama selalu boleh (tidak dipaksa gabung).
-- 2. Penggantian saat job berjalan, semua tercatat di riwayat job_ganti_unit
--    (kolom baru `jenis`):
--    * ganti_driver  — job & proyek sama; uang jalan yang dikembalikan supir
--                      lama dan yang dijadikan kasbon supir lama dicatat.
--    * ganti_trailer — unit trailer rusak; job sama; insiden trailer lama.
--    * ganti_unit    — unit rusak; dibuat JOB BARU (pengganti) di proyek yang
--                      sama; job lama ditutup SELESAI dengan catatan
--                      "Unit rusak - diganti JOB-xxx" (uang jalan yang sudah
--                      cair tetap biaya job lama); insiden unit lama.
--    Ganti truk lama (ganti unit di job yang sama) tidak dipakai lagi —
--    riwayatnya tetap tampil (jenis 'ganti_truk').
-- 3. Uang jalan jenis 'pengembalian' & 'kasbon' (20261001000013) mengurangi
--    uang yang sudah cair: cair bersih = pencairan − pengembalian − kasbon.
--    Kasbon juga dicatat per supir di tabel kasbon_driver.
-- 4. Job yang sudah diganti (job lama) tidak bisa ditagihkan.
-- 5. Portal driver: policy baca proyek diperbaiki (role anon + token driver).
-- 6. Laporan laba: tanda kosongan (cost perusahaan) & job diganti; uang jalan
--    memakai cair bersih. Daftar proyek: unit & nomor penawaran.
--
-- Perubahan data: riwayat ganti truk lama diberi jenis 'ganti_truk'.
-- WAJIB: jalankan setelah 20261001000013. Naikkan backend & frontend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Kolom baru ───────────────────────────────────────────────────────────
-- Job pengganti → job lama yang digantikannya (ganti unit karena rusak).
ALTER TABLE transport.jobs
  ADD COLUMN IF NOT EXISTS menggantikan_job_id UUID REFERENCES transport.jobs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_menggantikan ON transport.jobs (menggantikan_job_id) WHERE menggantikan_job_id IS NOT NULL;

ALTER TABLE transport.job_ganti_unit
  ADD COLUMN IF NOT EXISTS jenis TEXT NOT NULL DEFAULT 'ganti_truk',
  ADD COLUMN IF NOT EXISTS uang_jalan_dikembalikan BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kasbon BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_pengganti_id UUID REFERENCES transport.jobs(id) ON DELETE SET NULL;
ALTER TABLE transport.job_ganti_unit ALTER COLUMN unit_baru_id DROP NOT NULL;
ALTER TABLE transport.job_ganti_unit DROP CONSTRAINT IF EXISTS job_ganti_unit_jenis_check;
ALTER TABLE transport.job_ganti_unit ADD CONSTRAINT job_ganti_unit_jenis_check
  CHECK (jenis IN ('ganti_truk', 'ganti_driver', 'ganti_trailer', 'ganti_unit'));
ALTER TABLE transport.job_ganti_unit DROP CONSTRAINT IF EXISTS job_ganti_unit_nominal_check;
ALTER TABLE transport.job_ganti_unit ADD CONSTRAINT job_ganti_unit_nominal_check
  CHECK (uang_jalan_dikembalikan >= 0 AND kasbon >= 0);

-- ── 2. Kasbon supir ─────────────────────────────────────────────────────────
-- Dicatat & ditampilkan saja (pelunasan belum ada). Ditulis hanya lewat RPC
-- penggantian di bawah; staf aktif bisa membaca.
CREATE TABLE IF NOT EXISTS transport.kasbon_driver (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       UUID NOT NULL REFERENCES transport.drivers(id),
  job_id          UUID REFERENCES transport.jobs(id) ON DELETE SET NULL,
  uang_jalan_id   UUID REFERENCES transport.uang_jalan(id) ON DELETE SET NULL,
  penggantian_id  UUID REFERENCES transport.job_ganti_unit(id) ON DELETE SET NULL,
  asal            TEXT NOT NULL CONSTRAINT kasbon_driver_asal_check CHECK (asal IN ('ganti_driver', 'ganti_unit')),
  jumlah          BIGINT NOT NULL CONSTRAINT kasbon_driver_jumlah_check CHECK (jumlah > 0),
  keterangan      TEXT,
  created_by      UUID REFERENCES transport.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          SMALLINT NOT NULL DEFAULT 1 CONSTRAINT kasbon_driver_status_check CHECK (status IN (1, 2))
);
COMMENT ON TABLE transport.kasbon_driver IS 'Kasbon supir: sisa uang jalan yang tidak dikembalikan saat supir/unit diganti.';
CREATE INDEX IF NOT EXISTS idx_kasbon_driver_driver ON transport.kasbon_driver (driver_id, created_at DESC) WHERE status = 1;

DROP TRIGGER IF EXISTS trg_soft_delete ON transport.kasbon_driver;
CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.kasbon_driver
  FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead();
DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.kasbon_driver;
CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.kasbon_driver
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.kasbon_driver;
CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.kasbon_driver
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_log_sistem ON transport.kasbon_driver;
CREATE TRIGGER trg_log_sistem AFTER INSERT OR UPDATE ON transport.kasbon_driver
  FOR EACH ROW EXECUTE FUNCTION transport.log_perubahan_data();

ALTER TABLE transport.kasbon_driver ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON transport.kasbon_driver FROM anon, authenticated;
GRANT SELECT ON transport.kasbon_driver TO authenticated;
GRANT ALL ON transport.kasbon_driver TO service_role;
DROP POLICY IF EXISTS "staf_baca_kasbon_driver" ON transport.kasbon_driver;
CREATE POLICY "staf_baca_kasbon_driver" ON transport.kasbon_driver FOR SELECT TO authenticated
  USING (transport.is_active_admin());

-- ── 3. Uang jalan: pengembalian & kasbon ────────────────────────────────────
-- Pengembalian wajib menyebut kas yang menerima uangnya; kasbon tidak
-- (uangnya tetap di tangan supir).
ALTER TABLE transport.uang_jalan DROP CONSTRAINT IF EXISTS uang_jalan_sumber_check;
ALTER TABLE transport.uang_jalan ADD CONSTRAINT uang_jalan_sumber_check
  CHECK (
    (jenis IN ('pencairan', 'pengembalian') AND sumber_dana_id IS NOT NULL) OR
    (jenis IN ('tambahan', 'kasbon') AND sumber_dana_id IS NULL)
  );

-- Pengaruh satu baris terhadap sisa uang jalan job: pencairan mengurangi;
-- pengembalian & kasbon menambah kembali (uang itu bukan biaya job);
-- tambahan hanya dihitung setelah disetujui.
CREATE OR REPLACE FUNCTION transport._efek_uang_jalan_ke_sisa(
  p_status SMALLINT, p_jenis TEXT, p_jumlah NUMERIC, p_status_approval TEXT
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN p_status IS DISTINCT FROM 1 THEN 0
           WHEN p_jenis = 'tambahan' THEN
             CASE WHEN p_status_approval = 'disetujui' THEN COALESCE(p_jumlah, 0) ELSE 0 END
           WHEN p_jenis IN ('pengembalian', 'kasbon') THEN COALESCE(p_jumlah, 0)
           ELSE -COALESCE(p_jumlah, 0)
         END;
$$;

-- Posisi uang jalan: `cair` = cair bersih (pencairan − pengembalian − kasbon).
CREATE OR REPLACE FUNCTION transport.job_uang_jalan_posisi(p_job_id UUID)
RETURNS TABLE (uang_jalan BIGINT, cair BIGINT, sisa BIGINT, ada_bukti BOOLEAN, pending_request BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  WITH t AS (
    SELECT
      COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'tambahan' AND status_approval = 'disetujui'), 0) AS tambah,
      COALESCE(SUM(jumlah) FILTER (WHERE jenis = 'pencairan'), 0)
        - COALESCE(SUM(jumlah) FILTER (WHERE jenis IN ('pengembalian', 'kasbon')), 0) AS cair,
      bool_or(jenis = 'pencairan' AND bukti_transfer_path IS NOT NULL) AS ada_bukti
    FROM transport.uang_jalan WHERE job_id = p_job_id AND status = 1
  )
  SELECT
    (j.uang_jalan_awal + t.tambah)::BIGINT,
    t.cair::BIGINT,
    (j.uang_jalan_awal + t.tambah - t.cair)::BIGINT,
    COALESCE(t.ada_bukti, false),
    EXISTS (SELECT 1 FROM transport.uang_jalan_requests r
             WHERE r.job_id = p_job_id AND r.status = 1 AND r.status_pengajuan = 'diajukan')
  FROM transport.jobs j, t WHERE j.id = p_job_id AND j.status = 1;
$$;

-- BATASAN: pengembalian & kasbon adalah riwayat penggantian — hanya dibuat
-- lewat RPC penggantian dan tidak bisa diubah / dihapus sesudahnya.
CREATE OR REPLACE FUNCTION transport.uang_jalan_kunci_penggantian()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = transport, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.jenis IN ('pengembalian', 'kasbon')
       AND COALESCE(current_setting('app.penggantian_job', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Pengembalian & kasbon uang jalan hanya dicatat lewat Ganti driver / Ganti unit.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.jenis IN ('pengembalian', 'kasbon') OR NEW.jenis IN ('pengembalian', 'kasbon') THEN
    IF (NEW.jenis, NEW.jumlah, NEW.job_id, NEW.status, NEW.sumber_dana_id)
       IS DISTINCT FROM (OLD.jenis, OLD.jumlah, OLD.job_id, OLD.status, OLD.sumber_dana_id) THEN
      RAISE EXCEPTION 'Pengembalian & kasbon uang jalan adalah riwayat penggantian dan tidak bisa diubah / dihapus.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.uang_jalan_kunci_penggantian() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_uang_jalan_kunci_penggantian ON transport.uang_jalan;
CREATE TRIGGER trg_uang_jalan_kunci_penggantian
  BEFORE INSERT OR UPDATE ON transport.uang_jalan
  FOR EACH ROW EXECUTE FUNCTION transport.uang_jalan_kunci_penggantian();

-- ── 4. Aturan gabung proyek ─────────────────────────────────────────────────
-- BATASAN: lihat header bagian 1. Dijaga juga di backend (ProyekService) dan
-- form proyek (unit terkunci mengikuti proyek).
CREATE OR REPLACE FUNCTION transport.jobs_cek_gabung_proyek()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_nomor     TEXT;
  v_ada_job   BOOLEAN;
  v_unit_ok   BOOLEAN;
  v_quote_ok  BOOLEAN;
  v_units     TEXT;
BEGIN
  -- Job pengganti (ganti unit karena rusak) boleh memakai unit lain.
  IF NEW.status <> 1 OR NEW.menggantikan_job_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (SELECT 1 FROM transport.jobs j
                  WHERE j.proyek_id = NEW.proyek_id AND j.id <> NEW.id AND j.status = 1
                    AND j.status_job <> 'cancelled')
    INTO v_ada_job;
  IF NOT v_ada_job THEN
    RETURN NEW;  -- job pertama proyek: menentukan unit & penawaran proyek
  END IF;
  SELECT nomor_proyek INTO v_nomor FROM transport.proyek WHERE id = NEW.proyek_id;

  SELECT NOT EXISTS (SELECT 1 FROM transport.jobs j
                      WHERE j.proyek_id = NEW.proyek_id AND j.id <> NEW.id AND j.status = 1
                        AND j.status_job <> 'cancelled'
                        AND j.quotation_id IS DISTINCT FROM NEW.quotation_id)
    INTO v_quote_ok;
  IF NOT v_quote_ok THEN
    RAISE EXCEPTION 'Job ini tidak bisa digabung ke proyek % — satu proyek hanya untuk satu penawaran yang sama.', v_nomor
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (SELECT 1 FROM transport.jobs j
                  WHERE j.proyek_id = NEW.proyek_id AND j.id <> NEW.id AND j.status = 1
                    AND j.status_job <> 'cancelled' AND j.unit_id = NEW.unit_id)
    INTO v_unit_ok;
  IF NOT v_unit_ok THEN
    SELECT string_agg(DISTINCT u.kode_unit, ', ') INTO v_units
      FROM transport.jobs j JOIN transport.units u ON u.id = j.unit_id
     WHERE j.proyek_id = NEW.proyek_id AND j.id <> NEW.id AND j.status = 1 AND j.status_job <> 'cancelled';
    RAISE EXCEPTION 'Unit job harus sama dengan unit proyek % (%). Unit lain → buat proyek baru.', v_nomor, v_units
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.jobs_cek_gabung_proyek() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_jobs_cek_gabung_proyek ON transport.jobs;
CREATE TRIGGER trg_jobs_cek_gabung_proyek
  BEFORE INSERT ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_cek_gabung_proyek();

-- ── 5. Penggantian: helper bersama ──────────────────────────────────────────
-- Status job yang sedang "berjalan" (unit/driver sedang dipakai).
CREATE OR REPLACE FUNCTION transport._status_job_berjalan()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['diterima', 'loading', 'dalam_perjalanan', 'unloading', 'serah_terima_pool'];
$$;

-- Ambil & kunci job yang boleh diganti driver/trailer/unit-nya.
CREATE OR REPLACE FUNCTION transport._job_untuk_penggantian(p_job_id UUID, p_alasan TEXT)
RETURNS transport.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_job transport.jobs%ROWTYPE;
BEGIN
  IF NOT transport.is_active_admin() THEN
    RAISE EXCEPTION 'Butuh login admin.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF btrim(COALESCE(p_alasan, '')) = '' THEN
    RAISE EXCEPTION 'Alasan penggantian wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_job FROM transport.jobs WHERE id = p_job_id AND status = 1 FOR UPDATE;
  IF v_job.id IS NULL OR NOT transport.can_access_job(p_job_id) THEN
    RAISE EXCEPTION 'Job tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  -- BATASAN: penggantian hanya untuk job yang sedang berjalan.
  IF NOT (v_job.status_job::text = ANY (transport._status_job_berjalan())) THEN
    RAISE EXCEPTION 'Penggantian hanya bisa saat job sedang berjalan (status sekarang: %).', v_job.status_job
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_job;
END;
$$;
REVOKE ALL ON FUNCTION transport._job_untuk_penggantian(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Driver pengganti: aktif dan tidak sedang menjalankan job lain.
CREATE OR REPLACE FUNCTION transport._cek_driver_pengganti(p_driver_id UUID, p_job_id UUID)
RETURNS transport.drivers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_driver transport.drivers%ROWTYPE;
  v_lain   TEXT;
BEGIN
  SELECT * INTO v_driver FROM transport.drivers WHERE id = p_driver_id AND status = 1 FOR UPDATE;
  IF v_driver.id IS NULL OR NOT v_driver.is_active OR NOT transport.karyawan_aktif(v_driver.karyawan_id) THEN
    RAISE EXCEPTION 'Driver pengganti tidak ditemukan atau tidak aktif.' USING ERRCODE = 'P0002';
  END IF;
  SELECT j.job_number INTO v_lain FROM transport.jobs j
   WHERE j.driver_id = v_driver.id AND j.id <> p_job_id AND j.status = 1
     AND j.status_job NOT IN ('selesai', 'cancelled')
   LIMIT 1;
  IF v_lain IS NOT NULL THEN
    RAISE EXCEPTION 'Driver % masih menjalankan job %.', v_driver.nama, v_lain USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_driver;
END;
$$;
REVOKE ALL ON FUNCTION transport._cek_driver_pengganti(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Catat uang jalan yang dikembalikan supir lama & yang dijadikan kasbon.
-- BATASAN: jumlah keduanya tidak boleh melebihi uang jalan yang sudah cair
-- bersih di job itu; pengembalian wajib menyebut kas penerima.
CREATE OR REPLACE FUNCTION transport._catat_pengembalian_kasbon(
  p_job          transport.jobs,
  p_penggantian  UUID,
  p_asal         TEXT,
  p_dikembalikan BIGINT,
  p_sumber_dana  UUID,
  p_kasbon       BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_cair   BIGINT;
  v_uj_id  UUID;
  v_hari   DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_driver TEXT;
BEGIN
  IF COALESCE(p_dikembalikan, 0) < 0 OR COALESCE(p_kasbon, 0) < 0 THEN
    RAISE EXCEPTION 'Uang jalan dikembalikan & kasbon tidak boleh minus.' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(p_dikembalikan, 0) = 0 AND COALESCE(p_kasbon, 0) = 0 THEN
    RETURN;
  END IF;
  SELECT cair INTO v_cair FROM transport.job_uang_jalan_posisi(p_job.id);
  IF COALESCE(p_dikembalikan, 0) + COALESCE(p_kasbon, 0) > COALESCE(v_cair, 0) THEN
    RAISE EXCEPTION 'Uang jalan dikembalikan + kasbon (Rp %) melebihi uang jalan yang sudah cair di job % (Rp %).',
      replace(to_char(COALESCE(p_dikembalikan, 0) + COALESCE(p_kasbon, 0), 'FM999,999,999,999'), ',', '.'),
      p_job.job_number, replace(to_char(COALESCE(v_cair, 0), 'FM999,999,999,999'), ',', '.')
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT nama INTO v_driver FROM transport.drivers WHERE id = p_job.driver_id;

  PERFORM set_config('app.penggantian_job', 'on', true);
  IF COALESCE(p_dikembalikan, 0) > 0 THEN
    IF p_sumber_dana IS NULL THEN
      RAISE EXCEPTION 'Pilih kas yang menerima uang jalan yang dikembalikan.' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO transport.uang_jalan (job_id, jenis, tanggal, jumlah, sumber_dana_id, keperluan, catatan, created_by)
    VALUES (p_job.id, 'pengembalian', v_hari, p_dikembalikan, p_sumber_dana, 'Pengembalian supir',
            'Dikembalikan ' || COALESCE(v_driver, 'supir lama') || ' saat ' || replace(p_asal, '_', ' '), auth.uid());
  END IF;
  IF COALESCE(p_kasbon, 0) > 0 THEN
    INSERT INTO transport.uang_jalan (job_id, jenis, tanggal, jumlah, keperluan, catatan, created_by)
    VALUES (p_job.id, 'kasbon', v_hari, p_kasbon, 'Kasbon supir',
            'Kasbon ' || COALESCE(v_driver, 'supir lama') || ' saat ' || replace(p_asal, '_', ' '), auth.uid())
    RETURNING id INTO v_uj_id;
    INSERT INTO transport.kasbon_driver (driver_id, job_id, uang_jalan_id, penggantian_id, asal, jumlah, keterangan, created_by)
    VALUES (p_job.driver_id, p_job.id, v_uj_id, p_penggantian, p_asal, p_kasbon,
            'Sisa uang jalan ' || p_job.job_number || ' yang tidak dikembalikan', auth.uid());
  END IF;
  PERFORM set_config('app.penggantian_job', '', true);
END;
$$;
REVOKE ALL ON FUNCTION transport._catat_pengembalian_kasbon(transport.jobs, UUID, TEXT, BIGINT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;

-- ── 6. Ganti driver (job & proyek sama) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.ganti_driver_job(
  p_job_id         UUID,
  p_driver_baru_id UUID,
  p_alasan         TEXT,
  p_dikembalikan   BIGINT DEFAULT 0,
  p_sumber_dana_id UUID DEFAULT NULL,
  p_kasbon         BIGINT DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_job transport.jobs%ROWTYPE;
  v_id  UUID;
BEGIN
  v_job := transport._job_untuk_penggantian(p_job_id, p_alasan);
  IF p_driver_baru_id IS NULL OR p_driver_baru_id = v_job.driver_id THEN
    RAISE EXCEPTION 'Pilih driver pengganti yang berbeda dari driver sekarang.' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM transport._cek_driver_pengganti(p_driver_baru_id, p_job_id);

  INSERT INTO transport.job_ganti_unit (
    job_id, jenis, unit_lama_id, unit_baru_id, driver_lama_id, driver_baru_id,
    unit_trailer_lama_id, unit_trailer_baru_id, status_job_saat_ganti, alasan, diganti_oleh,
    uang_jalan_dikembalikan, kasbon)
  VALUES (
    p_job_id, 'ganti_driver', v_job.unit_id, NULL, v_job.driver_id, p_driver_baru_id,
    NULL, NULL, v_job.status_job::text, btrim(p_alasan), auth.uid(),
    COALESCE(p_dikembalikan, 0), COALESCE(p_kasbon, 0))
  RETURNING id INTO v_id;

  -- Uang jalan & kasbon dicatat atas nama supir LAMA (sebelum driver diganti).
  PERFORM transport._catat_pengembalian_kasbon(v_job, v_id, 'ganti_driver', p_dikembalikan, p_sumber_dana_id, p_kasbon);

  UPDATE transport.jobs SET driver_id = p_driver_baru_id, updated_at = now() WHERE id = p_job_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION transport.ganti_driver_job(UUID, UUID, TEXT, BIGINT, UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.ganti_driver_job(UUID, UUID, TEXT, BIGINT, UUID, BIGINT) TO authenticated;

-- ── 7. Ganti unit trailer (job & proyek sama) ───────────────────────────────
CREATE OR REPLACE FUNCTION transport.ganti_trailer_job(
  p_job_id            UUID,
  p_trailer_baru_id   UUID,
  p_alasan            TEXT,
  p_insiden_tanggal   TIMESTAMPTZ,
  p_insiden_lokasi    TEXT,
  p_insiden_deskripsi TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_job transport.jobs%ROWTYPE;
  v_id  UUID;
BEGIN
  v_job := transport._job_untuk_penggantian(p_job_id, p_alasan);
  IF v_job.unit_trailer_id IS NULL THEN
    RAISE EXCEPTION 'Job % tidak memakai unit trailer.', v_job.job_number USING ERRCODE = 'check_violation';
  END IF;
  IF p_trailer_baru_id IS NULL OR p_trailer_baru_id = v_job.unit_trailer_id THEN
    RAISE EXCEPTION 'Pilih unit trailer pengganti yang berbeda.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_insiden_tanggal IS NULL OR btrim(COALESCE(p_insiden_deskripsi, '')) = '' THEN
    RAISE EXCEPTION 'Tanggal & deskripsi insiden unit trailer wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO transport.job_ganti_unit (
    job_id, jenis, unit_lama_id, driver_lama_id, unit_trailer_lama_id, unit_trailer_baru_id,
    status_job_saat_ganti, alasan, diganti_oleh)
  VALUES (
    p_job_id, 'ganti_trailer', v_job.unit_id, v_job.driver_id, v_job.unit_trailer_id, p_trailer_baru_id,
    v_job.status_job::text, btrim(p_alasan), auth.uid())
  RETURNING id INTO v_id;

  -- Kecocokan jenis & status trailer dijaga trigger jobs_cek_unit_trailer;
  -- status trailer lama/baru disinkronkan trigger trg_sync_unit_trailer_status.
  UPDATE transport.jobs SET unit_trailer_id = p_trailer_baru_id, updated_at = now() WHERE id = p_job_id;

  -- Trailer lama rusak → insiden kerusakan (status trailer ikut alur insiden).
  INSERT INTO transport.incident_logs (unit_trailer_id, job_id, tipe, tanggal, lokasi, deskripsi, created_by)
  VALUES (v_job.unit_trailer_id, p_job_id, 'kerusakan', p_insiden_tanggal,
          NULLIF(btrim(COALESCE(p_insiden_lokasi, '')), ''), btrim(p_insiden_deskripsi), auth.uid());
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION transport.ganti_trailer_job(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.ganti_trailer_job(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;

-- ── 8. Ganti unit → job pengganti di proyek yang sama ───────────────────────
-- `p_job_baru` disiapkan backend (rute, ETA, unit, driver, trailer, ETD,
-- uang jalan awal). Proyek, penawaran, dan item penawaran diambil dari job lama.
CREATE OR REPLACE FUNCTION transport.ganti_unit_job_baru(
  p_job_id            UUID,
  p_job_baru          JSONB,
  p_alasan            TEXT,
  p_insiden_tanggal   TIMESTAMPTZ,
  p_insiden_lokasi    TEXT,
  p_insiden_deskripsi TEXT,
  p_dikembalikan      BIGINT DEFAULT 0,
  p_sumber_dana_id    UUID DEFAULT NULL,
  p_kasbon            BIGINT DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_job   transport.jobs%ROWTYPE;
  v_isi   transport.jobs%ROWTYPE;
  v_baru  transport.jobs%ROWTYPE;
  v_unit  transport.units%ROWTYPE;
  v_lain  TEXT;
  v_id    UUID;
BEGIN
  v_job := transport._job_untuk_penggantian(p_job_id, p_alasan);
  IF p_insiden_tanggal IS NULL OR btrim(COALESCE(p_insiden_deskripsi, '')) = '' THEN
    RAISE EXCEPTION 'Tanggal & deskripsi insiden unit wajib diisi.' USING ERRCODE = 'check_violation';
  END IF;
  v_isi := jsonb_populate_record(NULL::transport.jobs, p_job_baru);

  -- Unit pengganti: beda dari unit sekarang, Standby, tidak dipakai job lain.
  SELECT * INTO v_unit FROM transport.units WHERE id = v_isi.unit_id AND status = 1 FOR UPDATE;
  IF v_unit.id IS NULL OR NOT transport.can_access_unit(v_unit.id) THEN
    RAISE EXCEPTION 'Unit pengganti tidak ditemukan atau di luar scope akses Anda.' USING ERRCODE = 'P0002';
  END IF;
  IF v_unit.id = v_job.unit_id THEN
    RAISE EXCEPTION 'Unit pengganti tidak boleh sama dengan unit yang rusak.' USING ERRCODE = 'check_violation';
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
  IF v_isi.driver_id IS DISTINCT FROM v_job.driver_id THEN
    PERFORM transport._cek_driver_pengganti(v_isi.driver_id, p_job_id);
  END IF;

  -- Riwayat dulu (id-nya dipakai kasbon), lalu pengembalian & kasbon ke job
  -- LAMA atas nama supir lama — sebelum job lama ditutup.
  INSERT INTO transport.job_ganti_unit (
    job_id, jenis, unit_lama_id, unit_baru_id, driver_lama_id, driver_baru_id,
    unit_trailer_lama_id, unit_trailer_baru_id, status_job_saat_ganti, alasan, diganti_oleh,
    uang_jalan_dikembalikan, kasbon)
  VALUES (
    p_job_id, 'ganti_unit', v_job.unit_id, v_unit.id, v_job.driver_id, v_isi.driver_id,
    v_job.unit_trailer_id, v_isi.unit_trailer_id, v_job.status_job::text, btrim(p_alasan), auth.uid(),
    COALESCE(p_dikembalikan, 0), COALESCE(p_kasbon, 0))
  RETURNING id INTO v_id;
  PERFORM transport._catat_pengembalian_kasbon(v_job, v_id, 'ganti_unit', p_dikembalikan, p_sumber_dana_id, p_kasbon);

  -- Job lama ditutup SELESAI (bukan dibatalkan): uang jalan yang sudah cair
  -- tetap dihitung sebagai biaya job lama. Ditutup sebelum job baru dibuat
  -- supaya driver yang sama boleh langsung memegang job pengganti.
  UPDATE transport.jobs
     SET status_job = 'selesai', validated_at = now(), validated_by = auth.uid(),
         validation_note = 'Unit rusak', updated_at = now()
   WHERE id = p_job_id;

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

  UPDATE transport.jobs SET validation_note = 'Unit rusak - diganti ' || v_baru.job_number WHERE id = p_job_id;
  UPDATE transport.job_ganti_unit SET job_pengganti_id = v_baru.id WHERE id = v_id;

  -- Unit lama rusak → insiden kerusakan. Dicatat SETELAH job lama ditutup:
  -- penutupan mengembalikan unit ke Standby, lalu insiden menjadikannya Breakdown.
  INSERT INTO transport.incident_logs (unit_id, job_id, tipe, tanggal, lokasi, deskripsi, created_by)
  VALUES (v_job.unit_id, p_job_id, 'kerusakan', p_insiden_tanggal,
          NULLIF(btrim(COALESCE(p_insiden_lokasi, '')), ''), btrim(p_insiden_deskripsi), auth.uid());
  RETURN v_baru.id;
END;
$$;
REVOKE ALL ON FUNCTION transport.ganti_unit_job_baru(UUID, JSONB, TEXT, TIMESTAMPTZ, TEXT, TEXT, BIGINT, UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.ganti_unit_job_baru(UUID, JSONB, TEXT, TIMESTAMPTZ, TEXT, TEXT, BIGINT, UUID, BIGINT) TO authenticated;

-- Ganti truk lama (unit diganti di job yang sama) tidak dipakai lagi.
REVOKE EXECUTE ON FUNCTION transport.ganti_unit_job(UUID, UUID, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) FROM authenticated;

-- ── 9. Tagihan: job yang sudah diganti tidak ditagihkan ─────────────────────
CREATE OR REPLACE FUNCTION transport.invoice_item_cek_proyek()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_inv      transport.invoices%ROWTYPE;
  v_pengganti TEXT;
BEGIN
  IF NEW.job_id IS NULL OR NEW.status <> 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.job_id IS NOT DISTINCT FROM OLD.job_id AND OLD.status = 1 THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_inv FROM transport.invoices WHERE id = NEW.invoice_id;
  IF v_inv.id IS NULL OR v_inv.status <> 1 OR v_inv.status_tagihan = 'batal' THEN
    RETURN NEW;
  END IF;
  -- BATASAN: job lama yang unitnya rusak & sudah diganti tidak ditagih —
  -- yang ditagih job penggantinya.
  SELECT j.job_number INTO v_pengganti FROM transport.jobs j
   WHERE j.menggantikan_job_id = NEW.job_id AND j.status = 1 LIMIT 1;
  IF v_pengganti IS NOT NULL THEN
    RAISE EXCEPTION 'Job ini sudah diganti % (unit rusak) — tagihkan job penggantinya.', v_pengganti
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM transport._cek_proyek_satu_tagihan(NEW.job_id, NEW.invoice_id);
  RETURN NEW;
END;
$$;

-- ── 10. Laporan laba ────────────────────────────────────────────────────────
-- kosongan = proyek tanpa customer → tidak ditagih, biayanya cost perusahaan.
-- diganti  = job lama yang unitnya rusak → tidak ditagih (yang ditagih job
--            penggantinya); biaya uang jalannya tetap dihitung.
-- uang_jalan = cair bersih (pencairan − pengembalian − kasbon).
DROP FUNCTION IF EXISTS transport.get_job_profitability(DATE, DATE);
CREATE OR REPLACE FUNCTION transport.get_job_profitability(p_start DATE DEFAULT NULL, p_end DATE DEFAULT NULL)
 RETURNS TABLE(job_id uuid, job_number text, customer_nama text, unit_kode text, etd timestamp with time zone,
               status transport.job_status, pendapatan bigint, uang_jalan bigint, biaya_insiden bigint, laba bigint,
               proyek_nomor text, kosongan boolean, diganti_oleh text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'transport', 'extensions'
AS $function$
  SELECT
    j.id,
    j.job_number,
    COALESCE(c.nama_perusahaan, 'Tanpa customer'),
    u.kode_unit,
    j.etd,
    j.status_job,
    COALESCE(inv.pendapatan, 0)      AS pendapatan,
    COALESCE(uj.bersih, 0)           AS uang_jalan,
    COALESCE(ins.biaya, 0)           AS biaya_insiden,
    COALESCE(inv.pendapatan, 0)
      - COALESCE(uj.bersih, 0)
      - COALESCE(ins.biaya, 0)       AS laba,
    p.nomor_proyek,
    p.customer_id IS NULL,
    pg.job_number
  FROM transport.jobs j
  JOIN transport.proyek p ON p.id = j.proyek_id
  LEFT JOIN transport.customers c ON c.id = p.customer_id
  JOIN transport.units u ON u.id = j.unit_id
  LEFT JOIN LATERAL (
    SELECT g.job_number FROM transport.jobs g
     WHERE g.menggantikan_job_id = j.id AND g.status = 1 LIMIT 1
  ) pg ON true
  LEFT JOIN LATERAL (
    SELECT SUM(ii.subtotal) AS pendapatan
    FROM transport.invoice_items ii
    JOIN transport.invoices i ON i.id = ii.invoice_id
    WHERE ii.job_id = j.id AND ii.status = 1 AND i.status = 1 AND i.status_tagihan <> 'batal'
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT SUM(CASE WHEN x.jenis = 'pencairan' THEN x.jumlah ELSE -x.jumlah END) AS bersih
    FROM transport.uang_jalan x
    WHERE x.job_id = j.id AND x.status = 1 AND x.jenis IN ('pencairan', 'pengembalian', 'kasbon')
  ) uj ON true
  LEFT JOIN LATERAL (
    SELECT SUM(COALESCE(n.biaya_repair, 0)) AS biaya
    FROM transport.incident_logs n
    WHERE n.job_id = j.id AND n.status = 1
  ) ins ON true
  WHERE j.status = 1
    AND (p_start IS NULL OR j.etd >= p_start::TIMESTAMPTZ)
    AND (p_end   IS NULL OR j.etd <  (p_end + 1)::TIMESTAMPTZ)
    AND j.status_job <> 'cancelled'
  ORDER BY j.etd DESC;
$function$;

-- ── 11. Daftar proyek: + unit & nomor penawaran ─────────────────────────────
DROP FUNCTION IF EXISTS transport.daftar_proyek(TEXT, UUID, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION transport.daftar_proyek(
  p_q              TEXT    DEFAULT NULL,
  p_customer_id    UUID    DEFAULT NULL,
  p_tanpa_customer BOOLEAN DEFAULT false,
  p_bulan          INTEGER DEFAULT NULL,
  p_tahun          INTEGER DEFAULT NULL,
  p_status_tagih   TEXT    DEFAULT NULL,
  p_limit          INTEGER DEFAULT 10,
  p_offset         INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                 UUID,
  nomor_proyek       TEXT,
  customer_id        UUID,
  customer_nama      TEXT,
  pic_nama           TEXT,
  pic_no_hp          TEXT,
  created_by_nama    TEXT,
  created_at         TIMESTAMPTZ,
  jumlah_job         INTEGER,
  jumlah_job_selesai INTEGER,
  jumlah_job_batal   INTEGER,
  invoice_id         UUID,
  invoice_number     TEXT,
  unit_kode          TEXT,
  quote_number       TEXT,
  total              BIGINT
)
LANGUAGE sql
STABLE
SET search_path = transport, extensions
AS $$
  WITH tagihan AS (
    -- Tagihan aktif (tidak batal) per proyek — maksimal satu.
    SELECT DISTINCT ON (j.proyek_id) j.proyek_id, i.id AS invoice_id, i.invoice_number
      FROM transport.invoice_items it
      JOIN transport.invoices i ON i.id = it.invoice_id
      JOIN transport.jobs j ON j.id = it.job_id
     WHERE it.status = 1 AND i.status = 1 AND i.status_tagihan <> 'batal' AND j.status = 1
     ORDER BY j.proyek_id, i.created_at
  ),
  hitung AS (
    SELECT j.proyek_id,
           count(*)::INTEGER AS jumlah_job,
           count(*) FILTER (WHERE j.status_job = 'selesai')::INTEGER AS jumlah_job_selesai,
           count(*) FILTER (WHERE j.status_job = 'cancelled')::INTEGER AS jumlah_job_batal,
           -- Unit proyek (bisa lebih dari satu setelah ganti unit), urut dipakai.
           string_agg(DISTINCT u.kode_unit, ', ') AS unit_kode,
           (array_agg(q.quote_number ORDER BY j.created_at) FILTER (WHERE q.quote_number IS NOT NULL))[1] AS quote_number
      FROM transport.jobs j
      JOIN transport.units u ON u.id = j.unit_id
      LEFT JOIN transport.quotations q ON q.id = j.quotation_id
     WHERE j.status = 1
     GROUP BY j.proyek_id
  ),
  kata AS (
    SELECT NULLIF(btrim(COALESCE(p_q, '')), '') AS q
  )
  SELECT p.id, p.nomor_proyek, p.customer_id, c.nama_perusahaan, p.pic_nama, p.pic_no_hp,
         pr.nama, p.created_at,
         COALESCE(h.jumlah_job, 0), COALESCE(h.jumlah_job_selesai, 0), COALESCE(h.jumlah_job_batal, 0),
         t.invoice_id, t.invoice_number, h.unit_kode, h.quote_number,
         count(*) OVER ()
    FROM transport.proyek p
    LEFT JOIN transport.customers c ON c.id = p.customer_id
    LEFT JOIN transport.profiles pr ON pr.id = p.created_by
    LEFT JOIN hitung h ON h.proyek_id = p.id
    LEFT JOIN tagihan t ON t.proyek_id = p.id
    CROSS JOIN kata
   WHERE p.status = 1
     AND (p_customer_id IS NULL OR p.customer_id = p_customer_id)
     AND (NOT COALESCE(p_tanpa_customer, false) OR p.customer_id IS NULL)
     AND (p_bulan IS NULL OR EXTRACT(MONTH FROM p.created_at AT TIME ZONE 'Asia/Jakarta') = p_bulan)
     AND (p_tahun IS NULL OR EXTRACT(YEAR FROM p.created_at AT TIME ZONE 'Asia/Jakarta') = p_tahun)
     AND (p_status_tagih IS NULL
          OR (p_status_tagih = 'sudah' AND t.invoice_id IS NOT NULL)
          OR (p_status_tagih = 'belum' AND t.invoice_id IS NULL))
     AND (kata.q IS NULL
          OR p.nomor_proyek ILIKE '%' || kata.q || '%'
          OR c.nama_perusahaan ILIKE '%' || kata.q || '%'
          OR p.pic_nama ILIKE '%' || kata.q || '%'
          OR h.unit_kode ILIKE '%' || kata.q || '%'
          OR h.quote_number ILIKE '%' || kata.q || '%'
          OR EXISTS (SELECT 1 FROM transport.jobs j
                      WHERE j.proyek_id = p.id AND j.status = 1
                        AND j.job_number ILIKE '%' || kata.q || '%'))
   ORDER BY p.created_at DESC, p.nomor_proyek DESC
   LIMIT CASE WHEN p_limit IS NULL OR p_limit < 0 THEN 5000 ELSE LEAST(p_limit, 5000) END
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
REVOKE ALL ON FUNCTION transport.daftar_proyek(TEXT, UUID, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.daftar_proyek(TEXT, UUID, BOOLEAN, INTEGER, INTEGER, TEXT, INTEGER, INTEGER)
  TO authenticated, service_role;

-- ── 11b. Portal driver membaca proyek job miliknya ──────────────────────────
-- Perbaikan policy 20261001000012: portal driver tersambung sebagai role anon
-- + header token driver (current_driver_id), bukan authenticated. Tanpa ini
-- customer, PIC lapangan & No HP PIC kosong di aplikasi driver.
DROP POLICY IF EXISTS "driver_baca_proyek_job_sendiri" ON transport.proyek;
CREATE POLICY "driver_baca_proyek_job_sendiri" ON transport.proyek FOR SELECT
  USING (proyek.status = 1 AND EXISTS (
    SELECT 1 FROM transport.jobs j
     WHERE j.proyek_id = proyek.id AND j.driver_id = transport.current_driver_id() AND j.status = 1
  ));

-- ── 12. Label log sistem (disalin dari 20261001000012 + baris baru) ─────────
CREATE OR REPLACE FUNCTION transport._log_label(p_tabel TEXT, p_baris JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = transport, extensions
AS $$
  SELECT CASE p_tabel
    WHEN 'transport.customers'           THEN 'Customer '             || COALESCE(p_baris ->> 'nama_perusahaan', '')
    WHEN 'transport.drivers'             THEN 'Driver '               || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.units'               THEN 'Unit '                 || COALESCE(p_baris ->> 'kode_unit', '')
    WHEN 'transport.unit_trailer'        THEN 'Unit Trailer '         || COALESCE(p_baris ->> 'kode_trailer', '')
    WHEN 'transport.jenis_unit_trailer'  THEN 'Jenis Unit Trailer '   || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.jenis_unit'          THEN 'Jenis Unit '           || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.jobs'                THEN 'Job '                  || COALESCE(p_baris ->> 'job_number', '')
    WHEN 'transport.job_ganti_unit'      THEN 'Penggantian Job ('     || replace(COALESCE(p_baris ->> 'jenis', 'ganti_truk'), '_', ' ') || ')'
    WHEN 'transport.job_photos'          THEN 'Foto Job '             || COALESCE(p_baris ->> 'stage', '') || COALESCE(' ' || (p_baris ->> 'slot'), '')
    WHEN 'transport.incident_logs'       THEN 'Insiden '              || COALESCE(p_baris ->> 'tipe', '')
    WHEN 'transport.incident_photos'     THEN 'Foto Insiden'
    WHEN 'transport.service_records'     THEN 'Servis Unit '          || COALESCE(p_baris ->> 'jenis', '')
    WHEN 'transport.quotations'          THEN 'Penawaran '            || COALESCE(p_baris ->> 'quote_number', '')
    WHEN 'transport.invoices'            THEN 'Tagihan '              || COALESCE(p_baris ->> 'invoice_number', '')
    WHEN 'transport.invoice_payments'    THEN 'Pembayaran Tagihan Rp ' || COALESCE(p_baris ->> 'jumlah', '')
    WHEN 'transport.uang_jalan'          THEN 'Uang Jalan '           || COALESCE(p_baris ->> 'jenis', '') || ' Rp ' || COALESCE(p_baris ->> 'jumlah', '')
    WHEN 'transport.uang_jalan_requests' THEN 'Pengajuan Uang Jalan Rp ' || COALESCE(p_baris ->> 'nominal', '')
    WHEN 'transport.sumber_dana'         THEN 'Sumber Dana '          || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.profiles'            THEN 'Pengguna '             || COALESCE(p_baris ->> 'email', '')
    WHEN 'transport.penjualan_unit'      THEN 'Penjualan '            || COALESCE(p_baris ->> 'nama_pembeli', '')
    WHEN 'transport.penghapusan_aset'    THEN 'Penghapusan '          || COALESCE(p_baris ->> 'jenis_aset', '')
    WHEN 'hr.karyawan'                   THEN 'Karyawan '             || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.asuransi'                 THEN 'Asuransi '              || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.asuransi_pic'             THEN 'PIC Asuransi '          || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.asuransi_bengkel_rekanan' THEN 'Bengkel Rekanan '       || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.polis_asuransi'           THEN 'Polis Asuransi '        || COALESCE(p_baris ->> 'nomor_polis', '')
    WHEN 'transport.bengkel'                  THEN 'Bengkel '               || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.mekanik'                  THEN 'Mekanik'
    WHEN 'transport.perintah_kerja'           THEN 'Perintah Kerja '        || COALESCE(p_baris ->> 'nomor', '')
    WHEN 'transport.perintah_kerja_mekanik'   THEN 'Mekanik Perintah Kerja'
    WHEN 'transport.perintah_kerja_jasa'      THEN 'Jasa Perintah Kerja '   || COALESCE(p_baris ->> 'uraian', '')
    WHEN 'transport.perintah_kerja_sparepart' THEN 'Sparepart Perintah Kerja ' || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.perintah_kerja_biaya_lain' THEN 'Biaya Lain Perintah Kerja ' || COALESCE(p_baris ->> 'uraian', '')
    WHEN 'transport.perintah_kerja_foto'      THEN 'Foto Perintah Kerja'
    WHEN 'transport.klaim_asuransi'           THEN 'Klaim Asuransi '        || COALESCE(p_baris ->> 'nomor_klaim', '')
    WHEN 'transport.approval_fitur'           THEN 'Mode Approval '         || COALESCE(p_baris ->> 'nama', '')
    WHEN 'transport.approver'                 THEN 'Approver '              || COALESCE(p_baris ->> 'fitur_kode', '')
    WHEN 'transport.proyek'                   THEN 'Proyek '                || COALESCE(p_baris ->> 'nomor_proyek', '')
    -- Baru (20261001000014)
    WHEN 'transport.kasbon_driver'            THEN 'Kasbon Supir Rp '       || COALESCE(p_baris ->> 'jumlah', '')
  END;
$$;

NOTIFY pgrst, 'reload schema';
