-- ============================================================================
-- Migration 20260925000002: "Berlaku sampai" wajib diisi di penawaran
--
-- Backend & form sekarang mewajibkan tanggal berlaku surat saat tambah/edit
-- penawaran (status "kedaluwarsa" diturunkan dari sini, lihat derive_status()
-- di quotations/service.py). Data lama yang masih NULL diisi otomatis
-- tanggal surat + 1 bulan, supaya konsisten sebelum kolomnya dikunci NOT NULL.
--
-- Perubahan data: YA (quotations.berlaku_sampai yang NULL) — dicatat di log
-- sistem atas nama superadmin aktif paling awal, keterangan
-- "Migrasi 20260925000002" (pola sama seperti migration 20260924000024).
-- ============================================================================

SET search_path = transport, extensions;

DO $$
DECLARE
  v_admin UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM transport.quotations WHERE berlaku_sampai IS NULL) THEN
    RETURN;
  END IF;
  SELECT p.karyawan_id INTO v_admin FROM transport.profiles p
   WHERE p.role = 'superadmin' AND p.is_active AND p.status = 1
   ORDER BY p.created_at LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Tidak ada superadmin aktif untuk mencatat pengisian berlaku_sampai.';
  END IF;
  PERFORM transport.mulai_sesi_manual(v_admin, 'Migrasi 20260925000002');
  UPDATE transport.quotations
     SET berlaku_sampai = (tanggal + INTERVAL '1 month')::date
   WHERE berlaku_sampai IS NULL;
  PERFORM transport.selesai_sesi_manual();
END $$;

ALTER TABLE transport.quotations ALTER COLUMN berlaku_sampai SET NOT NULL;

NOTIFY pgrst, 'reload schema';
