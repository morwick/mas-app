-- ============================================================================
-- Migration 20261003000004: aturan waktu muat & bongkar + insiden saat job
--
-- 1. jobs.muat_at / jobs.bongkar_at (trigger jobs_catat_muat_bongkar):
--      muat_at    = saat job pertama kali sampai tahap Loading (sampai lokasi
--                   muat), sesuai riwayat status;
--      bongkar_at = saat job pertama kali sampai tahap Unloading (sampai
--                   lokasi bongkar), sesuai riwayat status.
--    BATASAN: sekali terisi tidak pernah diubah / dikosongkan lagi — termasuk
--    bila admin mengembalikan job ke tahap sebelum muat / bongkar saat
--    validasi. (Sebelumnya dikosongkan lalu diisi ulang.)
--
-- 2. Ganti unit (ganti_unit_job_baru) — job lama yang ditutup:
--      muat & bongkar sudah terisi   → tidak diubah;
--      muat & bongkar belum terisi   → keduanya = tanggal insiden;
--      muat terisi, bongkar belum    → bongkar = tanggal insiden.
--
-- 3. Insiden:
--    * Insiden yang dicatat saat unit sedang bertugas otomatis dikaitkan ke
--      job aktif unit itu (job_id; trigger incident_isi_job_aktif). Unit
--      menjadi Breakdown; bila insiden selesai (termasuk tanpa perbaikan)
--      unit kembali Bertugas dan job lanjut (trigger incident_sync_status_unit).
--    * Kolom baru incident_logs.ganti_unit_id: insiden yang dipakai /
--      dicatat oleh Ganti unit di job. BATASAN: tidak bisa dihapus, dan
--      job_id / ganti_unit_id-nya tidak bisa diubah (incident_kunci_ganti_unit).
--    * Ganti unit bisa memakai insiden terbuka yang sudah dicatat untuk job
--      itu (parameter baru p_insiden_id) — tanpa membuat insiden baru.
--
-- PERUBAHAN DATA (butuh sesi log — superadmin aktif pertama):
--   * insiden ganti unit lama diberi ganti_unit_id (dicocokkan dari job, unit
--     lama, dan waktu pencatatan yang sama dengan riwayat gantinya);
--   * job lama yang sudah ditutup karena ganti unit diisi muat/bongkar-nya
--     sesuai aturan no. 2, memakai tanggal insiden ganti unitnya.
-- WAJIB: jalankan setelah 20261003000003. Naikkan backend & frontend
-- bersamaan. Aman dijalankan ulang.
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Waktu muat & bongkar: isi sekali, tidak pernah dikosongkan ───────────
CREATE OR REPLACE FUNCTION transport.jobs_catat_muat_bongkar()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = transport, extensions
AS $$
BEGIN
  -- BATASAN: hanya mengisi yang masih kosong. Job yang dikembalikan admin ke
  -- tahap sebelumnya tetap memakai waktu muat / bongkar pertama.
  -- Admin yang melompati tahap (mis. langsung Dalam perjalanan) tetap mengisi
  -- waktu muat saat itu.
  IF NEW.muat_at IS NULL
     AND NEW.status_job IN ('loading', 'dalam_perjalanan', 'unloading', 'serah_terima_pool', 'menunggu_validasi') THEN
    NEW.muat_at := now();
  END IF;
  IF NEW.bongkar_at IS NULL
     AND NEW.status_job IN ('unloading', 'serah_terima_pool', 'menunggu_validasi') THEN
    NEW.bongkar_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.jobs_catat_muat_bongkar() FROM PUBLIC, anon, authenticated;

-- ── 2. Insiden ─────────────────────────────────────────────────────────────
-- Sisa rancangan sebelumnya yang tidak dipakai lagi (aman bila belum ada).
DROP TRIGGER IF EXISTS trg_incident_cek_unit_bertugas ON transport.incident_logs;
DROP FUNCTION IF EXISTS transport.incident_cek_unit_bertugas();
DROP TRIGGER IF EXISTS trg_incident_kunci_job ON transport.incident_logs;
DROP FUNCTION IF EXISTS transport.incident_kunci_job();

ALTER TABLE transport.incident_logs
  ADD COLUMN IF NOT EXISTS ganti_unit_id UUID REFERENCES transport.job_ganti_unit(id);
COMMENT ON COLUMN transport.incident_logs.ganti_unit_id IS
  'Riwayat ganti unit yang memakai / mencatat insiden ini. Terisi = insiden tidak bisa dihapus.';
CREATE INDEX IF NOT EXISTS idx_incident_logs_ganti_unit
  ON transport.incident_logs (ganti_unit_id) WHERE ganti_unit_id IS NOT NULL;

