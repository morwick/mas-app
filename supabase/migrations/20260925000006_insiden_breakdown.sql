-- ============================================================================
-- Migration 20260925000006: status unit "Breakdown" & alur insiden
--
-- Alur baru status unit dari insiden (semua tipe insiden):
--   * Insiden dicatat / diedit selagi masih "Open"      → unit Breakdown
--   * Admin "Tandai dalam penanganan" (in_progress)     → unit Perbaikan
--   * Admin "Selesaikan perbaikan" (resolved)           → unit Standby
--     (Bertugas bila unit masih punya job yang belum selesai)
--   * Insiden Open dihapus                              → dihitung ulang seperti di atas
-- Status unit dihitung ulang dari SEMUA insiden aktif unit itu: selama masih
-- ada insiden dalam penanganan unit tetap Perbaikan, selama masih ada insiden
-- Open unit tetap Breakdown. Unit terjual / diafkirkan tidak disentuh.
--
-- Aturan insiden (ditegakkan di DB, bukan cuma di UI):
--   * status_penanganan hanya boleh maju: open → in_progress → resolved;
--   * insiden yang sudah dalam penanganan / selesai tidak bisa dihapus;
--   * unit terjual / diafkirkan tidak bisa ditambahkan insiden baru.
--
-- Menggantikan trigger trg_incident_set_unit_perbaikan (dulu: insiden
-- kerusakan/breakdown → unit Perbaikan). Unit dengan status Breakdown juga
-- tidak otomatis jadi Bertugas saat dipakai job, dan hari Breakdown dihitung
-- sebagai hari perbaikan di laporan utilisasi.
--
-- Perubahan data: tidak ada (unit yang sekarang Perbaikan karena insiden Open
-- tetap Perbaikan sampai insidennya ditangani / diselesaikan).
-- ============================================================================

SET search_path = transport, extensions;

ALTER TYPE transport.unit_status ADD VALUE IF NOT EXISTS 'breakdown';

-- ── Transisi status insiden & larangan hapus ────────────────────────────────
CREATE OR REPLACE FUNCTION transport.incident_cek_perubahan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
BEGIN
  IF NEW.status = 2 AND OLD.status = 1 AND OLD.status_penanganan <> 'open' THEN
    RAISE EXCEPTION 'Insiden yang sudah dalam penanganan atau selesai tidak bisa dihapus.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status_penanganan IS DISTINCT FROM OLD.status_penanganan
     AND NOT (OLD.status_penanganan = 'open' AND NEW.status_penanganan = 'in_progress')
     AND NOT (OLD.status_penanganan = 'in_progress' AND NEW.status_penanganan = 'resolved') THEN
    RAISE EXCEPTION 'Status insiden tidak bisa diubah dari % ke %. Alurnya: Open → Dalam penanganan → Selesai.',
      OLD.status_penanganan, NEW.status_penanganan USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_incident_cek_perubahan ON transport.incident_logs;
CREATE TRIGGER trg_incident_cek_perubahan BEFORE UPDATE ON transport.incident_logs
  FOR EACH ROW EXECUTE FUNCTION transport.incident_cek_perubahan();

-- ── Unit terjual / diafkirkan tidak bisa dicatat insiden baru ──────────────
CREATE OR REPLACE FUNCTION transport.incident_cek_unit_armada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_kode TEXT;
  v_status TEXT;
BEGIN
  SELECT u.kode_unit, u.status_operasional::text INTO v_kode, v_status FROM transport.units u
   WHERE u.id = NEW.unit_id AND u.status_operasional::text IN ('terjual', 'diafkirkan');
  IF v_kode IS NOT NULL THEN
    RAISE EXCEPTION 'Unit % sudah % — tidak bisa ditambahkan insiden.', v_kode, v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_incident_cek_unit_armada ON transport.incident_logs;
CREATE TRIGGER trg_incident_cek_unit_armada BEFORE INSERT ON transport.incident_logs
  FOR EACH ROW EXECUTE FUNCTION transport.incident_cek_unit_armada();

-- ── Status unit mengikuti insiden ───────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_incident_set_unit_perbaikan ON transport.incident_logs;
DROP FUNCTION IF EXISTS transport.incident_set_unit_perbaikan();

