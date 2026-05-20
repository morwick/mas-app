-- ============================================================================
-- Migration 05: Seed master data
-- ============================================================================

INSERT INTO jenis_unit (nama) VALUES
  ('Lowbed'),
  ('Highbed'),
  ('Self Loader'),
  ('Engkel')
ON CONFLICT (nama) DO NOTHING;
