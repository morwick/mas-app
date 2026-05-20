-- ============================================================================
-- Migration 09: Default driver per unit
--
-- Setiap unit dapat punya driver tetap. Saat membuat Job baru, driver otomatis
-- terisi dengan default_driver_id unit (masih bisa di-override per-job).
-- Driver-unit relationship: many-to-one (1 driver bisa jadi default di banyak
-- unit, 1 unit hanya punya 1 default driver).
-- ============================================================================

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS default_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_units_default_driver
  ON units(default_driver_id)
  WHERE default_driver_id IS NOT NULL;
