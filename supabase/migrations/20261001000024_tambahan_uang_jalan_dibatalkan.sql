-- ============================================================================
-- Migration 20261001000024: pengajuan tambahan uang jalan yang dibatalkan
--
-- Tambahan uang jalan yang dihapus (status = 2) selama masih menunggu approval
-- membuat pengajuannya 'dibatalkan' (migration 20261001000010). Barisnya tidak
-- terbaca lagi lewat klien data biasa (select otomatis status = 1), padahal
-- riwayat uang jalan di detail job tetap menampilkannya sebagai "Dibatalkan".
--
-- Fungsi baca-saja ini mengembalikan baris tambahan uang jalan job itu yang
-- dihapus DAN pengajuannya dibatalkan. Tidak ikut dihitung ke uang jalan job.
-- BATASAN: hanya staf aktif yang berhak atas job itu (can_access_job).
--
-- Tidak ada perubahan data. Aman dijalankan ulang.
-- WAJIB: jalankan setelah 20261001000023. Naikkan backend & frontend bersamaan.
-- ============================================================================

SET search_path = transport, extensions;

CREATE OR REPLACE FUNCTION transport.tambahan_uang_jalan_dibatalkan(p_job_id UUID)
RETURNS TABLE (id UUID, tanggal DATE, jumlah BIGINT, keperluan TEXT, catatan TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = transport, extensions
AS $$
  SELECT u.id, u.tanggal, u.jumlah::BIGINT, u.keperluan, u.catatan, u.created_at
    FROM transport.uang_jalan u
   WHERE u.job_id = p_job_id
     AND u.jenis = 'tambahan'
     AND u.status = 2
     AND transport.is_active_admin()
     AND transport.can_access_job(p_job_id)
     AND EXISTS (SELECT 1 FROM transport.pengajuan_approval a
                  WHERE a.fitur_kode = 'tambahan_uang_jalan' AND a.ref_id = u.id
                    AND a.status = 1 AND a.status_approval = 'dibatalkan')
   ORDER BY u.tanggal, u.created_at;
$$;
REVOKE ALL ON FUNCTION transport.tambahan_uang_jalan_dibatalkan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transport.tambahan_uang_jalan_dibatalkan(UUID) TO authenticated;
