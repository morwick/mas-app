-- ============================================================================
-- Migration 20260924000024: kode slot foto 'surat_timbang' → 'surat_jalan'
--
-- Lanjutan migration 000023 (yang baru mengganti teks). Sekarang kode slotnya
-- juga diganti:
--   * Foto yang sudah tersimpan (termasuk yang sudah di-soft delete) diubah
--     slot-nya ke 'surat_jalan'. File di storage tidak dipindah — path lama
--     tetap sah, hanya kolom slot yang berubah.
--   * Constraint slot & job_stage_complete() memakai 'surat_jalan'.
--   * Kompatibilitas: aplikasi driver versi lama yang masih mengirim
--     'surat_timbang' otomatis diubah ke 'surat_jalan' (trigger di bawah;
--     backend juga menormalkannya sebelum memanggil database).
--
-- Perubahan data: YA (job_photos.slot) — dicatat di log sistem atas nama
-- superadmin aktif paling awal, keterangan "Migrasi 20260924000024".
-- ============================================================================

SET search_path = transport, extensions;

-- ── 1. Constraint lama dilepas dulu supaya nilai baru bisa masuk ───────────
ALTER TABLE transport.job_photos DROP CONSTRAINT IF EXISTS job_photos_slot_check;

-- ── 2. Kompatibilitas nilai lama ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transport.job_photos_normalisasi_slot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = transport, extensions
AS $$
BEGIN
  IF NEW.slot = 'surat_timbang' THEN
    NEW.slot := 'surat_jalan';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_job_photos_normalisasi_slot ON transport.job_photos;
CREATE TRIGGER trg_job_photos_normalisasi_slot BEFORE INSERT OR UPDATE OF slot ON transport.job_photos
  FOR EACH ROW EXECUTE FUNCTION transport.job_photos_normalisasi_slot();

-- ── 3. Data lama ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_admin UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM transport.job_photos WHERE slot = 'surat_timbang') THEN
    RETURN;
  END IF;
  SELECT p.karyawan_id INTO v_admin FROM transport.profiles p
   WHERE p.role = 'superadmin' AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat perubahan slot foto.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_admin, 'Migrasi 20260924000024');
  UPDATE transport.job_photos SET slot = 'surat_jalan' WHERE slot = 'surat_timbang';
  PERFORM transport.selesai_sesi_manual();
END $$;

-- ── 4. Aturan slot memakai kode baru ────────────────────────────────────────
ALTER TABLE transport.job_photos ADD CONSTRAINT job_photos_slot_check
  CHECK (
    slot IS NULL
    OR (stage IN ('loading', 'unloading')
        AND slot IN ('depan', 'belakang', 'kanan', 'kiri', 'surat_jalan'))
    OR (stage = 'serah_terima' AND slot = 'serah_terima')
  );

CREATE OR REPLACE FUNCTION transport.job_stage_complete(p_job_id uuid, p_stage text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'transport'
AS $function$
  SELECT CASE p_stage
    WHEN 'serah_terima' THEN EXISTS (
      SELECT 1 FROM job_photos
      WHERE job_id = p_job_id AND status = 1 AND stage = 'serah_terima' AND slot = 'serah_terima')
    ELSE (
      SELECT COUNT(DISTINCT slot) = 5 FROM job_photos
      WHERE job_id = p_job_id AND status = 1 AND stage = p_stage
        AND slot IN ('depan', 'belakang', 'kanan', 'kiri', 'surat_jalan'))
  END;
$function$;

NOTIFY pgrst, 'reload schema';
