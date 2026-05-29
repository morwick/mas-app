-- ============================================================================
-- Migration 15: Tambah route_duration_min untuk prediksi ETA
--
-- Disimpan dalam menit (NUMERIC) supaya bisa di-derive ke avg_speed_kmh =
-- (distance_km / duration_min) * 60. Avg speed ini lebih akurat ketimbang
-- pakai 1 nilai global karena ORS sudah hitung berdasarkan jenis jalan,
-- ferry crossings, traffic model, dll.
--
-- Nullable supaya backward-compat dengan job yang dibuat sebelum migration.
-- Fallback di code: pakai 40 km/h kalau duration_min null.
-- ============================================================================

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS route_duration_min NUMERIC(8, 1);