-- Insiden unit yang sedang bertugas → dikaitkan ke job aktifnya.
CREATE OR REPLACE FUNCTION transport.incident_isi_job_aktif()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF NEW.unit_id IS NOT NULL AND NEW.job_id IS NULL THEN
    SELECT j.id INTO NEW.job_id
      FROM transport.jobs j
     WHERE j.unit_id = NEW.unit_id AND j.status = 1
       AND j.status_job NOT IN ('selesai', 'cancelled')
     ORDER BY j.etd
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.incident_isi_job_aktif() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_incident_isi_job_aktif ON transport.incident_logs;
CREATE TRIGGER trg_incident_isi_job_aktif
  BEFORE INSERT ON transport.incident_logs
  FOR EACH ROW EXECUTE FUNCTION transport.incident_isi_job_aktif();

CREATE OR REPLACE FUNCTION transport.incident_kunci_ganti_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = transport, extensions
AS $$
BEGIN
  IF OLD.ganti_unit_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- BATASAN: insiden dari pergantian unit tidak bisa dihapus (data lengkap).
  IF OLD.status = 1 AND NEW.status = 2 THEN
    RAISE EXCEPTION 'Insiden ini tercatat dari pergantian unit di job dan tidak bisa dihapus.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- BATASAN: kaitannya ke job & riwayat ganti unit tidak bisa diubah.
  IF NEW.job_id IS DISTINCT FROM OLD.job_id OR NEW.ganti_unit_id IS DISTINCT FROM OLD.ganti_unit_id THEN
    RAISE EXCEPTION 'Job terkait insiden dari pergantian unit tidak bisa diubah.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION transport.incident_kunci_ganti_unit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_incident_kunci_ganti_unit ON transport.incident_logs;
CREATE TRIGGER trg_incident_kunci_ganti_unit
  BEFORE UPDATE OF status, job_id, ganti_unit_id ON transport.incident_logs
  FOR EACH ROW EXECUTE FUNCTION transport.incident_kunci_ganti_unit();

