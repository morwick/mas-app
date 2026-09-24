-- ============================================================================
-- Migration 20260924000028: status unit "Terjual"
--
-- unit_status: standby / bertugas / perbaikan / terjual.
--   * Unit Terjual tidak bisa dipakai job (baru, edit, ganti truk) dan tidak
--     berubah otomatis menjadi Bertugas/Perbaikan oleh job atau insiden.
--   * Unit hanya bisa dijual bila tidak sedang punya job yang belum selesai
--     (bukan selesai / dibatalkan). Driver default-nya dilepas.
--   * Status Terjual masih bisa dikoreksi kembali ke Stand by (salah input).
--   * Laporan utilisasi: hari setelah terjual tidak dihitung sebagai hari
--     menganggur; unit yang sepanjang periode sudah terjual tidak ditampilkan.
--
-- Catatan: nilai enum baru dipakai di fungsi PL/pgSQL (dievaluasi saat
-- dipanggil), jadi aman walau SQL Editor menjalankan file ini dalam satu
-- transaksi. Perubahan data: tidak ada.
-- ============================================================================

SET search_path = transport, extensions;

ALTER TYPE transport.unit_status ADD VALUE IF NOT EXISTS 'terjual';

-- ── Job & insiden tidak menghidupkan unit terjual ───────────────────────────
CREATE OR REPLACE FUNCTION transport.sync_unit_status_with_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status_job NOT IN ('selesai', 'cancelled') THEN
    UPDATE units SET status_operasional = 'bertugas', updated_at = now()
     WHERE id = NEW.unit_id AND status = 1 AND status_operasional NOT IN ('perbaikan', 'terjual');
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status_job IS DISTINCT FROM NEW.status_job THEN
    IF NEW.status_job IN ('selesai', 'cancelled') THEN
      UPDATE units SET status_operasional = 'standby', updated_at = now()
       WHERE id = NEW.unit_id AND status = 1 AND status_operasional = 'bertugas';
    ELSIF OLD.status_job IN ('selesai', 'cancelled') THEN
      UPDATE units SET status_operasional = 'bertugas', updated_at = now()
       WHERE id = NEW.unit_id AND status = 1 AND status_operasional = 'standby';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION transport.incident_set_unit_perbaikan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  IF NEW.tipe IN ('kerusakan', 'breakdown') AND NEW.status_penanganan = 'open' THEN
    UPDATE units
       SET status_operasional = 'perbaikan', updated_at = now()
     WHERE id = NEW.unit_id AND status = 1 AND status_operasional NOT IN ('perbaikan', 'terjual');
  END IF;
  RETURN NEW;
END;
$function$;

-- ── Unit terjual tidak bisa dipakai job ─────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.jobs_cek_unit_terjual()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_kode TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.unit_id IS NOT DISTINCT FROM OLD.unit_id THEN
    RETURN NEW;
  END IF;
  SELECT u.kode_unit INTO v_kode FROM transport.units u
   WHERE u.id = NEW.unit_id AND u.status_operasional::text = 'terjual';
  IF v_kode IS NOT NULL THEN
    RAISE EXCEPTION 'Unit % sudah terjual — tidak bisa dipakai untuk job.', v_kode
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_jobs_cek_unit_terjual ON transport.jobs;
CREATE TRIGGER trg_jobs_cek_unit_terjual BEFORE INSERT OR UPDATE OF unit_id ON transport.jobs
  FOR EACH ROW EXECUTE FUNCTION transport.jobs_cek_unit_terjual();

-- ── Menjual unit: tidak boleh ada job yang belum selesai ────────────────────
CREATE OR REPLACE FUNCTION transport.units_cek_terjual()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_job TEXT;
BEGIN
  IF NEW.status_operasional::text <> 'terjual' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status_operasional::text <> 'terjual' THEN
    SELECT j.job_number INTO v_job FROM transport.jobs j
     WHERE j.unit_id = NEW.id AND j.status = 1
       AND j.status_job NOT IN ('selesai', 'cancelled')
     ORDER BY j.etd LIMIT 1;
    IF v_job IS NOT NULL THEN
      RAISE EXCEPTION 'Unit % tidak bisa diubah menjadi Terjual: masih dipakai job % yang belum selesai.',
        NEW.kode_unit, v_job USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- Unit terjual tidak punya driver default.
  NEW.default_driver_id := NULL;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_units_cek_terjual ON transport.units;
