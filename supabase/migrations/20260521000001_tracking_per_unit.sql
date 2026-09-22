-- ============================================================================
-- Migration: Pindahkan tracking GPS dari Job ke Unit
--
-- Tracking GPS device (IMEI) inheren di truk, bukan per-pengiriman. Skema lama
-- menyimpan tracksolid_share_link per Job → admin harus paste ulang setiap kali
-- bikin job baru. Skema baru menyimpan IMEI di Unit → input sekali saat
-- daftarkan truk, otomatis ikut ke semua job berikutnya.
--
-- imei_gps              : ID device TrackSolid (extracted dari URL share link)
-- tracksolid_share_link : link mentah, disimpan untuk tombol "Buka di TrackSolid"
-- ============================================================================

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS imei_gps              TEXT,
  ADD COLUMN IF NOT EXISTS tracksolid_share_link TEXT;

-- Field per-job dihapus — sumber kebenaran tunggal sekarang di Unit
ALTER TABLE jobs
  DROP COLUMN IF EXISTS tracksolid_share_link;
