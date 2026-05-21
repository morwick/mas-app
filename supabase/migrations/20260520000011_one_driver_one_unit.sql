-- ============================================================================
-- Migration 11: 1 driver = 1 unit (enforcement)
--
-- Sebelumnya driver bisa jadi default_driver di banyak unit. Sekarang aturan
-- bisnis berubah: setiap driver hanya boleh terdaftar sebagai driver tetap
-- pada satu unit aktif. Inactive units di-exclude supaya tidak menghambat
-- reassign setelah unit di-nonaktifkan.
-- ============================================================================

-- Drop index lama (non-unique)
DROP INDEX IF EXISTS idx_units_default_driver;

-- Bersihkan data ambigu kalau ada (lepas default_driver di unit yang lebih lama
-- jika satu driver terikat ke >1 unit aktif). Yang dipertahankan adalah unit
-- dengan created_at paling baru (asumsi yang paling relevan).
WITH ranked AS (
  SELECT
    id,
    default_driver_id,
    ROW_NUMBER() OVER (
      PARTITION BY default_driver_id
      ORDER BY created_at DESC, id
    ) AS rn
  FROM units
  WHERE default_driver_id IS NOT NULL
    AND is_active = TRUE
)
UPDATE units u
SET default_driver_id = NULL
FROM ranked r
WHERE u.id = r.id
  AND r.rn > 1;

-- Unique partial index: 1 driver hanya boleh jadi default di 1 unit aktif
CREATE UNIQUE INDEX IF NOT EXISTS units_default_driver_unique
  ON units(default_driver_id)
  WHERE default_driver_id IS NOT NULL AND is_active = TRUE;