CREATE TRIGGER trg_units_cek_terjual BEFORE INSERT OR UPDATE OF status_operasional, default_driver_id ON transport.units
  FOR EACH ROW EXECUTE FUNCTION transport.units_cek_terjual();

-- ── Laporan utilisasi ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.get_unit_utilization(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(unit_id uuid, kode_unit text, jenis text, hari_bertugas numeric, hari_standby numeric, hari_perbaikan numeric, persentase_utilisasi numeric)
 LANGUAGE plpgsql
 SET search_path TO 'transport', 'extensions'
AS $function$
DECLARE
  v_total_days NUMERIC;
BEGIN
  v_total_days := GREATEST(EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400.0, 0.0001);

  RETURN QUERY
  WITH segments AS (
    SELECT
      u.id AS unit_id,
      u.kode_unit,
      ju.nama AS jenis,
      h.status_new AS kondisi,
      h.changed_at AS started_at,
      LEAD(h.changed_at, 1, p_end_date) OVER (PARTITION BY u.id ORDER BY h.changed_at) AS ended_at
    FROM units u
    JOIN jenis_unit ju ON ju.id = u.jenis_unit_id
    LEFT JOIN LATERAL (
      -- baseline: latest history before p_start_date (or current status if none)
      SELECT
        COALESCE(
          (SELECT us.status_new FROM unit_status_history us
            WHERE us.unit_id = u.id AND us.status = 1 AND us.changed_at < p_start_date
            ORDER BY us.changed_at DESC LIMIT 1),
          u.status_operasional
        ) AS status_new,
        p_start_date AS changed_at
      UNION ALL
      SELECT us2.status_new, us2.changed_at
      FROM unit_status_history us2
      WHERE us2.unit_id = u.id
        AND us2.status = 1
        AND us2.changed_at >= p_start_date
        AND us2.changed_at <  p_end_date
    ) h ON true
    WHERE u.is_active = true AND u.status = 1
  ),
  agg AS (
    SELECT
      s.unit_id,
      s.kode_unit,
      s.jenis,
      SUM(CASE WHEN s.kondisi = 'bertugas'  THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 86400.0 ELSE 0 END) AS hari_bertugas,
      SUM(CASE WHEN s.kondisi = 'standby'   THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 86400.0 ELSE 0 END) AS hari_standby,
      SUM(CASE WHEN s.kondisi = 'perbaikan' THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 86400.0 ELSE 0 END) AS hari_perbaikan,
      -- Hari setelah unit terjual tidak dihitung sebagai hari menganggur.
      SUM(CASE WHEN s.kondisi::text = 'terjual' THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 86400.0 ELSE 0 END) AS hari_terjual
    FROM segments s
    GROUP BY s.unit_id, s.kode_unit, s.jenis
  )
  SELECT
    a.unit_id,
    a.kode_unit,
    a.jenis,
    ROUND(a.hari_bertugas::NUMERIC,  2) AS hari_bertugas,
    ROUND(a.hari_standby::NUMERIC,   2) AS hari_standby,
    ROUND(a.hari_perbaikan::NUMERIC, 2) AS hari_perbaikan,
    ROUND((a.hari_bertugas / GREATEST(v_total_days - a.hari_terjual, 0.0001) * 100)::NUMERIC, 2) AS persentase_utilisasi
  FROM agg a
  -- Unit yang sepanjang periode sudah terjual tidak ikut laporan.
  WHERE v_total_days - a.hari_terjual > 0.0001
  ORDER BY a.hari_bertugas DESC, a.kode_unit;
END;
$function$;

NOTIFY pgrst, 'reload schema';
