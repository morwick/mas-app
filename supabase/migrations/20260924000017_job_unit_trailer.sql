-- ============================================================================
-- Migration 20260924000017: Unit Trailer pada Job
--
-- jobs.unit_trailer_id → unit_trailer(id).
--
-- Aturan (dijaga database, jadi berlaku walau form dilewati):
--   * Jenis unit dari unit yang dipilih PUNYA jenis unit trailer (aktif)
--       → unit trailer WAJIB diisi, dan harus trailer yang jenis unit
--         trailernya terhubung ke jenis unit tersebut.
--   * Jenis unit TIDAK punya jenis unit trailer → unit trailer harus kosong.
--
-- Diperiksa saat job dibuat, dan saat unit / unit trailer job diubah. Job
-- lama yang tidak mengubah unit/trailer-nya (mis. hanya ganti status) tidak
-- ikut diperiksa, supaya tidak tiba-tiba gagal.
--
-- fungsi unit_trailer_untuk_jenis_unit() dipakai form job: apakah trailer
-- wajib + daftar trailer yang cocok (hanya baris aktif, status = 1).
-- ============================================================================

SET search_path = transport, extensions;

ALTER TABLE transport.jobs
  ADD COLUMN IF NOT EXISTS unit_trailer_id UUID REFERENCES transport.unit_trailer(id);
CREATE INDEX IF NOT EXISTS idx_jobs_unit_trailer ON transport.jobs (unit_trailer_id) WHERE status = 1;

CREATE OR REPLACE FUNCTION transport.jobs_cek_unit_trailer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_jenis_unit UUID;
  v_wajib BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.unit_id IS NOT DISTINCT FROM OLD.unit_id
     AND NEW.unit_trailer_id IS NOT DISTINCT FROM OLD.unit_trailer_id THEN
    RETURN NEW;
  END IF;

  SELECT u.jenis_unit_id INTO v_jenis_unit
    FROM transport.units u WHERE u.id = NEW.unit_id AND u.status = 1;

  v_wajib := EXISTS (
    SELECT 1 FROM transport.jenis_unit_trailer jt
     WHERE jt.jenis_unit_id = v_jenis_unit AND jt.status = 1);

  IF v_wajib AND NEW.unit_trailer_id IS NULL THEN
    RAISE EXCEPTION 'Unit trailer wajib dipilih untuk unit ini.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_wajib AND NEW.unit_trailer_id IS NOT NULL THEN
    RAISE EXCEPTION 'Unit yang dipilih tidak memakai unit trailer.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.unit_trailer_id IS NOT NULL AND NOT EXISTS (
       SELECT 1
         FROM transport.unit_trailer t
         JOIN transport.jenis_unit_trailer jt ON jt.id = t.jenis_unit_trailer_id
        WHERE t.id = NEW.unit_trailer_id
          AND t.status = 1
          AND jt.status = 1
          AND jt.jenis_unit_id = v_jenis_unit) THEN
    RAISE EXCEPTION 'Unit trailer tidak sesuai dengan jenis unit dari unit yang dipilih.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_cek_unit_trailer ON transport.jobs;
CREATE TRIGGER trg_jobs_cek_unit_trailer
  BEFORE INSERT OR UPDATE OF unit_id, unit_trailer_id ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_cek_unit_trailer();

-- ── Pilihan unit trailer untuk form job ─────────────────────────────────────
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
     WHERE t.status = 1 AND jt.status = 1
  )
  SELECT cek.wajib, trailer.id, trailer.kode_trailer, trailer.jenis_nama, trailer.status_trailer
    FROM cek LEFT JOIN trailer ON cek.wajib
   ORDER BY trailer.kode_trailer NULLS FIRST;
$$;
REVOKE ALL ON FUNCTION transport.unit_trailer_untuk_unit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.unit_trailer_untuk_unit(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
