-- ============================================================================
-- Migration 12: Service tracking & odometer
--
-- Setup tracking servis berkala per unit (default tiap 10.000 km).
-- Odometer di-akumulasikan dari snapshot harian TrackSolid totalMileage:
--   - cron jam-an UPSERT (unit_id, tanggal) → daily_km
--   - trigger maintain units.current_odometer_km = baseline + SUM(daily_km)
-- Service records: admin catat tanggal + odometer + jenis. last_service
-- di-derive sebagai MAX(odometer_km) — tidak disimpan terpisah.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Kolom odometer di units
-- ---------------------------------------------------------------------------
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS odometer_baseline_km  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_odometer_km   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_interval_km   INTEGER        NOT NULL DEFAULT 10000;

-- ---------------------------------------------------------------------------
-- Tabel unit_odometer_snapshots
-- daily_km = totalMileage dari TrackSolid getPointList untuk tanggal itu.
-- UPSERT-friendly: composite PK (unit_id, tanggal). Polling jam-an overwrite
-- daily_km dengan angka terakhir; di hari berikutnya, snapshot kemarin sudah
-- final (TrackSolid reset counter ke 0).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unit_odometer_snapshots (
  unit_id     UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tanggal     DATE NOT NULL,
  daily_km    NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (daily_km >= 0),
  source      TEXT NOT NULL DEFAULT 'tracksolid'
              CHECK (source IN ('tracksolid', 'manual')),
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (unit_id, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_odometer_snapshots_tanggal
  ON unit_odometer_snapshots(tanggal DESC);

-- ---------------------------------------------------------------------------
-- Enum + tabel service_records
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE service_jenis AS ENUM ('rutin', 'oli', 'ban', 'mesin', 'lainnya');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS service_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id      UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tanggal      DATE NOT NULL DEFAULT CURRENT_DATE,
  odometer_km  NUMERIC(12, 2) NOT NULL CHECK (odometer_km >= 0),
  jenis        service_jenis NOT NULL DEFAULT 'rutin',
  catatan      TEXT,
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_records_unit
  ON service_records(unit_id, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_service_records_unit_odo
  ON service_records(unit_id, odometer_km DESC);

DROP TRIGGER IF EXISTS trg_service_records_updated_at ON service_records;
CREATE TRIGGER trg_service_records_updated_at
  BEFORE UPDATE ON service_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Functions: recompute current_odometer_km dari snapshot SUM + baseline
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recompute_unit_odometer(p_unit UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE units u
     SET current_odometer_km = u.odometer_baseline_km + COALESCE((
           SELECT SUM(daily_km)::NUMERIC(12, 2)
             FROM unit_odometer_snapshots
            WHERE unit_id = p_unit
         ), 0),
         updated_at = now()
   WHERE u.id = p_unit;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Trigger: setelah INSERT/UPDATE/DELETE pada snapshot → recompute unit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_snapshot_update_odometer()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM recompute_unit_odometer(COALESCE(NEW.unit_id, OLD.unit_id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_odo_snap_after ON unit_odometer_snapshots;
CREATE TRIGGER trg_odo_snap_after
  AFTER INSERT OR UPDATE OR DELETE ON unit_odometer_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION trg_snapshot_update_odometer();

-- ---------------------------------------------------------------------------
-- Trigger: saat odometer_baseline_km diubah → recompute
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_unit_baseline_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.odometer_baseline_km IS DISTINCT FROM OLD.odometer_baseline_km THEN
    PERFORM recompute_unit_odometer(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unit_baseline ON units;
CREATE TRIGGER trg_unit_baseline
  AFTER UPDATE OF odometer_baseline_km ON units
  FOR EACH ROW
  EXECUTE FUNCTION trg_unit_baseline_change();

-- ---------------------------------------------------------------------------
-- RLS — admin-only untuk service_records; snapshot read-only untuk admin
-- (INSERT/UPDATE hanya via service-role di cron)
-- ---------------------------------------------------------------------------
ALTER TABLE service_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_service_records" ON service_records;
CREATE POLICY "admin_all_service_records"
  ON service_records FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

ALTER TABLE unit_odometer_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_odometer_snapshots" ON unit_odometer_snapshots;
CREATE POLICY "admin_read_odometer_snapshots"
  ON unit_odometer_snapshots FOR SELECT
  USING (is_active_admin());

-- Tidak ada INSERT/UPDATE/DELETE policy untuk role anon/authenticated.
-- Service role bypass RLS — dipakai cron untuk UPSERT.