-- ── 3. Ganti unit: insiden terdaftar / baru + muat/bongkar job lama ────────
-- Salinan definisi 20261001000014 dengan perubahan: parameter p_insiden_id,
-- insiden ditandai ganti_unit_id, dan muat_at / bongkar_at job lama.
DROP FUNCTION IF EXISTS transport.ganti_unit_job_baru(UUID, JSONB, TEXT, TIMESTAMPTZ, TEXT, TEXT, BIGINT, UUID, BIGINT);
CREATE OR REPLACE FUNCTION transport.ganti_unit_job_baru(
  p_job_id            UUID,
  p_job_baru          JSONB,
  p_alasan            TEXT,
  p_insiden_tanggal   TIMESTAMPTZ,
  p_insiden_lokasi    TEXT,
  p_insiden_deskripsi TEXT,
  p_dikembalikan      BIGINT DEFAULT 0,
  p_sumber_dana_id    UUID DEFAULT NULL,
  p_kasbon            BIGINT DEFAULT 0,
  p_insiden_id        UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_job      transport.jobs%ROWTYPE;
  v_isi      transport.jobs%ROWTYPE;
  v_baru     transport.jobs%ROWTYPE;
  v_unit     transport.units%ROWTYPE;
  v_insiden  transport.incident_logs%ROWTYPE;
  v_tanggal  TIMESTAMPTZ;
  v_lain     TEXT;
  v_id       UUID;
BEGIN
  v_job := transport._job_untuk_penggantian(p_job_id, p_alasan);
  IF p_insiden_id IS NOT NULL THEN
    -- BATASAN: insiden terdaftar harus milik job & unit ini, belum selesai,
    -- dan belum dipakai pergantian unit lain.
    SELECT * INTO v_insiden FROM transport.incident_logs
     WHERE id = p_insiden_id AND status = 1 FOR UPDATE;
    IF v_insiden.id IS NULL OR v_insiden.job_id IS DISTINCT FROM p_job_id
       OR v_insiden.unit_id IS DISTINCT FROM v_job.unit_id THEN
      RAISE EXCEPTION 'Insiden yang dipilih bukan insiden unit job %.', v_job.job_number
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_insiden.status_penanganan = 'resolved' OR v_insiden.ganti_unit_id IS NOT NULL THEN
      RAISE EXCEPTION 'Insiden yang dipilih sudah selesai atau sudah dipakai pergantian unit.'
        USING ERRCODE = 'check_violation';
    END IF;
    v_tanggal := v_insiden.tanggal;
  ELSE
    IF p_insiden_tanggal IS NULL OR btrim(COALESCE(p_insiden_deskripsi, '')) = '' THEN
      RAISE EXCEPTION 'Tanggal & deskripsi insiden unit wajib diisi.' USING ERRCODE = 'check_violation';
    END IF;
    v_tanggal := p_insiden_tanggal;
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

  -- Riwayat dulu (id-nya dipakai kasbon & insiden), lalu pengembalian &
  -- kasbon ke job LAMA atas nama supir lama — sebelum job lama ditutup.
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
  -- BATASAN waktu muat/bongkar job lama: yang sudah terisi tidak diubah;
  -- belum muat → muat & bongkar = tanggal insiden; sudah muat tapi belum
  -- bongkar → bongkar = tanggal insiden.
  UPDATE transport.jobs
     SET status_job = 'selesai', validated_at = now(), validated_by = auth.uid(),
         validation_note = 'Unit rusak', updated_at = now(),
         muat_at = CASE WHEN muat_at IS NULL AND bongkar_at IS NULL THEN v_tanggal ELSE muat_at END,
         bongkar_at = CASE WHEN bongkar_at IS NULL THEN v_tanggal ELSE bongkar_at END
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

  -- Insiden unit lama: ditandai / dicatat SETELAH job lama ditutup —
  -- penutupan mengembalikan unit ke Standby, lalu insiden terbuka menjadikannya
  -- Breakdown lagi (trigger incident_sync_status_unit).
  -- BATASAN: ganti_unit_id terisi → insiden tidak bisa dihapus.
  IF v_insiden.id IS NOT NULL THEN
    UPDATE transport.incident_logs SET ganti_unit_id = v_id WHERE id = v_insiden.id;
  ELSE
    INSERT INTO transport.incident_logs (unit_id, job_id, ganti_unit_id, tipe, tanggal, lokasi, deskripsi, created_by)
    VALUES (v_job.unit_id, p_job_id, v_id, 'kerusakan', p_insiden_tanggal,
            NULLIF(btrim(COALESCE(p_insiden_lokasi, '')), ''), btrim(p_insiden_deskripsi), auth.uid());
  END IF;
  RETURN v_baru.id;
END;
$$;
REVOKE ALL ON FUNCTION transport.ganti_unit_job_baru(UUID, JSONB, TEXT, TIMESTAMPTZ, TEXT, TEXT, BIGINT, UUID, BIGINT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.ganti_unit_job_baru(UUID, JSONB, TEXT, TIMESTAMPTZ, TEXT, TEXT, BIGINT, UUID, BIGINT, UUID) TO authenticated;

-- ── 4. Data lama ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_karyawan UUID;
  v_insiden  INTEGER;
  v_job      INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM transport.job_ganti_unit g
     WHERE g.status = 1 AND g.jenis IN ('ganti_unit', 'ganti_truk')
  ) THEN
    RETURN;
  END IF;
  SELECT p.karyawan_id INTO v_karyawan FROM transport.profiles p
   WHERE 'superadmin' = ANY (p.roles) AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_karyawan IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat perubahan data.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_karyawan, 'Migrasi 20261003000004');

  -- Insiden ganti unit/truk lama: dicatat di transaksi yang sama dengan
  -- riwayat gantinya (job, unit lama, dan waktu pencatatan sama).
  UPDATE transport.incident_logs i
     SET ganti_unit_id = g.id
    FROM transport.job_ganti_unit g
   WHERE i.ganti_unit_id IS NULL
     AND i.status = 1
     AND g.status = 1
     AND g.jenis IN ('ganti_unit', 'ganti_truk')
     AND i.job_id = g.job_id
     AND i.unit_id = g.unit_lama_id
     AND i.created_at = g.diganti_pada;
  GET DIAGNOSTICS v_insiden = ROW_COUNT;

  -- Job lama yang ditutup karena ganti unit: muat/bongkar sesuai aturan no. 2.
  UPDATE transport.jobs j
     SET muat_at = CASE WHEN j.muat_at IS NULL AND j.bongkar_at IS NULL THEN x.tanggal ELSE j.muat_at END,
         bongkar_at = COALESCE(j.bongkar_at, x.tanggal)
    FROM (SELECT DISTINCT ON (g.job_id) g.job_id, i.tanggal
            FROM transport.job_ganti_unit g
            JOIN transport.incident_logs i ON i.ganti_unit_id = g.id AND i.status = 1
           WHERE g.status = 1 AND g.jenis = 'ganti_unit'
           ORDER BY g.job_id, g.diganti_pada) x
   WHERE j.id = x.job_id
     AND j.status = 1
     AND j.bongkar_at IS NULL;
  GET DIAGNOSTICS v_job = ROW_COUNT;

  PERFORM transport.selesai_sesi_manual();
  RAISE NOTICE 'Insiden ganti unit ditandai: %, job lama diisi muat/bongkar: %', v_insiden, v_job;
END $$;

NOTIFY pgrst, 'reload schema';
