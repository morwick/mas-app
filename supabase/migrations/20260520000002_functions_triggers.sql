-- ============================================================================
-- Migration 02: Database functions & business-logic triggers
-- ============================================================================

-- ---------------------------------------------------------------------------
-- gen_job_number: produces JOB-YYYY-NNN where NNN is sequential per year
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gen_job_number()
RETURNS TEXT AS $$
DECLARE
  v_year TEXT;
  v_seq INTEGER;
BEGIN
  v_year := to_char(now(), 'YYYY');

  SELECT COALESCE(MAX(CAST(SPLIT_PART(job_number, '-', 3) AS INTEGER)), 0) + 1
  INTO v_seq
  FROM jobs
  WHERE job_number LIKE 'JOB-' || v_year || '-%';

  RETURN 'JOB-' || v_year || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- gen_share_token: 32-char url-safe base64
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION gen_share_token()
RETURNS TEXT AS $$
BEGIN
  RETURN translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Trigger: auto-fill job_number & share_token on insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_job_defaults()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_number IS NULL OR NEW.job_number = '' THEN
    NEW.job_number := gen_job_number();
  END IF;
  IF NEW.share_token IS NULL OR NEW.share_token = '' THEN
    NEW.share_token := gen_share_token();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_defaults ON jobs;
CREATE TRIGGER trg_job_defaults
  BEFORE INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_job_defaults();

-- ---------------------------------------------------------------------------
-- Trigger: log job status changes + set completed_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_job_status_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO job_status_history (job_id, status_old, status_new, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());

    IF NEW.status = 'selesai' AND OLD.status <> 'selesai' THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_job_status ON jobs;
CREATE TRIGGER trg_log_job_status
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION log_job_status_change();

-- ---------------------------------------------------------------------------
-- Trigger: log first job status (insert) → history
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_job_status_on_insert()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO job_status_history (job_id, status_old, status_new, changed_by)
  VALUES (NEW.id, NULL, NEW.status, NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_job_status_insert ON jobs;
CREATE TRIGGER trg_log_job_status_insert
  AFTER INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION log_job_status_on_insert();

-- ---------------------------------------------------------------------------
-- Trigger: sync unit status when job assigned / completed / cancelled
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_unit_status_with_job()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status IN ('menunggu_pickup', 'loading', 'dalam_perjalanan', 'unloading') THEN
    UPDATE units
       SET status = 'bertugas', updated_at = now()
     WHERE id = NEW.unit_id AND status <> 'perbaikan';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status IN ('selesai', 'cancelled') THEN
      UPDATE units
         SET status = 'standby', updated_at = now()
       WHERE id = NEW.unit_id AND status = 'bertugas';
    ELSIF NEW.status IN ('menunggu_pickup', 'loading', 'dalam_perjalanan', 'unloading')
          AND OLD.status IN ('selesai', 'cancelled') THEN
      UPDATE units
         SET status = 'bertugas', updated_at = now()
       WHERE id = NEW.unit_id AND status = 'standby';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_unit_status ON jobs;
CREATE TRIGGER trg_sync_unit_status
  AFTER INSERT OR UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION sync_unit_status_with_job();

-- ---------------------------------------------------------------------------
-- Trigger: log unit status changes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_unit_status_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO unit_status_history (unit_id, status_old, status_new, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_unit_status ON units;
CREATE TRIGGER trg_log_unit_status
  AFTER UPDATE OF status ON units
  FOR EACH ROW
  EXECUTE FUNCTION log_unit_status_change();

-- ---------------------------------------------------------------------------
-- handle_new_user: auto-insert profile row when an auth user signs up
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, nama, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nama', split_part(NEW.email, '@', 1)),
    'admin'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------------
-- RPC: get_unit_utilization
-- Calculates days spent in each status within the given range, per active unit.
-- Uses unit_status_history as source of truth — current status is treated as
-- still ongoing through the period's end.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_unit_utilization(
  p_start_date TIMESTAMPTZ,
  p_end_date   TIMESTAMPTZ
)
RETURNS TABLE (
  unit_id              UUID,
  kode_unit            TEXT,
  jenis                TEXT,
  hari_bertugas        NUMERIC,
  hari_standby         NUMERIC,
  hari_perbaikan       NUMERIC,
  persentase_utilisasi NUMERIC
)
LANGUAGE plpgsql
AS $$
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
      h.status_new AS status,
      h.changed_at AS started_at,
      LEAD(h.changed_at, 1, p_end_date) OVER (PARTITION BY u.id ORDER BY h.changed_at) AS ended_at
    FROM units u
    JOIN jenis_unit ju ON ju.id = u.jenis_unit_id
    LEFT JOIN LATERAL (
      -- baseline: latest history before p_start_date (or current status if none)
      SELECT
        COALESCE(
          (SELECT us.status_new FROM unit_status_history us
            WHERE us.unit_id = u.id AND us.changed_at < p_start_date
            ORDER BY us.changed_at DESC LIMIT 1),
          u.status
        ) AS status_new,
        p_start_date AS changed_at
      UNION ALL
      SELECT us2.status_new, us2.changed_at
      FROM unit_status_history us2
      WHERE us2.unit_id = u.id
        AND us2.changed_at >= p_start_date
        AND us2.changed_at <  p_end_date
    ) h ON true
    WHERE u.is_active = true
  ),
  agg AS (
    SELECT
      s.unit_id,
      s.kode_unit,
      s.jenis,
      SUM(CASE WHEN s.status = 'bertugas'  THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 86400.0 ELSE 0 END) AS hari_bertugas,
      SUM(CASE WHEN s.status = 'standby'   THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 86400.0 ELSE 0 END) AS hari_standby,
      SUM(CASE WHEN s.status = 'perbaikan' THEN EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 86400.0 ELSE 0 END) AS hari_perbaikan
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
    ROUND((a.hari_bertugas / v_total_days * 100)::NUMERIC, 2) AS persentase_utilisasi
  FROM agg a
  ORDER BY a.hari_bertugas DESC, a.kode_unit;
END;
$$;
