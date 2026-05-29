-- ============================================================================
-- Migration 14: Koordinat asal/tujuan + polyline rute untuk job
--
-- Tambah dukungan rute visual di halaman tracking customer:
--   - asal_lat/lng, tujuan_lat/lng: pin point di peta saat admin buat job
--   - route_polyline: encoded polyline (Google format) hasil routing ORS
--   - route_distance_km: jarak total via jalan
--
-- Semua kolom nullable supaya backward-compat dengan job existing yang
-- belum punya koordinat. UI akan render polyline kalau ada, fallback ke
-- marker truk + text address kalau tidak.
-- ============================================================================

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS asal_lat          NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS asal_lng          NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS tujuan_lat        NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS tujuan_lng        NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS route_polyline    TEXT,
  ADD COLUMN IF NOT EXISTS route_distance_km NUMERIC(8, 2);

-- Sanity check: lat ±90, lng ±180.
ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_asal_latlng_valid,
  DROP CONSTRAINT IF EXISTS jobs_tujuan_latlng_valid;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_asal_latlng_valid CHECK (
    (asal_lat IS NULL AND asal_lng IS NULL)
    OR (asal_lat BETWEEN -90 AND 90 AND asal_lng BETWEEN -180 AND 180)
  ),
  ADD CONSTRAINT jobs_tujuan_latlng_valid CHECK (
    (tujuan_lat IS NULL AND tujuan_lng IS NULL)
    OR (tujuan_lat BETWEEN -90 AND 90 AND tujuan_lng BETWEEN -180 AND 180)
  );