CREATE OR REPLACE FUNCTION transport.incident_sync_status_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
DECLARE
  v_ada_proses BOOLEAN;
  v_ada_open   BOOLEAN;
  v_target     TEXT;
  v_boleh_dari TEXT[];
  v_note       TEXT;
  v_note_lama  TEXT;
BEGIN
  SELECT COALESCE(bool_or(i.status_penanganan = 'in_progress'), false),
         COALESCE(bool_or(i.status_penanganan = 'open'), false)
    INTO v_ada_proses, v_ada_open
    FROM transport.incident_logs i
   WHERE i.unit_id = NEW.unit_id AND i.status = 1 AND i.status_penanganan <> 'resolved';

  IF v_ada_proses THEN
    v_target := 'perbaikan';
    v_boleh_dari := ARRAY['standby', 'bertugas', 'breakdown'];
    v_note := 'Insiden dalam penanganan';
  ELSIF v_ada_open THEN
    v_target := 'breakdown';
    v_boleh_dari := ARRAY['standby', 'bertugas', 'perbaikan'];
    v_note := 'Insiden ' || NEW.tipe::text || ' dicatat';
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 1 AND OLD.status_penanganan <> 'resolved'
        AND (NEW.status <> 1 OR NEW.status_penanganan = 'resolved') THEN
    -- Insiden terakhir yang belum selesai baru saja diselesaikan / dihapus.
    v_target := CASE WHEN EXISTS (
                  SELECT 1 FROM transport.jobs j
                   WHERE j.unit_id = NEW.unit_id AND j.status = 1
                     AND j.status_job NOT IN ('selesai', 'cancelled'))
                THEN 'bertugas' ELSE 'standby' END;
    v_boleh_dari := ARRAY['breakdown', 'perbaikan'];
    v_note := CASE WHEN NEW.status <> 1 THEN 'Insiden dihapus' ELSE 'Perbaikan insiden selesai' END;
  ELSE
    RETURN NULL;
  END IF;

  -- Alasan ikut tercatat di riwayat status unit (log_unit_status_change).
  v_note_lama := current_setting('app.status_note', true);
  PERFORM set_config('app.status_note', v_note, true);
  UPDATE transport.units
     SET status_operasional = v_target::transport.unit_status, updated_at = now()
   WHERE id = NEW.unit_id AND status = 1
     AND status_operasional::text = ANY (v_boleh_dari);
  PERFORM set_config('app.status_note', COALESCE(v_note_lama, ''), true);

  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_incident_sync_status_unit ON transport.incident_logs;
CREATE TRIGGER trg_incident_sync_status_unit AFTER INSERT OR UPDATE ON transport.incident_logs
  FOR EACH ROW EXECUTE FUNCTION transport.incident_sync_status_unit();

-- ── Job tidak menghidupkan unit breakdown ───────────────────────────────────
-- Versi 000029 + 'breakdown'.
CREATE OR REPLACE FUNCTION transport.sync_unit_status_with_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status_job NOT IN ('selesai', 'cancelled') THEN
    UPDATE units SET status_operasional = 'bertugas', updated_at = now()
     WHERE id = NEW.unit_id AND status = 1
       AND status_operasional::text NOT IN ('perbaikan', 'breakdown', 'terjual', 'diafkirkan');
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

-- ── Laporan utilisasi: Breakdown dihitung sebagai hari perbaikan ────────────
-- Versi 000029, hanya CASE hari_perbaikan yang berubah.
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
      SUM(CASE WHEN s.kondisi::text IN ('perbaikan', 'breakdown') THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 86400.0 ELSE 0 END) AS hari_perbaikan,
      -- Hari setelah unit terjual / diafkirkan tidak dihitung sebagai hari menganggur.
      SUM(CASE WHEN s.kondisi::text IN ('terjual', 'diafkirkan') THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 86400.0 ELSE 0 END) AS hari_terjual
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
  -- Unit yang sepanjang periode sudah terjual / diafkirkan tidak ikut laporan.
  WHERE v_total_days - a.hari_terjual > 0.0001
  ORDER BY a.hari_bertugas DESC, a.kode_unit;
END;
$function$;

NOTIFY pgrst, 'reload schema';
