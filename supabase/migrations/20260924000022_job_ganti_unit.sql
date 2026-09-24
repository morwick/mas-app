-- ============================================================================
-- Migration 20260924000022: Ganti Truk pada Job + riwayatnya
--
-- Kasus: truk rusak di tengah perjalanan → diganti truk lain; driver biasanya
-- ikut diganti (opsional).
--
-- Aturan (dijaga fungsi ganti_unit_job, satu transaksi):
--   * Hanya job yang sedang di perjalanan: loading, dalam_perjalanan, unloading.
--   * Truk baru: aktif, dalam scope pengguna, bukan truk yang sama, status
--     operasional Stand by, dan tidak sedang dipakai job lain yang berjalan.
--   * Driver baru (opsional, default driver lama): aktif, karyawannya aktif,
--     tidak sedang menjalankan job lain.
--   * Unit trailer mengikuti aturan migration 000017 (trigger jobs_cek_unit_trailer).
--   * Alasan wajib diisi.
--   * Truk lama otomatis → Perbaikan; truk baru → Bertugas.
--   * Riwayat disimpan di transport.job_ganti_unit (status 1/2, log sistem).
--
-- Perubahan data: tidak ada.
-- ============================================================================

SET search_path = transport, extensions;

CREATE TABLE IF NOT EXISTS transport.job_ganti_unit (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                UUID NOT NULL REFERENCES transport.jobs(id) ON DELETE CASCADE,
  unit_lama_id          UUID NOT NULL REFERENCES transport.units(id),
  unit_baru_id          UUID NOT NULL REFERENCES transport.units(id),
  driver_lama_id        UUID REFERENCES transport.drivers(id),
  driver_baru_id        UUID REFERENCES transport.drivers(id),
  unit_trailer_lama_id  UUID REFERENCES transport.unit_trailer(id),
  unit_trailer_baru_id  UUID REFERENCES transport.unit_trailer(id),
  status_job_saat_ganti TEXT NOT NULL,
  alasan                TEXT NOT NULL CHECK (btrim(alasan) <> ''),
  diganti_oleh          UUID REFERENCES transport.profiles(id),
  diganti_pada          TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                SMALLINT NOT NULL DEFAULT 1 CHECK (status IN (1, 2))
);
CREATE INDEX IF NOT EXISTS idx_job_ganti_unit_job ON transport.job_ganti_unit (job_id, diganti_pada) WHERE status = 1;

-- Soft delete (migration 20260924000007).
DROP TRIGGER IF EXISTS trg_soft_delete ON transport.job_ganti_unit;
CREATE TRIGGER trg_soft_delete BEFORE DELETE ON transport.job_ganti_unit
  FOR EACH ROW EXECUTE FUNCTION transport.soft_delete_instead();
DROP TRIGGER IF EXISTS trg_soft_delete_guard ON transport.job_ganti_unit;
CREATE TRIGGER trg_soft_delete_guard BEFORE UPDATE OF status ON transport.job_ganti_unit
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();
DROP TRIGGER IF EXISTS trg_soft_delete_cascade ON transport.job_ganti_unit;
CREATE TRIGGER trg_soft_delete_cascade AFTER UPDATE OF status ON transport.job_ganti_unit
  FOR EACH ROW WHEN (OLD.status = 1 AND NEW.status = 2)
  EXECUTE FUNCTION transport.soft_delete_propagate();

-- Log sistem.
DROP TRIGGER IF EXISTS trg_log_sistem ON transport.job_ganti_unit;
CREATE TRIGGER trg_log_sistem AFTER INSERT OR UPDATE ON transport.job_ganti_unit
  FOR EACH ROW EXECUTE FUNCTION transport.log_perubahan_data();

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
    WHEN 'transport.job_ganti_unit'      THEN 'Ganti Truk Job'
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
    WHEN 'hr.karyawan'                   THEN 'Karyawan '             || COALESCE(p_baris ->> 'nama', '')
  END;
$$;

-- ── Akses: baca sesuai akses job; tulis hanya lewat ganti_unit_job() ────────
ALTER TABLE transport.job_ganti_unit ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON transport.job_ganti_unit TO authenticated;
GRANT ALL ON transport.job_ganti_unit TO service_role;
REVOKE ALL ON transport.job_ganti_unit FROM anon;

DROP POLICY IF EXISTS "admin_read_job_ganti_unit" ON transport.job_ganti_unit;
CREATE POLICY "admin_read_job_ganti_unit"
  ON transport.job_ganti_unit FOR SELECT TO authenticated
  USING (transport.is_active_admin() AND transport.can_access_job(job_id));

-- ── Aksi Ganti Truk ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.ganti_unit_job(
  p_job_id               UUID,
  p_unit_baru_id         UUID,
  p_alasan               TEXT,
  p_driver_baru_id       UUID DEFAULT NULL,  -- NULL = driver tetap
  p_unit_trailer_baru_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
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

  SELECT * INTO v_job FROM transport.jobs WHERE id = p_job_id AND status = 1 FOR UPDATE;
  IF v_job.id IS NULL OR NOT transport.can_access_job(p_job_id) THEN
    RAISE EXCEPTION 'Job tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.status_job NOT IN ('loading', 'dalam_perjalanan', 'unloading') THEN
    RAISE EXCEPTION 'Ganti truk hanya bisa saat job di perjalanan (loading, dalam perjalanan, atau unloading).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Truk baru.
  SELECT * INTO v_unit FROM transport.units WHERE id = p_unit_baru_id AND status = 1;
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
    SELECT * INTO v_driver FROM transport.drivers WHERE id = v_driver_baru AND status = 1;
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

  -- Truk lama rusak → Perbaikan; truk baru → Bertugas.
  UPDATE transport.units SET status_operasional = 'perbaikan', updated_at = now()
   WHERE id = v_job.unit_id AND status = 1 AND status_operasional <> 'perbaikan';
  UPDATE transport.units SET status_operasional = 'bertugas', updated_at = now()
   WHERE id = v_unit.id AND status = 1;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION transport.ganti_unit_job(UUID, UUID, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.ganti_unit_job(UUID, UUID, TEXT, UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
