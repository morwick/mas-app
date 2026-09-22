-- ============================================================================
-- Migration 10: Incident log per unit
--
-- Admin catat insiden (kecelakaan/kerusakan/breakdown/lainnya) per unit
-- dengan foto bukti, biaya repair, dan status open → in_progress → resolved.
-- Trigger: kalau tipe = kerusakan/breakdown dan status open, auto-set unit
-- ke 'perbaikan'. Saat resolve, admin yang putuskan via UI kapan unit
-- kembali ke 'standby' (tidak auto-revert agar admin tetap kontrol).
-- ============================================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE incident_type AS ENUM ('kecelakaan', 'kerusakan', 'breakdown', 'lainnya');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM ('open', 'in_progress', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabel incident_logs
CREATE TABLE IF NOT EXISTS incident_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id        UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  job_id         UUID REFERENCES jobs(id) ON DELETE SET NULL,
  tipe           incident_type NOT NULL,
  tanggal        TIMESTAMPTZ NOT NULL DEFAULT now(),
  lokasi         TEXT,
  deskripsi      TEXT NOT NULL,
  biaya_repair   NUMERIC(15, 2),
  vendor_repair  TEXT,
  status         incident_status NOT NULL DEFAULT 'open',
  resolved_at    TIMESTAMPTZ,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_unit
  ON incident_logs(unit_id, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_incident_status
  ON incident_logs(status);
CREATE INDEX IF NOT EXISTS idx_incident_job
  ON incident_logs(job_id)
  WHERE job_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_incident_logs_updated_at ON incident_logs;
CREATE TRIGGER trg_incident_logs_updated_at
  BEFORE UPDATE ON incident_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabel incident_photos
CREATE TABLE IF NOT EXISTS incident_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  UUID NOT NULL REFERENCES incident_logs(id) ON DELETE CASCADE,
  file_path    TEXT NOT NULL,
  file_size    INTEGER,
  uploaded_by  UUID REFERENCES profiles(id),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_photos_incident
  ON incident_photos(incident_id);

-- ---------------------------------------------------------------------------
-- Trigger: auto-set unit ke 'perbaikan' saat insiden kerusakan/breakdown
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION incident_set_unit_perbaikan()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipe IN ('kerusakan', 'breakdown') AND NEW.status = 'open' THEN
    UPDATE units
       SET status = 'perbaikan', updated_at = now()
     WHERE id = NEW.unit_id AND status <> 'perbaikan';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_incident_set_unit_perbaikan ON incident_logs;
CREATE TRIGGER trg_incident_set_unit_perbaikan
  AFTER INSERT ON incident_logs
  FOR EACH ROW
  EXECUTE FUNCTION incident_set_unit_perbaikan();

-- ---------------------------------------------------------------------------
-- Trigger: set resolved_at saat status berubah ke resolved
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION incident_set_resolved_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') THEN
    NEW.resolved_at := now();
  ELSIF NEW.status <> 'resolved' THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_incident_set_resolved_at ON incident_logs;
CREATE TRIGGER trg_incident_set_resolved_at
  BEFORE UPDATE OF status ON incident_logs
  FOR EACH ROW
  EXECUTE FUNCTION incident_set_resolved_at();

-- ---------------------------------------------------------------------------
-- RLS policies (admin-only — tidak ada akses public)
-- ---------------------------------------------------------------------------
ALTER TABLE incident_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_incident_logs" ON incident_logs;
CREATE POLICY "admin_all_incident_logs"
  ON incident_logs FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

ALTER TABLE incident_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_incident_photos" ON incident_photos;
CREATE POLICY "admin_all_incident_photos"
  ON incident_photos FOR ALL
  USING (is_active_admin())
  WITH CHECK (is_active_admin());

-- ---------------------------------------------------------------------------
-- Storage bucket incident-photos
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'incident-photos',
  'incident-photos',
  true,
  5 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "admins_upload_incident_photos" ON storage.objects;
CREATE POLICY "admins_upload_incident_photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'incident-photos' AND storage_is_active_admin());

DROP POLICY IF EXISTS "admins_update_incident_photos" ON storage.objects;
CREATE POLICY "admins_update_incident_photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'incident-photos' AND storage_is_active_admin());

DROP POLICY IF EXISTS "admins_delete_incident_photos" ON storage.objects;
CREATE POLICY "admins_delete_incident_photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'incident-photos' AND storage_is_active_admin());

DROP POLICY IF EXISTS "public_read_incident_photos" ON storage.objects;
CREATE POLICY "public_read_incident_photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'incident-photos');
