-- ============================================================================
-- Migration 20260929000001: dokumen opsional di form master
--
-- Form tambah / edit bisa melampirkan scan / foto dokumen (PDF, JPG, PNG,
-- WEBP; maks. 10 MB). Semuanya TIDAK wajib.
--   * Driver       : SIM          → drivers.sim_path
--   * Unit         : STNK & KIR   → units.stnk_path, units.kir_path
--   * Unit Trailer : KIR & SRUT   → unit_trailer.kir_path, unit_trailer.srut_path
-- Tiap dokumen punya pasangan kolom `<jenis>_uploaded_at`. File disimpan di
-- bucket privat `dokumen-master` (folder <tabel>/<id>/), dibuka lewat signed
-- URL dari backend. Perubahan kolom ikut tercatat di log sistem lewat trigger
-- trg_log_sistem yang sudah terpasang di ketiga tabel.
-- WAJIB: naikkan backend & frontend bersamaan.
-- Perubahan data: tidak ada.
-- ============================================================================

SET search_path = transport, extensions;

ALTER TABLE transport.drivers ADD COLUMN IF NOT EXISTS sim_path TEXT;
ALTER TABLE transport.drivers ADD COLUMN IF NOT EXISTS sim_uploaded_at TIMESTAMPTZ;

ALTER TABLE transport.units ADD COLUMN IF NOT EXISTS stnk_path TEXT;
ALTER TABLE transport.units ADD COLUMN IF NOT EXISTS stnk_uploaded_at TIMESTAMPTZ;
ALTER TABLE transport.units ADD COLUMN IF NOT EXISTS kir_path TEXT;
ALTER TABLE transport.units ADD COLUMN IF NOT EXISTS kir_uploaded_at TIMESTAMPTZ;

ALTER TABLE transport.unit_trailer ADD COLUMN IF NOT EXISTS kir_path TEXT;
ALTER TABLE transport.unit_trailer ADD COLUMN IF NOT EXISTS kir_uploaded_at TIMESTAMPTZ;
ALTER TABLE transport.unit_trailer ADD COLUMN IF NOT EXISTS srut_path TEXT;
ALTER TABLE transport.unit_trailer ADD COLUMN IF NOT EXISTS srut_uploaded_at TIMESTAMPTZ;

-- Bucket dokumen (privat, pola sama seperti bukti-penghapusan).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dokumen-master', 'dokumen-master', false, 10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "admins_all_dokumen_master" ON storage.objects;
CREATE POLICY "admins_all_dokumen_master"
  ON storage.objects FOR ALL
  USING (bucket_id = 'dokumen-master' AND transport.storage_is_active_admin())
  WITH CHECK (bucket_id = 'dokumen-master' AND transport.storage_is_active_admin());

NOTIFY pgrst, 'reload schema';
