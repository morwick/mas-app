-- ============================================================================
-- Migration 01: Initial schema
-- Tables: profiles, jenis_unit, units, unit_status_history, drivers, customers,
--         jobs, job_status_history, job_photos
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE unit_status AS ENUM ('standby', 'bertugas', 'perbaikan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM (
    'menunggu_pickup', 'loading', 'dalam_perjalanan',
    'unloading', 'selesai', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE photo_type AS ENUM ('loading', 'unloading');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  nama        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'admin',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- jenis_unit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jenis_unit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama        TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- units
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS units (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_unit     TEXT NOT NULL UNIQUE,
  jenis_unit_id UUID NOT NULL REFERENCES jenis_unit(id),
  no_polisi     TEXT NOT NULL,
  tahun         INTEGER,
  status        unit_status NOT NULL DEFAULT 'standby',
  catatan       TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_units_status ON units(status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_units_jenis  ON units(jenis_unit_id);
CREATE INDEX IF NOT EXISTS idx_units_kode   ON units(kode_unit);

-- ---------------------------------------------------------------------------
-- unit_status_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unit_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  status_old  unit_status,
  status_new  unit_status NOT NULL,
  changed_by  UUID REFERENCES profiles(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason      TEXT
);

CREATE INDEX IF NOT EXISTS idx_unit_history_unit
  ON unit_status_history(unit_id, changed_at DESC);

-- ---------------------------------------------------------------------------
-- drivers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama        TEXT NOT NULL,
  no_hp       TEXT NOT NULL,
  no_sim      TEXT,
  alamat      TEXT,
  catatan     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drivers_active ON drivers(is_active);

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_perusahaan TEXT NOT NULL,
  alamat          TEXT,
  catatan         TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number            TEXT NOT NULL UNIQUE,
  share_token           TEXT NOT NULL UNIQUE,
  customer_id           UUID NOT NULL REFERENCES customers(id),
  pic_nama              TEXT,
  pic_no_hp             TEXT,
  alat_diangkut         TEXT NOT NULL,
  asal                  TEXT NOT NULL,
  tujuan                TEXT NOT NULL,
  unit_id               UUID NOT NULL REFERENCES units(id),
  driver_id             UUID NOT NULL REFERENCES drivers(id),
  etd                   TIMESTAMPTZ NOT NULL,
  eta                   TIMESTAMPTZ,
  tracksolid_share_link TEXT,
  status                job_status NOT NULL DEFAULT 'menunggu_pickup',
  catatan               TEXT,
  cancelled_reason      TEXT,
  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_status      ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_customer    ON jobs(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_unit        ON jobs(unit_id);
CREATE INDEX IF NOT EXISTS idx_jobs_share_token ON jobs(share_token);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at  ON jobs(created_at DESC);

-- ---------------------------------------------------------------------------
-- job_status_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status_old  job_status,
  status_new  job_status NOT NULL,
  changed_by  UUID REFERENCES profiles(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_history_job
  ON job_status_history(job_id, changed_at DESC);

-- ---------------------------------------------------------------------------
-- job_photos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type         photo_type NOT NULL,
  file_path    TEXT NOT NULL,
  file_size    INTEGER,
  uploaded_by  UUID REFERENCES profiles(id),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_photos_job ON job_photos(job_id, type);

-- ---------------------------------------------------------------------------
-- updated_at triggers (shared helper)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at  ON profiles;
CREATE TRIGGER trg_profiles_updated_at  BEFORE UPDATE ON profiles  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_units_updated_at     ON units;
CREATE TRIGGER trg_units_updated_at     BEFORE UPDATE ON units     FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_drivers_updated_at   ON drivers;
CREATE TRIGGER trg_drivers_updated_at   BEFORE UPDATE ON drivers   FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_jobs_updated_at      ON jobs;
CREATE TRIGGER trg_jobs_updated_at      BEFORE UPDATE ON jobs      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
